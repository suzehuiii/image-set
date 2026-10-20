import { extractManualText } from './manual-text.js';
import {
  BadRequestException,
  Controller,
  ConflictException,
  Delete,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Client as MinioClient } from 'minio';
import type { Response } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { ProductAnalysisAsset } from '@image-set/ai-provider';
import { REFERENCE_ASSET_LIMIT } from '@image-set/shared';

import { AuthGuard, CurrentUser, type AuthUser } from './auth.js';
import { DatabaseService } from './database.service.js';
import { ProjectsService } from './projects.js';
import {
  inspectUpload,
  parseUploadAssetType,
  type UploadAssetType,
} from './upload-validation.js';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function storageClient(endpointValue = required('S3_ENDPOINT')): MinioClient {
  const endpoint = new URL(endpointValue);
  return new MinioClient({
    endPoint: endpoint.hostname,
    port: Number(endpoint.port || (endpoint.protocol === 'https:' ? 443 : 80)),
    useSSL: endpoint.protocol === 'https:',
    accessKey: required('S3_ACCESS_KEY'),
    secretKey: required('S3_SECRET_KEY'),
    region: process.env.S3_REGION ?? 'us-east-1',
  });
}

type AssetRow = {
  id: string;
  projectId: string;
  assetType: string;
  imageRole: string | null;
  originalName: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  fileSize: number;
  status: string;
  qaResult: Record<string, unknown> | null;
  createdAt: Date;
};

@Injectable()
export class AssetsService {
  private readonly storage = storageClient();
  private readonly publicStorage = storageClient(
    process.env.S3_PUBLIC_ENDPOINT ?? required('S3_ENDPOINT'),
  );
  private readonly bucket = required('S3_BUCKET');

  constructor(
    private readonly database: DatabaseService,
    private readonly projects: ProjectsService,
  ) {}

  async list(userId: string, projectId: string): Promise<AssetRow[]> {
    await this.projects.findOwned(userId, projectId);
    const result = await this.database.client.pool.query<AssetRow>(
      `select id, project_id as "projectId", asset_type as "assetType", image_role as "imageRole",
              original_name as "originalName", mime_type as "mimeType", width, height,
              file_size as "fileSize", status, qa_result as "qaResult", created_at as "createdAt"
       from assets where project_id = $1 and owner_user_id = $2 and deleted_at is null
       order by created_at desc`,
      [projectId, userId],
    );
    return result.rows;
  }

  async upload(
    userId: string,
    projectId: string,
    assetType: string,
    file: Express.Multer.File | undefined,
  ): Promise<AssetRow> {
    const parsedAssetType = parseUploadAssetType(assetType);
    if (!file) throw new BadRequestException('请选择要上传的文件');
    await this.projects.findOwned(userId, projectId);
    await this.assertEditable(userId, projectId);
    const inspection = await inspectUpload(parsedAssetType, file);
    const limit = this.assetLimit(parsedAssetType);
    const count = await this.database.client.pool.query<{ count: number }>(
      `select count(*)::int as count from assets
       where project_id = $1 and owner_user_id = $2 and asset_type = $3 and deleted_at is null`,
      [projectId, userId, parsedAssetType],
    );
    if ((count.rows[0]?.count ?? 0) >= limit) {
      throw new BadRequestException(this.limitMessage(parsedAssetType, limit));
    }

    const id = randomUUID();
    const objectKey = `${userId}/${projectId}/${id}.${inspection.extension}`;
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    await this.storage.putObject(
      this.bucket,
      objectKey,
      file.buffer,
      file.size,
      {
        'Content-Type': inspection.mimeType,
        'x-amz-meta-sha256': checksum,
      },
    );
    try {
      const result = await this.database.client.pool.query<AssetRow>(
        `insert into assets(id, project_id, owner_user_id, asset_type, object_key, original_name,
                            mime_type, width, height, file_size, checksum)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        returning id, project_id as "projectId", asset_type as "assetType", image_role as "imageRole",
                   original_name as "originalName", mime_type as "mimeType", width, height,
                   file_size as "fileSize", status, qa_result as "qaResult", created_at as "createdAt"`,
        [
          id,
          projectId,
          userId,
          parsedAssetType,
          objectKey,
          file.originalname.slice(0, 255),
          inspection.mimeType,
          inspection.width,
          inspection.height,
          file.size,
          checksum,
        ],
      );
      await this.database.client.pool.query(
        `update projects set updated_at=now(), analysis_result=case when analysis_result->>'schemaVersion'='2' then case when $2='reference' then jsonb_set(analysis_result,'{campaign}','null'::jsonb) else null end else analysis_result end where id=$1`,
        [projectId, parsedAssetType],
      );
      return result.rows[0] as AssetRow;
    } catch (error) {
      await this.storage
        .removeObject(this.bucket, objectKey)
        .catch(() => undefined);
      if (
        parsedAssetType === 'manual' &&
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505'
      ) {
        throw new BadRequestException('每个项目最多上传 1 份产品说明书');
      }
      throw error;
    }
  }

