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
    expect(getDefaultLayout('feature')).toMatchObject({
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
    expect(prompt).toContain('pure white (#FFFFFF)');
    expect(prompt).toContain('first 2 image(s)');
    expect(prompt).toContain('without any words');
  });

  it('uses saved English plan copy and never returns copy for the main image', () => {
    expect(marketingCopyForRole(analysis, 'feature')).toBe(
      'Durable & easy to use',
    );
    expect(marketingCopyForRole(analysis, 'main')).toBe('');
  });

  it('escapes marketing copy in the deterministic SVG template', () => {
    const overlay = buildMarketingOverlay('feature', 'Fast & <simple>');
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
        role: 'feature',
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
});
