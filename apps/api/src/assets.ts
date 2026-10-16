import {
  BadRequestException,
  Controller,
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
import { fileTypeFromBuffer } from 'file-type';
import { imageSize } from 'image-size';
import { Client as MinioClient } from 'minio';
import type { Response } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { ProductAnalysisAsset } from '@image-set/ai-provider';

import { AuthGuard, CurrentUser, type AuthUser } from './auth.js';
import { DatabaseService } from './database.service.js';
import { ProjectsService } from './projects.js';

const MIME_EXTENSIONS = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function storageClient(): MinioClient {
  const endpoint = new URL(required('S3_ENDPOINT'));
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
  width: number;
  height: number;
  fileSize: number;
  status: string;
  qaResult: Record<string, unknown> | null;
  createdAt: Date;
};

@Injectable()
export class AssetsService {
  private readonly storage = storageClient();
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
    if (assetType !== 'product' && assetType !== 'reference') {
      throw new BadRequestException('assetType 必须是 product 或 reference');
    }
    if (!file) throw new BadRequestException('请选择图片');
    await this.projects.findOwned(userId, projectId);
    const detected = await fileTypeFromBuffer(file.buffer);
    const extension = detected ? MIME_EXTENSIONS.get(detected.mime) : undefined;
    if (
      !detected ||
      !extension ||
      (file.mimetype !== detected.mime &&
        file.mimetype !== 'application/octet-stream')
    ) {
      throw new BadRequestException('仅支持真实的 JPG、PNG 或 WebP 图片');
    }
    let dimensions: ReturnType<typeof imageSize>;
    try {
      dimensions = imageSize(file.buffer);
    } catch {
      throw new BadRequestException('图片已损坏或无法读取');
    }
    if (!dimensions.width || !dimensions.height)
      throw new BadRequestException('无法读取图片尺寸');
    if (
      dimensions.width < 256 ||
      dimensions.height < 256 ||
      dimensions.width > 12000 ||
      dimensions.height > 12000 ||
      dimensions.width * dimensions.height > 40_000_000
    ) {
      throw new BadRequestException(
        '图片边长须为 256–12000 像素且不超过 4000 万像素',
      );
    }
    const limit = assetType === 'product' ? 10 : 4;
    const count = await this.database.client.pool.query<{ count: number }>(
      `select count(*)::int as count from assets
       where project_id = $1 and owner_user_id = $2 and asset_type = $3 and deleted_at is null`,
      [projectId, userId, assetType],
    );
    if ((count.rows[0]?.count ?? 0) >= limit) {
      throw new BadRequestException(
        `${assetType === 'product' ? '商品图' : '参考图'}最多 ${limit} 张`,
      );
    }

    const id = randomUUID();
    const objectKey = `${userId}/${projectId}/${id}.${extension}`;
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    await this.storage.putObject(
      this.bucket,
      objectKey,
      file.buffer,
      file.size,
      {
        'Content-Type': detected.mime,
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
          assetType,
          objectKey,
          file.originalname.slice(0, 255),
          detected.mime,
          dimensions.width,
          dimensions.height,
          file.size,
          checksum,
        ],
      );
      await this.database.client.pool.query(
        'update projects set updated_at = now() where id = $1',
        [projectId],
      );
      return result.rows[0] as AssetRow;
    } catch (error) {
      await this.storage
        .removeObject(this.bucket, objectKey)
        .catch(() => undefined);
      throw error;
    }
  }

  async remove(userId: string, assetId: string): Promise<void> {
    const result = await this.database.client.pool.query<{ objectKey: string }>(
      `update assets set deleted_at = now(), status = 'deleted'
       where id = $1 and owner_user_id = $2 and deleted_at is null
       returning object_key as "objectKey"`,
      [assetId, userId],
    );
    const asset = result.rows[0];
    if (!asset) throw new NotFoundException('素材不存在');
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
    return this.storage.presignedGetObject(this.bucket, asset.objectKey, 300);
  }

  async productAnalysisInputs(
    userId: string,
    projectId: string,
  ): Promise<ProductAnalysisAsset[]> {
    const result = await this.database.client.pool.query<{
      objectKey: string;
    }>(
      `select object_key as "objectKey"
       from assets
       where project_id = $1 and owner_user_id = $2 and asset_type = 'product'
         and status = 'ready' and deleted_at is null
       order by created_at`,
      [projectId, userId],
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
}