  private assetLimit(assetType: UploadAssetType): number {
    if (assetType === 'product') return 10;
    if (assetType === 'reference') return REFERENCE_ASSET_LIMIT;
    return 1;
  }

  private limitMessage(assetType: UploadAssetType, limit: number): string {
    if (assetType === 'product') return `商品图最多 ${limit} 张`;
    if (assetType === 'reference') return `参考图最多 ${limit} 张`;
    return '每个项目最多上传 1 份产品说明书';
  }

  private async assertEditable(userId: string, projectId: string) {
    const active = await this.database.client.pool.query(
      `select id from generation_jobs where user_id=$1 and project_id=$2 and status in ('queued','running') limit 1`,
      [userId, projectId],
    );
    if (active.rowCount)
      throw new ConflictException('任务执行期间不能更换素材');
  }

  async remove(userId: string, assetId: string): Promise<void> {
    const found = await this.database.client.pool.query<{
      projectId: string;
      assetType: string;
    }>(
      `select project_id as "projectId",asset_type as "assetType" from assets where id=$1 and owner_user_id=$2 and deleted_at is null`,
      [assetId, userId],
    );
    const owned = found.rows[0];
    if (!owned) throw new NotFoundException('素材不存在');
    await this.assertEditable(userId, owned.projectId);
    const result = await this.database.client.pool.query<{ objectKey: string }>(
      `update assets set deleted_at=now(),status='deleted' where id=$1 and owner_user_id=$2 and deleted_at is null returning object_key as "objectKey"`,
      [assetId, userId],
    );
    const asset = result.rows[0];
    if (!asset) throw new NotFoundException('素材不存在');
    if (['product', 'reference', 'manual'].includes(owned.assetType))
      await this.database.client.pool.query(
        `update projects set updated_at=now(),analysis_result=case when analysis_result->>'schemaVersion'='2' then case when $2='reference' then jsonb_set(analysis_result,'{campaign}','null'::jsonb) else null end else analysis_result end where id=$1`,
        [owned.projectId, owned.assetType],
      );
    await this.storage.removeObject(this.bucket, asset.objectKey);
  }

  async contentUrl(userId: string, assetId: string): Promise<string> {
    const result = await this.database.client.pool.query<{ objectKey: string }>(
      `select a.object_key as "objectKey" from assets a
       join projects p on p.id = a.project_id and p.deleted_at is null
       where a.id = $1 and a.owner_user_id = $2 and a.deleted_at is null and a.status = 'ready'`,
      [assetId, userId],
    );
    const asset = result.rows[0];
    if (!asset) throw new NotFoundException('素材不存在');
    return this.publicStorage.presignedGetObject(
      this.bucket,
      asset.objectKey,
      300,
    );
  }

