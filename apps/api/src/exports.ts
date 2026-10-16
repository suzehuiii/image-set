import {
  BadRequestException,
  Body,
  Controller,
  Injectable,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsOptional } from 'class-validator';
import { zipSync } from 'fflate';
import { Client as MinioClient } from 'minio';
import { createHash, randomUUID } from 'node:crypto';
import {
  EXPORT_SIZE,
  marketingCopyForRole,
  renderExportImage,
  type ExportImageFormat,
} from '@image-set/image-layout';
import {
  IMAGE_ROLES,
  productAnalysisSchema,
  type ImageRole,
} from '@image-set/shared';

import { AuthGuard, CurrentUser, type AuthUser } from './auth.js';
import { DatabaseService } from './database.service.js';

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

type ExportProject = {
  name: string;
  analysisResult: unknown;
};

type SourceAsset = {
  imageRole: ImageRole;
  objectKey: string;
};

export type ExportAsset = {
  id: string;
  projectId: string;
  assetType: 'export';
  imageRole: ImageRole | null;
  originalName: string;
  mimeType: string;
  width: number;
  height: number;
  fileSize: number;
  createdAt: Date;
};

export class CreateExportDto {
  @IsIn(['png', 'jpg'])
  format!: ExportImageFormat;

  @IsOptional()
  @IsIn(IMAGE_ROLES)
  role?: ImageRole;
}

@Injectable()
export class ExportsService {
  private readonly storage = storageClient();
  private readonly bucket = required('S3_BUCKET');

  constructor(private readonly database: DatabaseService) {}

  async create(
    userId: string,
    projectId: string,
    format: ExportImageFormat,
    requestedRole?: ImageRole,
  ): Promise<{ asset: ExportAsset; bundle: boolean }> {
    const projectResult = await this.database.client.pool.query<ExportProject>(
      `select name, analysis_result as "analysisResult"
       from projects where id = $1 and user_id = $2 and deleted_at is null`,
      [projectId, userId],
    );
    const project = projectResult.rows[0];
    if (!project) throw new NotFoundException('项目不存在');
    const parsedAnalysis = productAnalysisSchema.safeParse(
      project.analysisResult,
    );
    if (!parsedAnalysis.success) {
      throw new BadRequestException('请先完成并保存商品分析');
    }
    const sources = await this.latestSources(userId, projectId);
    const roles = requestedRole ? [requestedRole] : [...IMAGE_ROLES];
    const selected = roles.map((role) => {
      const source = sources.get(role);
      if (!source) {
        throw new BadRequestException(
          requestedRole
            ? '该图尚未生成成功，无法导出'
            : '请先完成九张图片后再导出整套 ZIP',
        );
      }
      return source;
    });
    const rendered = await Promise.all(
      selected.map(async (source) => ({
        role: source.imageRole,
        buffer: await renderExportImage({
          source: await this.readObject(source.objectKey),
          role: source.imageRole,
          copy: marketingCopyForRole(parsedAnalysis.data, source.imageRole),
          format,
        }),
      })),
    );
    const projectSlug = slugify(project.name);
    if (requestedRole) {
      const item = rendered[0] as { role: ImageRole; buffer: Buffer };
      const originalName = `${projectSlug}-${item.role}-${EXPORT_SIZE}x${EXPORT_SIZE}.${format}`;
      const asset = await this.saveOrReuse({
        userId,
        projectId,
        imageRole: item.role,
        originalName,
        mimeType: format === 'png' ? 'image/png' : 'image/jpeg',
        extension: format,
        buffer: item.buffer,
      });
      return { asset, bundle: false };
    }
    const zipFiles = Object.fromEntries(
      rendered.map((item, index) => [
        `${String(index + 1).padStart(2, '0')}-${item.role}.${format}`,
        new Uint8Array(item.buffer),
      ]),
    );
    const bundle = Buffer.from(zipSync(zipFiles, { level: 0 }));
    const asset = await this.saveOrReuse({
      userId,
      projectId,
      imageRole: null,
      originalName: `${projectSlug}-image-set-${format}.zip`,
      mimeType: 'application/zip',
      extension: 'zip',
      buffer: bundle,
    });
    return { asset, bundle: true };
  }

  private async latestSources(
    userId: string,
    projectId: string,
  ): Promise<Map<ImageRole, SourceAsset>> {
    const result = await this.database.client.pool.query<SourceAsset>(
      `select distinct on (image_role) image_role as "imageRole", object_key as "objectKey"
       from assets
       where project_id = $1 and owner_user_id = $2 and asset_type = 'generated'
         and image_role = any($3::text[]) and status = 'ready' and deleted_at is null
       order by image_role, created_at desc`,
      [projectId, userId, IMAGE_ROLES],
    );
    return new Map(result.rows.map((asset) => [asset.imageRole, asset]));
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

  private async saveOrReuse(input: {
    userId: string;
    projectId: string;
    imageRole: ImageRole | null;
    originalName: string;
    mimeType: string;
    extension: string;
    buffer: Buffer;
  }): Promise<ExportAsset> {
    const checksum = createHash('sha256').update(input.buffer).digest('hex');
    const existing = await this.database.client.pool.query<ExportAsset>(
      `${this.assetSelect()}
       where project_id = $1 and owner_user_id = $2 and asset_type = 'export'
         and checksum = $3 and original_name = $4 and status = 'ready'
         and deleted_at is null order by created_at desc limit 1`,
      [input.projectId, input.userId, checksum, input.originalName],
    );
    if (existing.rows[0]) return existing.rows[0];
    const id = randomUUID();
    const objectKey = `${input.userId}/${input.projectId}/exports/${id}.${input.extension}`;
    await this.storage.putObject(
      this.bucket,
      objectKey,
      input.buffer,
      input.buffer.length,
      {
        'Content-Type': input.mimeType,
        'x-amz-meta-sha256': checksum,
      },
    );
    try {
      const inserted = await this.database.client.pool.query<ExportAsset>(
        `insert into assets(id, project_id, owner_user_id, asset_type, image_role,
                            object_key, original_name, mime_type, width, height,
                            file_size, checksum, status)
         values ($1,$2,$3,'export',$4,$5,$6,$7,$8,$8,$9,$10,'ready')
         returning id, project_id as "projectId", asset_type as "assetType",
                   image_role as "imageRole", original_name as "originalName",
                   mime_type as "mimeType", width, height, file_size as "fileSize",
                   created_at as "createdAt"`,
        [
          id,
          input.projectId,
          input.userId,
          input.imageRole,
          objectKey,
          input.originalName,
          input.mimeType,
          EXPORT_SIZE,
          input.buffer.length,
          checksum,
        ],
      );
      return inserted.rows[0] as ExportAsset;
    } catch (error) {
      await this.storage
        .removeObject(this.bucket, objectKey)
        .catch(() => undefined);
      throw error;
    }
  }

  private assetSelect(): string {
    return `select id, project_id as "projectId", asset_type as "assetType",
                   image_role as "imageRole", original_name as "originalName",
                   mime_type as "mimeType", width, height, file_size as "fileSize",
                   created_at as "createdAt" from assets`;
  }
}

@Controller()
@UseGuards(AuthGuard)
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  @Post('projects/:projectId/exports')
  create(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Body() input: CreateExportDto,
  ) {
    return this.exportsService.create(
      user.id,
      projectId,
      input.format,
      input.role,
    );
  }
}

function slugify(value: string): string {
  return (
    value
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 80) || 'product'
  );
}
