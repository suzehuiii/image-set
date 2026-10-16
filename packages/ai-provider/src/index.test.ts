import { describe, expect, it, vi } from 'vitest';

import { OpenAiProvider } from './index.js';

const completeAnalysis = {
  productName: { en: 'Steel bottle', zh: '不锈钢水瓶' },
  title: { en: 'Reusable Steel Bottle', zh: '可重复使用不锈钢水瓶' },
  keywords: [{ en: 'steel bottle', zh: '不锈钢水瓶' }],
  sellingPoints: [
    {
      en: 'Reusable design',
      zh: '可重复使用设计',
      evidence: 'The product image visibly shows a reusable bottle body.',
    },
  ],
  description: { en: 'A reusable bottle.', zh: '一款可重复使用的水瓶。' },
  missingInformation: ['Capacity is not visible.'],
  complianceFlags: [],
  imagePlan: [
    ['main', '', ''],
    ['feature', 'Reusable', '可重复使用'],
    ['lifestyle', 'Everyday hydration', '日常饮水'],
    ['detail', 'Clean finish', '简洁表面'],
  ].map(([role, copyEn, copyZh]) => ({
    role,
    objective: `Create the ${role} image`,
    visualDirection: 'Preserve the real product appearance.',
    copyEn,
    copyZh,
  })),
};

describe('OpenAiProvider', () => {
  it('sends image data to Responses and validates structured output', async () => {
    const parse = vi.fn().mockResolvedValue({
      output_parsed: completeAnalysis,
      output: [],
    });
    const provider = new OpenAiProvider('test-key', 'gpt-6.1-sol', { parse });

    const result = await provider.analyzeProduct({
      projectId: 'project-1',
      targetPlatform: 'amazon_us',
      targetLocale: 'en-US',
      productCategory: 'Drinkware',
      productBrief: { material: 'steel' },
      productAssets: [{ mimeType: 'image/png', base64Data: 'aW1hZ2U=' }],
    });

    expect(result.productName.en).toBe('Steel bottle');
    expect(parse).toHaveBeenCalledOnce();
    expect(parse.mock.calls[0]?.[0]).toMatchObject({
      model: 'gpt-6.1-sol',
      store: false,
    });
  });

  it('maps empty structured output to a safe provider error', async () => {
    const provider = new OpenAiProvider('test-key', 'gpt-6.1-sol', {
      parse: vi.fn().mockResolvedValue({ output_parsed: null, output: [] }),
    });

    await expect(
      provider.analyzeProduct({
        projectId: 'project-1',
        targetPlatform: 'amazon_us',
        targetLocale: 'en-US',
        productCategory: null,
        productBrief: {},
        productAssets: [{ mimeType: 'image/png', base64Data: 'aW1hZ2U=' }],
      }),
    ).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' });
  });
});
