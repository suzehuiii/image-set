import { describe, expect, it } from 'vitest';

import {
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

  it('defines the four MVP image roles', () => {
    expect(IMAGE_ROLES).toEqual(['main', 'feature', 'lifestyle', 'detail']);
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

  it('rejects an image plan without all four ordered roles', () => {
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
});
