import {
  AiProviderError,
  OpenAiProvider,
  resolveOpenAiProviderRouting,
  type AiImageAsset,
} from '@image-set/ai-provider';
import {
  createDatabaseClient,
  migrateDatabase,
  type DatabaseClient,
} from '@image-set/database';
import { buildImagePrompt } from '@image-set/image-layout';
import {
  generationSnapshotSchema,
  IMAGE_ROLES,
  imageQueuePayloadSchema,
  type ConsistencyReviewResult,
  type GenerationSnapshot,
  type ImageQueuePayload,
  type ImageRole,
} from '@image-set/shared';
import {
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import type { Job } from 'bullmq';
import { Client as MinioClient } from 'minio';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

type RuntimeJob = {
  id: string;
  projectId: string;
  userId: string;
  imageRole: ImageRole;
  status: string;
  inputSnapshot: GenerationSnapshot;
  idempotencyKey: string;
  creditsReserved: number;
};

type StoredAsset = {
  id: string;
  objectKey: string;
  mimeType: string;
};

@Injectable()
export class ImageGenerationRuntime
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(ImageGenerationRuntime.name);
  private readonly database: DatabaseClient = createDatabaseClient(
    required('DATABASE_URL'),
  );
  private readonly storage = this.createStorage();
  private readonly bucket = required('S3_BUCKET');
  private providers?: Record<'analysis' | 'image' | 'review', OpenAiProvider>;

  async onModuleInit(): Promise<void> {
    await migrateDatabase(this.database.pool);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.database.pool.end();
  }

  async process(job: Job<ImageQueuePayload>): Promise<{ assetId?: string }> {
    const payload = imageQueuePayloadSchema.parse(job.data);
    const runtimeJob = await this.start(payload.jobId);
    if (!runtimeJob) return {};
    const snapshot = generationSnapshotSchema.parse(runtimeJob.inputSnapshot);
    let objectKey: string | undefined;
    try {
      const [productAssets, referenceAssets] = await Promise.all([
        this.loadAssets(runtimeJob, snapshot.productAssetIds, 'product'),
        this.loadAssets(runtimeJob, snapshot.referenceAssetIds, 'reference'),
      ]);
      await this.progress(runtimeJob.id, 30, 'generating');
      const generated = await this.ai('image').generateImage({
        role: snapshot.role,
        prompt: buildImagePrompt({
          role: snapshot.role,
          targetPlatform: snapshot.targetPlatform,
          targetLocale: snapshot.targetLocale,
          analysis: snapshot.analysis,
          productReferenceCount: productAssets.length,
          styleReferenceCount: referenceAssets.length,
        }),
        productAssets,
        referenceAssets,
        safetyIdentifier: createHash('sha256')
          .update(runtimeJob.userId)
          .digest('hex')
          .slice(0, 64),
      });
      const normalized = await sharp(
        Buffer.from(generated.base64Data, 'base64'),
      )
        .rotate()
        .flatten({ background: '#ffffff' })
        .resize(2048, 2048, { fit: 'cover', position: 'centre' })
        .png({ compressionLevel: 9 })
        .toBuffer();
      await this.progress(runtimeJob.id, 65, 'reviewing');
      const reviewImage = await sharp(normalized)
        .resize({
          width: 1536,
          height: 1536,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 88, chromaSubsampling: '4:4:4' })
        .toBuffer();
      const review = await this.ai('review').reviewConsistency({
        role: snapshot.role,
        productAssets,
        generatedAsset: {
          mimeType: 'image/jpeg',
          base64Data: reviewImage.toString('base64'),
        },
        productBrief: snapshot.productBrief,
      });
      await this.progress(runtimeJob.id, 90, 'storing');
      objectKey = `${runtimeJob.userId}/${runtimeJob.projectId}/generated/${runtimeJob.id}.png`;
      const checksum = createHash('sha256').update(normalized).digest('hex');
      await this.storage.putObject(
        this.bucket,
        objectKey,
        normalized,
        normalized.length,
        {
          'Content-Type': 'image/png',
          'x-amz-meta-sha256': checksum,
        },
      );
      const assetId = await this.succeed(
        runtimeJob,
        objectKey,
        normalized.length,
        checksum,
        review,
      );
      return { assetId };
    } catch (error) {
      if (objectKey) {
        await this.storage
          .removeObject(this.bucket, objectKey)
          .catch(() => undefined);
      }
      const providerError =
        error instanceof AiProviderError
          ? error
          : new AiProviderError('IMAGE_GENERATION_FAILED', '图片生成任务失败', {
              cause: error,
            });
      const maxAttempts = job.opts.attempts ?? 1;
      const permanent = [
        'AI_INPUT_INVALID',
        'AI_REFUSED',
        'AI_INVALID_RESPONSE',
        'AI_NOT_CONFIGURED',
        'SOURCE_ASSET_MISSING',
        'JOB_NOT_RUNNABLE',
      ].includes(providerError.code);
      const retry = !permanent && job.attemptsMade + 1 < maxAttempts;
      if (retry) {
        await this.retryLater(runtimeJob.id, providerError);
        this.logger.warn(
          `Image job ${runtimeJob.id} will retry after ${providerError.code}`,
        );
      } else {
        await this.fail(runtimeJob, providerError);
        this.logger.error(
          `Image job ${runtimeJob.id} failed: ${providerError.code}`,
        );
      }
      throw providerError;
    }
  }

  private async start(jobId: string): Promise<RuntimeJob | undefined> {
    const result = await this.database.pool.query<RuntimeJob>(
      `update generation_jobs set status = 'running', stage = 'loading_sources',
              progress = 10, attempt_count = attempt_count + 1,
              started_at = coalesce(started_at, now()), error_code = null,
              error_message_safe = null
       where id = $1 and job_type = 'image' and status in ('queued', 'running')
       returning id, project_id as "projectId", user_id as "userId",
                 image_role as "imageRole", status,
                 input_snapshot as "inputSnapshot", idempotency_key as "idempotencyKey",
                 credits_reserved as "creditsReserved"`,
      [jobId],
    );
    if (result.rows[0]) return result.rows[0];
    const terminal = await this.database.pool.query<{ status: string }>(
      `select status from generation_jobs where id = $1 and job_type = 'image'`,
      [jobId],
    );
    if (terminal.rows[0]?.status === 'succeeded') return undefined;
    throw new AiProviderError('JOB_NOT_RUNNABLE', '图片任务不可执行');
  }

  private async loadAssets(
    job: RuntimeJob,
    ids: string[],
    expectedType: 'product' | 'reference',
  ): Promise<AiImageAsset[]> {
    if (ids.length === 0) return [];
    const result = await this.database.pool.query<StoredAsset>(
      `select id, object_key as "objectKey", mime_type as "mimeType"
       from assets where id = any($1::uuid[]) and project_id = $2
         and owner_user_id = $3 and asset_type = $4
         and status = 'ready' and deleted_at is null`,
      [ids, job.projectId, job.userId, expectedType],
    );
    const byId = new Map(result.rows.map((asset) => [asset.id, asset]));
    if (ids.some((id) => !byId.has(id))) {
      throw new AiProviderError(
        'SOURCE_ASSET_MISSING',
        '任务引用的原始素材已不存在',
      );
    }
    return Promise.all(
      ids.map(async (id) => {
        const asset = byId.get(id) as StoredAsset;
        const buffer = await this.readObject(asset.objectKey);
        const prepared = await sharp(buffer)
          .rotate()
          .flatten({ background: '#ffffff' })
          .resize({
            width: 2048,
            height: 2048,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({ quality: 88, chromaSubsampling: '4:4:4' })
          .toBuffer();
        return {
          mimeType: 'image/jpeg' as const,
          base64Data: prepared.toString('base64'),
        };
      }),
    );
  }

  private async readObject(objectKey: string): Promise<Buffer> {
    const stream = await this.storage.getObject(this.bucket, objectKey);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      const value: unknown = chunk;
      if (Buffer.isBuffer(value)) chunks.push(value);
      else if (typeof value === 'string') chunks.push(Buffer.from(value));
      else if (value instanceof Uint8Array) chunks.push(Buffer.from(value));
      else throw new Error('对象存储返回了无法识别的数据');
    }
    return Buffer.concat(chunks);
  }

  private async succeed(
    job: RuntimeJob,
    objectKey: string,
    fileSize: number,
    checksum: string,
    review: ConsistencyReviewResult,
  ): Promise<string> {
    const client = await this.database.pool.connect();
    const assetId = randomUUID();
    try {
      await client.query('begin');
      await client.query(
        `insert into assets(id, project_id, owner_user_id, asset_type, image_role,
                            object_key, original_name, mime_type, width, height,
                            file_size, checksum, status, qa_result)
         values ($1,$2,$3,'generated',$4,$5,$6,'image/png',2048,2048,$7,$8,'ready',$9)`,
        [
          assetId,
          job.projectId,
          job.userId,
          job.imageRole,
          objectKey,
          `${job.imageRole}-${job.id}.png`,
          fileSize,
          checksum,
          review,
        ],
      );
      const updated = await client.query(
        `update generation_jobs set status = 'succeeded', result_asset_id = $2,
                progress = 100, stage = 'completed', completed_at = now(),
                error_code = null, error_message_safe = null
         where id = $1 and status = 'running' returning id`,
        [job.id, assetId],
      );
      if (updated.rowCount === 0) throw new Error('Image job is not running');
      const balance = await client.query<{ creditBalance: number }>(
        `select credit_balance as "creditBalance" from users where id = $1 for update`,
        [job.userId],
      );
      await client.query(
        `insert into credit_ledger(id, user_id, job_id, entry_type, delta,
                                   balance_after, idempotency_key, description)
         values ($1,$2,$3,'consume',0,$4,$5,$6)`,
        [
          randomUUID(),
          job.userId,
          job.id,
          balance.rows[0]?.creditBalance ?? 0,
          `generation:${job.id}:consume`,
          `图片生成额度消费（${job.imageRole}）`,
        ],
      );
      await this.updateProjectStatus(client, job.projectId, job.userId);
      await client.query('commit');
      return assetId;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  private async fail(job: RuntimeJob, error: AiProviderError): Promise<void> {
    const client = await this.database.pool.connect();
    try {
      await client.query('begin');
      const failed = await client.query<{ creditsReserved: number }>(
        `update generation_jobs set status = 'failed', progress = 100,
                stage = 'failed', error_code = $2, error_message_safe = $3,
                completed_at = now()
         where id = $1 and status in ('queued', 'running')
         returning credits_reserved as "creditsReserved"`,
        [job.id, error.code, error.message.slice(0, 500)],
      );
      const amount = failed.rows[0]?.creditsReserved;
      if (amount !== undefined) {
        const user = await client.query<{ creditBalance: number }>(
          `update users set credit_balance = credit_balance + $2, updated_at = now()
           where id = $1 returning credit_balance as "creditBalance"`,
          [job.userId, amount],
        );
        await client.query(
          `insert into credit_ledger(id, user_id, job_id, entry_type, delta,
                                     balance_after, idempotency_key, description)
           values ($1,$2,$3,'refund',$4,$5,$6,$7)
           on conflict (idempotency_key) do nothing`,
          [
            randomUUID(),
            job.userId,
            job.id,
            amount,
            user.rows[0]?.creditBalance ?? 0,
            `generation:${job.id}:refund`,
            `图片生成失败退款（${job.imageRole}）`,
          ],
        );
      }
      await this.updateProjectStatus(client, job.projectId, job.userId);
      await client.query('commit');
    } catch (settleError) {
      await client.query('rollback');
      throw settleError;
    } finally {
      client.release();
    }
  }

  private async retryLater(
    jobId: string,
    error: AiProviderError,
  ): Promise<void> {
    await this.database.pool.query(
      `update generation_jobs set status = 'queued', progress = 0,
              stage = 'retry_wait', error_code = $2, error_message_safe = $3
       where id = $1 and status = 'running'`,
      [jobId, error.code, error.message.slice(0, 500)],
    );
  }

  private async progress(
    jobId: string,
    progress: number,
    stage: string,
  ): Promise<void> {
    await this.database.pool.query(
      `update generation_jobs set progress = $2, stage = $3
       where id = $1 and status = 'running'`,
      [jobId, progress, stage],
    );
  }

  private async updateProjectStatus(
    client: { query: DatabaseClient['pool']['query'] },
    projectId: string,
    userId: string,
  ): Promise<void> {
    await client.query(
      `update projects set status = case
         when exists (
           select 1 from generation_jobs
           where project_id = $1 and user_id = $2 and job_type = 'image'
             and status in ('queued', 'running')
         ) then 'generating'
         when (
           select count(distinct image_role) from assets
           where project_id = $1 and owner_user_id = $2 and asset_type = 'generated'
             and image_role = any($3::text[])
             and status = 'ready' and deleted_at is null
         ) = $4 then 'completed'
         when analysis_result is not null then 'ready'
         else 'failed'
       end, updated_at = now()
       where id = $1 and user_id = $2`,
      [projectId, userId, IMAGE_ROLES, IMAGE_ROLES.length],
    );
  }

  private ai(purpose: 'analysis' | 'image' | 'review'): OpenAiProvider {
    this.providers ??= this.createProviders();
    return this.providers[purpose];
  }

  private createProviders(): Record<
    'analysis' | 'image' | 'review',
    OpenAiProvider
  > {
    const routing = resolveOpenAiProviderRouting();
    const config = {
      baseURL: routing.baseURL,
      analysisModel: routing.models.analysis,
      imageModel: routing.models.image,
      reviewModel: routing.models.review,
    };
    return {
      analysis: new OpenAiProvider(routing.apiKeys.analysis, config),
      image: new OpenAiProvider(routing.apiKeys.image, config),
      review: new OpenAiProvider(routing.apiKeys.review, config),
    };
  }

  private createStorage(): MinioClient {
    const endpoint = new URL(required('S3_ENDPOINT'));
    return new MinioClient({
      endPoint: endpoint.hostname,
      port: Number(
        endpoint.port || (endpoint.protocol === 'https:' ? 443 : 80),
      ),
      useSSL: endpoint.protocol === 'https:',
      accessKey: required('S3_ACCESS_KEY'),
      secretKey: required('S3_SECRET_KEY'),
      region: process.env.S3_REGION ?? 'us-east-1',
    });
  }
}
