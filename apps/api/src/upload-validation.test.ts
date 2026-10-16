import { zipSync, strToU8 } from 'fflate';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { inspectUpload, parseUploadAssetType } from './upload-validation.js';

function uploadFile(
  buffer: Buffer,
  originalname: string,
  mimetype: string,
): Pick<Express.Multer.File, 'buffer' | 'mimetype' | 'originalname'> {
  return { buffer, originalname, mimetype };
}

describe('upload validation', () => {
  it('accepts a valid product image and reads its dimensions', async () => {
    const buffer = await sharp({
      create: {
        width: 256,
        height: 300,
        channels: 3,
        background: '#ffffff',
      },
    })
      .png()
      .toBuffer();

    await expect(
      inspectUpload('product', uploadFile(buffer, 'product.png', 'image/png')),
    ).resolves.toMatchObject({
      extension: 'png',
      mimeType: 'image/png',
      width: 256,
      height: 300,
    });
  });

  it('accepts signature-matched PDF, DOC and DOCX manuals', async () => {
    const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF');
    const doc = Buffer.concat([
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
      Buffer.alloc(504),
    ]);
    const docx = Buffer.from(
      zipSync({
        '[Content_Types].xml': strToU8(
          '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        ),
        'word/document.xml': strToU8(
          '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>',
        ),
      }),
    );

    await expect(
      inspectUpload('manual', uploadFile(pdf, 'manual.pdf', 'application/pdf')),
    ).resolves.toMatchObject({ extension: 'pdf', width: null, height: null });
    await expect(
      inspectUpload(
        'manual',
        uploadFile(doc, 'manual.doc', 'application/msword'),
      ),
    ).resolves.toMatchObject({
      extension: 'doc',
      mimeType: 'application/msword',
    });
    await expect(
      inspectUpload(
        'manual',
        uploadFile(
          docx,
          'manual.docx',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ),
      ),
    ).resolves.toMatchObject({ extension: 'docx' });
  });

  it('rejects renamed or unsupported manual files', async () => {
    await expect(
      inspectUpload(
        'manual',
        uploadFile(
          Buffer.from('not a document'),
          'manual.pdf',
          'application/pdf',
        ),
      ),
    ).rejects.toThrow('产品说明书仅支持真实的 PDF、DOC 或 DOCX 文件');
  });

  it('rejects an image with a mismatched filename extension', async () => {
    const buffer = await sharp({
      create: {
        width: 256,
        height: 256,
        channels: 3,
        background: '#ffffff',
      },
    })
      .png()
      .toBuffer();

    await expect(
      inspectUpload('reference', uploadFile(buffer, 'image.jpg', 'image/png')),
    ).rejects.toThrow('仅支持真实的 JPG、PNG 或 WebP 图片');
  });

  it('recognizes only uploadable source asset types', () => {
    expect(parseUploadAssetType('manual')).toBe('manual');
    expect(() => parseUploadAssetType('generated')).toThrow(
      'assetType 必须是 product、reference 或 manual',
    );
  });
});
