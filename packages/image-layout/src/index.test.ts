import { describe, expect, it } from 'vitest';
import { IMAGE_ROLES } from '@image-set/shared';

import { buildImagePrompt, getDefaultLayout } from './index.js';

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
      analysis: {
        productName: { en: 'Bottle', zh: '杯子' },
        title: { en: 'Bottle', zh: '杯子' },
        keywords: [{ en: 'bottle', zh: '杯子' }],
        sellingPoints: [
          { en: 'Steel body', zh: '钢制瓶身', evidence: 'Visible.' },
        ],
        description: { en: 'Bottle', zh: '杯子' },
        missingInformation: [],
        complianceFlags: [],
        imagePlan: IMAGE_ROLES.map((role) => ({
          role,
          objective: `Show ${role}`,
          visualDirection: 'Preserve appearance.',
          copyEn: role === 'main' ? '' : 'Copy',
          copyZh: role === 'main' ? '' : '文案',
        })),
      },
    });
    expect(prompt).toContain('pure white (#FFFFFF)');
    expect(prompt).toContain('first 2 image(s)');
    expect(prompt).toContain('without any words');
  });
});
