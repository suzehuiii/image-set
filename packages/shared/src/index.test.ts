import { describe, expect, it } from 'vitest';

import {
  consistencyReviewSchema,
  generationSnapshotSchema,
  healthResponseSchema,
  IMAGE_ROLES,
  productAnalysisSchema,
} from './index.js';

describe('shared contracts', () => {
  it('accepts a valid health payload', () => {
    const result = healthResponseSchema.safeParse({
      service: 'api',
      status: 'ok',
      timestamp: new Date().toISOString(),
      dependencies: { postgres: 'up' },
    });

    expect(result.success).toBe(true);
  });

  it('defines the nine ecommerce image slots', () => {
    expect(IMAGE_ROLES).toEqual([
      'main',
      'feature_1',
      'feature_2',
      'feature_3',
      'feature_4',
      'lifestyle_1',
      'lifestyle_2',
      'lifestyle_3',
      'detail',
    ]);
  });

  it('validates a complete bilingual product analysis', () => {
    const bilingual = { en: 'Insulated bottle', zh: '保温杯' };
    const result = productAnalysisSchema.safeParse({
      productName: bilingual,
      title: bilingual,
      keywords: [bilingual],
      sellingPoints: [
        { ...bilingual, evidence: 'Declared in the product brief.' },
      ],
      description: bilingual,
      missingInformation: [],
      complianceFlags: [],
      imagePlan: IMAGE_ROLES.map((role) => ({
        role,
        objective: `Show ${role}`,
        visualDirection: 'Keep the product appearance accurate.',
        copyEn: role === 'main' ? '' : 'Built for daily use',
        copyZh: role === 'main' ? '' : '适合日常使用',
      })),
    });

    expect(result.success).toBe(true);
  });

  it('rejects an image plan without all nine ordered roles', () => {
    const invalid = productAnalysisSchema.safeParse({
      productName: { en: 'Bottle', zh: '杯子' },
      title: { en: 'Bottle', zh: '杯子' },
      keywords: [{ en: 'bottle', zh: '杯子' }],
      sellingPoints: [
        { en: 'Durable', zh: '耐用', evidence: 'User supplied.' },
      ],
      description: { en: 'Bottle', zh: '杯子' },
      missingInformation: [],
      complianceFlags: [],
      imagePlan: [],
    });

    expect(invalid.success).toBe(false);
  });

  it('validates generation snapshots and consistency reviews', () => {
    const analysis = {
      productName: { en: 'Bottle', zh: '杯子' },
      title: { en: 'Bottle', zh: '杯子' },
      keywords: [{ en: 'bottle', zh: '杯子' }],
      sellingPoints: [
        { en: 'Reusable', zh: '可重复使用', evidence: 'Visible body.' },
      ],
      description: { en: 'Bottle', zh: '杯子' },
      missingInformation: [],
      complianceFlags: [],
      imagePlan: IMAGE_ROLES.map((role) => ({
        role,
        objective: `Show ${role}`,
        visualDirection: 'Preserve the product.',
        copyEn: role === 'main' ? '' : 'Daily use',
        copyZh: role === 'main' ? '' : '日常使用',
      })),
    };
    expect(
      generationSnapshotSchema.safeParse({
        role: 'main',
        targetPlatform: 'amazon_us',
        targetLocale: 'en-US',
        productCategory: null,
        productBrief: {},
        analysis,
        productAssetIds: ['11111111-1111-4111-8111-111111111111'],
        referenceAssetIds: [],
        requestType: 'full_set',
      }).success,
    ).toBe(true);
    expect(
      consistencyReviewSchema.safeParse({
        status: 'review_required',
        summary: 'The cap shape may differ.',
        differences: [
          {
            aspect: 'shape',
            severity: 'medium',
            description: 'Generated cap appears wider.',
          },
        ],
        unverifiedClaims: [],
      }).success,
    ).toBe(true);
  });
});