  async downloadUrl(userId: string, assetId: string): Promise<string> {
    const result = await this.database.client.pool.query<{
      objectKey: string;
      originalName: string;
      mimeType: string;
    }>(
      `select a.object_key as "objectKey", a.original_name as "originalName",
              a.mime_type as "mimeType"
       from assets a join projects p on p.id = a.project_id and p.deleted_at is null
       where a.id = $1 and a.owner_user_id = $2 and a.deleted_at is null
         and a.status = 'ready' and a.asset_type in ('generated', 'export')`,
      [assetId, userId],
    );
    const asset = result.rows[0];
    if (!asset) throw new NotFoundException('可下载文件不存在');
    const safeAscii = asset.originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return this.publicStorage.presignedGetObject(
      this.bucket,
      asset.objectKey,
      300,
      {
        'response-content-type': asset.mimeType,
        'response-content-disposition': `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(asset.originalName)}`,
      },
    );
  }

  async manualAnalysisInput(
    userId: string,
    projectId: string,
  ): Promise<{ text: string; warning: string }> {
    const result = await this.database.client.pool.query<{
      objectKey: string;
      mimeType: string;
    }>(
      `select object_key as "objectKey", mime_type as "mimeType" from assets where project_id=$1 and owner_user_id=$2 and asset_type='manual' and status='ready' and deleted_at is null limit 1`,
      [projectId, userId],
    );
    const asset = result.rows[0];
    if (!asset) return { text: '', warning: '' };
    try {
      const stream = await this.storage.getObject(this.bucket, asset.objectKey);
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of stream) {
        const buffer = Buffer.from(chunk as Uint8Array);
        size += buffer.length;
        if (size > 15 * 1024 * 1024) throw new Error('说明书超过解析限制');
        chunks.push(buffer);
      }
      const text = await extractManualText(
        Buffer.concat(chunks),
        asset.mimeType,
      );
      return {
        text,
        warning: text.trim()
          ? ''
          : '说明书没有可提取文字（扫描件请手工补充），本次只依据商品图与用户资料分析。',
      };
    } catch (error) {
      return {
        text: '',
        warning:
          error instanceof Error
            ? error.message
            : '说明书提取失败，请手工补充。',
      };
    }
  }

  async productAnalysisInputs(
    userId: string,
    projectId: string,
    assetType: 'product' | 'reference' = 'product',
  ): Promise<ProductAnalysisAsset[]> {
    const result = await this.database.client.pool.query<{
      objectKey: string;
    }>(
      `select object_key as "objectKey"
       from assets
       where project_id = $1 and owner_user_id = $2 and asset_type = $3
         and status = 'ready' and deleted_at is null
       order by created_at`,
      [projectId, userId, assetType],
    );
    return Promise.all(
      result.rows.map(async (asset) => {
        const stream = await this.storage.getObject(
          this.bucket,
          asset.objectKey,
        );
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          const value: unknown = chunk;
          if (Buffer.isBuffer(value)) chunks.push(value);
          else if (typeof value === 'string') chunks.push(Buffer.from(value));
          else if (value instanceof Uint8Array) chunks.push(Buffer.from(value));
          else throw new Error('对象存储返回了无法识别的数据');
        }
        const analysisImage = await sharp(Buffer.concat(chunks))
          .rotate()
          .flatten({ background: '#ffffff' })
          .resize({
            width: 2048,
            height: 2048,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({ quality: 85, chromaSubsampling: '4:4:4' })
          .toBuffer();
        return {
          mimeType: 'image/jpeg' as const,
          base64Data: analysisImage.toString('base64'),
        };
      }),
    );
  }
}

@Controller()
@UseGuards(AuthGuard)
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get('projects/:projectId/assets')
  async list(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
  ) {
    return { items: await this.assets.list(user.id, projectId) };
  }

  @Post('projects/:projectId/assets')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 15 * 1024 * 1024, files: 1 },
    }),
  )
  upload(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Query('assetType') assetType: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.assets.upload(user.id, projectId, assetType, file);
  }

  @Delete('assets/:id')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.assets.remove(user.id, id);
    return { ok: true };
  }

  @Get('assets/:id/content')
  async content(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    response.redirect(await this.assets.contentUrl(user.id, id));
  }

  @Get('assets/:id/download')
  async download(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    response.redirect(await this.assets.downloadUrl(user.id, id));
  }
}
