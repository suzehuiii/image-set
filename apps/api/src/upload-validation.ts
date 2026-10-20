import sharp from 'sharp';
import { BadRequestException } from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';
import { imageSize } from 'image-size';
import { extname } from 'node:path';

export type UploadAssetType = 'product' | 'reference' | 'manual';

type UploadFile = Pick<
  Express.Multer.File,
  'buffer' | 'mimetype' | 'originalname'
>;

export type UploadInspection = {
  extension: string;
  mimeType: string;
  width: number | null;
  height: number | null;
};

const IMAGE_EXTENSIONS = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/avif', 'avif'],
]);

const IMAGE_FILENAME_EXTENSIONS = new Map([
  ['image/jpeg', ['.jpg', '.jpeg']],
  ['image/png', ['.png']],
  ['image/webp', ['.webp']],
  ['image/avif', ['.avif']],
]);

const GENERIC_MIME = 'application/octet-stream';

function hasDeclaredMime(file: UploadFile, allowed: string[]): boolean {
  return file.mimetype === GENERIC_MIME || allowed.includes(file.mimetype);
}

async function inspectManual(file: UploadFile): Promise<UploadInspection> {
  const detected = await fileTypeFromBuffer(file.buffer);
  const extension = extname(file.originalname).toLowerCase();

  if (
    extension === '.pdf' &&
    detected?.mime === 'application/pdf' &&
    hasDeclaredMime(file, ['application/pdf'])
  ) {
    return {
      extension: 'pdf',
      mimeType: 'application/pdf',
      width: null,
      height: null,
    };
  }

  if (
    extension === '.docx' &&
    detected?.ext === 'docx' &&
    hasDeclaredMime(file, [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ])
  ) {
    return {
      extension: 'docx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      width: null,
      height: null,
    };
  }

  if (
    extension === '.doc' &&
    detected?.mime === 'application/x-cfb' &&
    hasDeclaredMime(file, ['application/msword', 'application/x-cfb'])
  ) {
    return {
      extension: 'doc',
      mimeType: 'application/msword',
      width: null,
      height: null,
    };
  }

  throw new BadRequestException('产品说明书仅支持真实的 PDF、DOC 或 DOCX 文件');
}

async function inspectImage(
  file: UploadFile,
  assetType: UploadAssetType,
): Promise<UploadInspection> {
  const detected = await fileTypeFromBuffer(file.buffer);
  const extension = detected ? IMAGE_EXTENSIONS.get(detected.mime) : undefined;
  const filenameExtensions = detected
    ? IMAGE_FILENAME_EXTENSIONS.get(detected.mime)
    : undefined;
  const filenameExtension = extname(file.originalname).toLowerCase();
  if (
    !detected ||
    !extension ||
    (detected.mime === 'image/avif' && assetType !== 'reference') ||
    !filenameExtensions?.includes(filenameExtension) ||
    (file.mimetype !== detected.mime && file.mimetype !== GENERIC_MIME)
  ) {
    throw new BadRequestException(
      assetType === 'reference'
        ? '参考图仅支持真实的 JPG、PNG、WebP 或 AVIF 图片'
        : '仅支持真实的 JPG、PNG 或 WebP 图片',
    );
  }

  let dimensions: ReturnType<typeof imageSize>;
  try {
    dimensions = imageSize(file.buffer);
  } catch {
    throw new BadRequestException('图片已损坏或无法读取');
  }
  if (!dimensions.width || !dimensions.height) {
    throw new BadRequestException('无法读取图片尺寸');
  }
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

  if (detected.mime === 'image/avif') {
    try {
      await sharp(file.buffer, { limitInputPixels: 40_000_000 }).stats();
    } catch {
      throw new BadRequestException('AVIF 图片已损坏或无法解码');
    }
  }

  return {
    extension,
    mimeType: detected.mime,
    width: dimensions.width,
    height: dimensions.height,
  };
}

export function parseUploadAssetType(value: string): UploadAssetType {
  if (value === 'product' || value === 'reference' || value === 'manual') {
    return value;
  }
  throw new BadRequestException(
    'assetType 必须是 product、reference 或 manual',
  );
}

export async function inspectUpload(
  assetType: UploadAssetType,
  file: UploadFile,
): Promise<UploadInspection> {
  return assetType === 'manual'
    ? inspectManual(file)
    : inspectImage(file, assetType);
}
