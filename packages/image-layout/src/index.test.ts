import { describe, expect, it } from 'vitest';
import { IMAGE_ROLES } from '@image-set/shared';
import sharp from 'sharp';

import {
  buildImagePrompt,
  buildMarketingOverlay,
  getDefaultLayout,
  marketingCopyForRole,
  renderExportImage,
} from './index.js';

const analysis = {
  productName: { en: 'Bottle', zh: '杯子' },
  title: { en: 'Bottle', zh: '杯子' },
  keywords: [{ en: 'bottle', zh: '杯子' }],
  sellingPoints: [{ en: 'Steel body', zh: '钢制瓶身', evidence: 'Visible.' }],
  description: { en: 'Bottle', zh: '杯子' },
  missingInformation: [],
  complianceFlags: [],
  imagePlan: IMAGE_ROLES.map((role) => ({
    role,
    objective: `Show ${role}`,
    visualDirection: 'Preserve appearance.',
    copyEn: role === 'main' ? '' : 'Durable & easy to use',
    copyZh: role === 'main' ? '' : '耐用易使用',
  })),
};

describe('default image layout', () => {
  it('forbids marketing copy on the main image', () => {
    expect(getDefaultLayout('main').allowsMarketingCopy).toBe(false);
  });

  it('uses the MVP export dimensions', () => {
    expect(getDefaultLayout('feature_1')).toMatchObject({
      width: 2048,
      height: 2048,
    });
  });

  it('builds role and platform-specific prompts without model-rendered copy', () => {
    const prompt = buildImagePrompt({
      role: 'main',
      targetPlatform: 'amazon_us',
      targetLocale: 'en-US',
      productReferenceCount: 2,
      styleReferenceCount: 1,
      analysis,
    });
    expect(prompt).toContain('纯白色（#FFFFFF）背景');
    expect(prompt).toContain('前 2 张图片');
    expect(prompt).toContain('不得生成任何单词、字母、数字');
  });

  it('uses saved English plan copy and never returns copy for the main image', () => {
    expect(marketingCopyForRole(analysis, 'feature_1')).toBe(
      'Durable & easy to use',
    );
    expect(marketingCopyForRole(analysis, 'main')).toBe('');
  });

  it('escapes marketing copy in the deterministic SVG template', () => {
    const overlay = buildMarketingOverlay('feature_1', 'Fast & <simple>');
    expect(overlay?.toString()).toContain('Fast &amp; &lt;simple&gt;');
    expect(buildMarketingOverlay('main', 'Forbidden')).toBeUndefined();
  });

  it('renders normalized PNG and JPG exports at 2048 square', async () => {
    const source = await sharp({
      create: {
        width: 256,
        height: 256,
        channels: 3,
        background: '#e3d7cf',
      },
    })
      .png()
      .toBuffer();
    const [main, feature] = await Promise.all([
      renderExportImage({
        source,
        role: 'main',
        copy: 'Forbidden',
        format: 'png',
      }),
      renderExportImage({
        source,
        role: 'feature_1',
        copy: 'Durable & easy to use',
        format: 'jpg',
      }),
    ]);
    await expect(sharp(main).metadata()).resolves.toMatchObject({
      width: 2048,
      height: 2048,
      format: 'png',
    });
    await expect(sharp(feature).metadata()).resolves.toMatchObject({
      width: 2048,
      height: 2048,
      format: 'jpeg',
    });
    expect(feature.equals(main)).toBe(false);
  });
  it('exports a direct portrait without adding the legacy text overlay', async () => {
    const source = await sharp({
      create: { width: 136, height: 204, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();
    const first = await renderExportImage({
      source,
      role: 'pdp_1',
      copy: 'Must not be added',
      format: 'png',
      direct: true,
      width: 1360,
      height: 2040,
    });
    const second = await renderExportImage({
      source,
      role: 'pdp_1',
      copy: 'Different copy',
      format: 'png',
      direct: true,
      width: 1360,
      height: 2040,
    });
    expect(first.equals(second)).toBe(true);
    expect(await sharp(first).metadata()).toMatchObject({
      width: 1360,
      height: 2040,
    });
  });
});
