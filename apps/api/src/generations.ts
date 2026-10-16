import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Headers,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  Param,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { IsIn, IsOptional } from 'class-validator';
import { randomUUID } from 'node:crypto';
import {
  generationSnapshotSchema,
  IMAGE_ROLES,
  type GenerationSnapshot,
  type ImageQueuePayload,
  type ImageRole,
} from '@image-set/shared';

import { AuthGuard, CurrentUser, type AuthUser } from './auth.js';
import { DatabaseService } from './database.service.js';

const IMAGE_CREDITS = 3;
const PROMPT_VERSION = 'ecommerce-nine-image-zh-v3';

type GenerationJobRow = {
  id: string;
  projectId: string;
  userId: string;
  jobType: string;
  imageRole: ImageRole;
  status: string;
  provider: string;
  model: string;
  promptVersion: string;
  idempotencyKey: string;
  inputSnapshot: GenerationSnapshot;
  resultAssetId: string | null;
  creditsReserved: number;
  attemptCount: number;
  progress: number;
  stage: string;
  errorCode: string | null;
  errorMessageSafe: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
};

type GenerationProject = {
  id: string;
  targetPlatform: string;
  targetLocale: string;
  productCategory: string | null;
  productBrief: Record<string, unknown>;
  analysisResult: unknown;
};

export class CreateGenerationDto {
  @IsOptional()
  @IsIn(IMAGE_ROLES)
  role?: ImageRole;
}

@Injectable()
export class GenerationQueueService implements OnModuleDestroy {
  private readonly queue: Queue<ImageQueuePayload>;

  constructor() {
    const redis = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
    this.queue = new Queue<ImageQueuePayload>('image-generation', {
      connection: {
        host: redis.hostname,
        port: Number(redis.port || 6379),
        password: redis.password || undefined,
      },
    });
  }

  async enqueue(jobs: GenerationJobRow[]): Promise<void> {
    await this.queue.addBulk(
      jobs.map((job) => ({
        name: 'generate',
        data: { jobId: job.id },
        opts: {
          jobId: job.id,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      })),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}

@Injectable()
export class GenerationsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly queue: GenerationQueueService,
  ) {}

  async create(
    userId: string,
    projectId: string,
    idempotencyKey: string | undefined,
    requestedRole?: ImageRole,
  ) {
    const key = this.validateKey(idempotencyKey, requestedRole ? 120 : 105);
    const roles = requestedRole ? [requestedRole] : [...IMAGE_ROLES];
    const keys = requestedRole ? [key] : roles.map((role) => `${key}:${role}`);
    const reserved = await this.reserve(
      userId,
      projectId,
      roles,
      keys,
      requestedRole ? 'regenerate' : 'full_set',
    );
    if (!reserved.existing) {
      await this.enqueueOrRefund(reserved.jobs);
    }
    return {
      items: reserved.jobs,
      creditBalance: reserved.creditBalance,
    };
  }

  async retry(
    userId: string,
    sourceJobId: string,
    idempotencyKey: string | undefined,
  ) {
    const key = this.validateKey(idempotencyKey, 120);
    const client = await this.database.client.pool.connect();
    let job: GenerationJobRow;
    let creditBalance: number;
    let existing = false;
    try {
      await client.query('begin');
      const user = await client.query<{ creditBalance: number }>(
        `select credit_balance as "creditBalance" from users
         where id = $1 and status = 'active' for update`,
        [userId],
      );
      const balance = user.rows[0]?.creditBalance;
      if (balance === undefined) throw new NotFoundException('用户不存在');
      const duplicate = await client.query<GenerationJobRow>(
        `${this.jobSelect()} where j.user_id = $1 and j.idempotency_key = $2`,
        [userId, key],
      );
      if (duplicate.rows[0]) {
        job = duplicate.rows[0];
        const duplicateSnapshot = generationSnapshotSchema.safeParse(
          job.inputSnapshot,
        );
        if (
          job.jobType !== 'image' ||
          !duplicateSnapshot.success ||
          duplicateSnapshot.data.requestType !== 'retry' ||
          duplicateSnapshot.data.sourceJobId !== sourceJobId
        ) {
          throw new ConflictException('Idempotency-Key 已用于其他请求');
        }
        creditBalance = balance;
        existing = true;
        await client.query('commit');
      } else {
        const source = await client.query<GenerationJobRow>(
          `${this.jobSelect()} join projects p on p.id = j.project_id
           where j.id = $1 and j.user_id = $2 and p.deleted_at is null for update`,
          [sourceJobId, userId],
        );
        const previous = source.rows[0];
        if (!previous) throw new NotFoundException('任务不存在');
        if (previous.jobType !== 'image' || previous.status !== 'failed') {
          throw new ConflictException('只有失败的图片任务可以重试');
        }
        if (balance < IMAGE_CREDITS) throw new ConflictException('额度不足');
        const parsed = generationSnapshotSchema.parse(previous.inputSnapshot);
        const snapshot: GenerationSnapshot = {
          ...parsed,
          requestType: 'retry',
          sourceJobId: previous.id,
        };
        job = await this.insertJob(
          client,
          userId,
          previous.projectId,
          previous.imageRole,
          key,
          snapshot,
        );
        creditBalance = balance - IMAGE_CREDITS;
        await client.query(
          `update users set credit_balance = $2, updated_at = now() where id = $1`,
          [userId, creditBalance],
        );
        await this.insertReserveLedger(
          client,
          userId,
          job.id,
          key,
          creditBalance,
          `单图重试额度预留（${previous.imageRole}）`,
        );
        await client.query(
          `update projects set status = 'generating', updated_at = now()
           where id = $1 and user_id = $2 and deleted_at is null`,
          [previous.projectId, userId],
        );
        await client.query('commit');
      }
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
    if (!existing) await this.enqueueOrRefund([job]);
    return { job, creditBalance };
  }

  private async reserve(
    userId: string,
    projectId: string,
    roles: ImageRole[],
    keys: string[],
    requestType: 'full_set' | 'regenerate',
  ) {
    const client = await this.database.client.pool.connect();
    try {
      await client.query('begin');
      const user = await client.query<{ creditBalance: number }>(
        `select credit_balance as "creditBalance" from users
         where id = $1 and status = 'active' for update`,
        [userId],
      );
      const balance = user.rows[0]?.creditBalance;
      if (balance === undefined) throw new NotFoundException('用户不存在');
      const projectResult = await client.query<GenerationProject>(
        `select id, target_platform as "targetPlatform", target_locale as "targetLocale",
                product_category as "productCategory", product_brief as "productBrief",
                analysis_result as "analysisResult"
         from projects where id = $1 and user_id = $2 and deleted_at is null for update`,
        [projectId, userId],
      );
      const project = projectResult.rows[0];
      if (!project) throw new NotFoundException('项目不存在');
      const existing = await client.query<GenerationJobRow>(
        `${this.jobSelect()} where j.user_id = $1 and j.idempotency_key = any($2::text[])
         order by j.created_at`,
        [userId, keys],
      );
      if (existing.rowCount && existing.rowCount > 0) {
        if (
          existing.rowCount !== roles.length ||
          existing.rows.some((item) => item.projectId !== projectId)
        ) {
          throw new ConflictException('Idempotency-Key 已用于其他请求');
        }
        await client.query('commit');
        return {
          existing: true as const,
          jobs: existing.rows,
          creditBalance: balance,
        };
      }
      const analysis = generationSnapshotSchema.shape.analysis.safeParse(
        project.analysisResult,
      );
      if (!analysis.success) {
        throw new BadRequestException('请先完成并保存商品分析');
      }
      const assets = await client.query<{
        id: string;
        assetType: 'product' | 'reference';
      }>(
        `select id, asset_type as "assetType" from assets
         where project_id = $1 and owner_user_id = $2
           and asset_type in ('product', 'reference')
           and status = 'ready' and deleted_at is null order by created_at`,
        [projectId, userId],
      );
      const productAssetIds = assets.rows
        .filter((asset) => asset.assetType === 'product')
        .map((asset) => asset.id);
      const referenceAssetIds = assets.rows
        .filter((asset) => asset.assetType === 'reference')
        .map((asset) => asset.id);
      if (productAssetIds.length === 0) {
        throw new BadRequestException('请先上传至少一张商品图');
      }
      const total = roles.length * IMAGE_CREDITS;
      if (balance < total) throw new ConflictException('额度不足');
      const jobs: GenerationJobRow[] = [];
      for (const [index, role] of roles.entries()) {
        const snapshot: GenerationSnapshot = {
          role,
          targetPlatform: project.targetPlatform,
          targetLocale: project.targetLocale,
          productCategory: project.productCategory,
          productBrief: project.productBrief,
          analysis: analysis.data,
          productAssetIds,
          referenceAssetIds,
          requestType,
        };
        const job = await this.insertJob(
          client,
          userId,
          projectId,
          role,
          keys[index] as string,
          snapshot,
        );
        jobs.push(job);
        await this.insertReserveLedger(
          client,
          userId,
          job.id,
          keys[index] as string,
          balance - IMAGE_CREDITS * (index + 1),
          `图片生成额度预留（${role}）`,
        );
      }
      const creditBalance = balance - total;
      await client.query(
        `update users set credit_balance = $2, updated_at = now() where id = $1`,
        [userId, creditBalance],
      );
      await client.query(
        `update projects set status = 'generating', updated_at = now()
         where id = $1 and user_id = $2`,
        [projectId, userId],
      );
      await client.query('commit');
      return { existing: false as const, jobs, creditBalance };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  private async insertJob(
    client: { query: DatabaseService['client']['pool']['query'] },
    userId: string,
    projectId: string,
    role: ImageRole,
    key: string,
    snapshot: GenerationSnapshot,
  ): Promise<GenerationJobRow> {
    const result = await client.query<GenerationJobRow>(
      `insert into generation_jobs(
         id, project_id, user_id, job_type, image_role, status, provider, model,
         prompt_version, idempotency_key, input_snapshot, credits_reserved, progress, stage
       ) values ($1,$2,$3,'image',$4,'queued','openai',$5,$6,$7,$8,$9,0,'queued')
       returning id, project_id as "projectId", user_id as "userId", job_type as "jobType",
                 image_role as "imageRole", status, provider, model,
                 prompt_version as "promptVersion", idempotency_key as "idempotencyKey",
                 input_snapshot as "inputSnapshot", result_asset_id as "resultAssetId",
                 credits_reserved as "creditsReserved", attempt_count as "attemptCount",
                 progress, stage, error_code as "errorCode",
                 error_message_safe as "errorMessageSafe", started_at as "startedAt",
                 completed_at as "completedAt", created_at as "createdAt"`,
      [
        randomUUID(),
        projectId,
        userId,
        role,
        process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-2.5-sunburst',
        PROMPT_VERSION,
        key,
        snapshot,
        IMAGE_CREDITS,
      ],
    );
    return result.rows[0] as GenerationJobRow;
  }

  private async insertReserveLedger(
    client: { query: DatabaseService['client']['pool']['query'] },
    userId: string,
    jobId: string,
    key: string,
    balanceAfter: number,
    description: string,
  ): Promise<void> {
    await client.query(
      `insert into credit_ledger(id, user_id, job_id, entry_type, delta,
                                 balance_after, idempotency_key, description)
       values ($1,$2,$3,'reserve',$4,$5,$6,$7)`,
      [
        randomUUID(),
        userId,
        jobId,
        -IMAGE_CREDITS,
        balanceAfter,
        `${key}:reserve`,
        description,
      ],
    );
  }

  private async enqueueOrRefund(jobs: GenerationJobRow[]): Promise<void> {
    try {
      await this.queue.enqueue(jobs);
    } catch {
      await this.refundQueued(jobs, 'QUEUE_UNAVAILABLE', '任务队列暂时不可用');
      throw new ServiceUnavailableException('任务队列暂时不可用，额度已退回');
    }
  }

  private async refundQueued(
    jobs: GenerationJobRow[],
    code: string,
    message: string,
  ): Promise<void> {
    const client = await this.database.client.pool.connect();
    try {
      await client.query('begin');
      const grouped = new Map<string, GenerationJobRow[]>();
      for (const job of jobs) {
        grouped.set(job.userId, [...(grouped.get(job.userId) ?? []), job]);
      }
      for (const [userId, userJobs] of grouped) {
        const user = await client.query<{ creditBalance: number }>(
          `select credit_balance as "creditBalance" from users where id = $1 for update`,
          [userId],
        );
        let balance = user.rows[0]?.creditBalance ?? 0;
        for (const job of userJobs) {
          const failed = await client.query(
            `update generation_jobs set status = 'failed', progress = 100, stage = 'failed',
                    error_code = $2, error_message_safe = $3, completed_at = now()
             where id = $1 and status = 'queued' returning id`,
            [job.id, code, message],
          );
          if (failed.rowCount === 0) continue;
          balance += job.creditsReserved;
          await client.query(
            `insert into credit_ledger(id, user_id, job_id, entry_type, delta,
                                       balance_after, idempotency_key, description)
             values ($1,$2,$3,'refund',$4,$5,$6,'图片任务入队失败退款')
             on conflict (idempotency_key) do nothing`,
            [
              randomUUID(),
              userId,
              job.id,
              job.creditsReserved,
              balance,
              `generation:${job.id}:refund`,
            ],
          );
        }
        await client.query(
          `update users set credit_balance = $2, updated_at = now() where id = $1`,
          [userId, balance],
        );
        for (const projectId of new Set(userJobs.map((job) => job.projectId))) {
          await client.query(
            `update projects set status = case
               when exists (
                 select 1 from generation_jobs
                 where project_id = $1 and user_id = $2 and job_type = 'image'
                   and status in ('queued', 'running')
               ) then 'generating'
               when analysis_result is not null then 'ready'
               else 'failed'
             end, updated_at = now()
             where id = $1 and user_id = $2`,
            [projectId, userId],
          );
        }
      }
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  private validateKey(key: string | undefined, maxLength: number): string {
    const normalized = key?.trim();
    if (!normalized || normalized.length < 8 || normalized.length > maxLength) {
      throw new BadRequestException(
        `Idempotency-Key 长度须为 8–${maxLength} 个字符`,
      );
    }
    return normalized;
  }

  private jobSelect(): string {
    return `select j.id, j.project_id as "projectId", j.user_id as "userId",
                   j.job_type as "jobType", j.image_role as "imageRole", j.status,
                   j.provider, j.model, j.prompt_version as "promptVersion",
                   j.idempotency_key as "idempotencyKey", j.input_snapshot as "inputSnapshot",
                   j.result_asset_id as "resultAssetId", j.credits_reserved as "creditsReserved",
                   j.attempt_count as "attemptCount", j.progress, j.stage,
                   j.error_code as "errorCode", j.error_message_safe as "errorMessageSafe",
                   j.started_at as "startedAt", j.completed_at as "completedAt",
                   j.created_at as "createdAt" from generation_jobs j`;
  }
}

@Controller()
@UseGuards(AuthGuard)
export class GenerationsController {
  constructor(private readonly generations: GenerationsService) {}

  @Post('projects/:id/generations')
  create(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: CreateGenerationDto,
  ) {
    return this.generations.create(user.id, id, idempotencyKey, input.role);
  }

  @Post('jobs/:id/retry')
  retry(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.generations.retry(user.id, id, idempotencyKey);
  }
}
