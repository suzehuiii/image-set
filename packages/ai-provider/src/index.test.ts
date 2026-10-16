import { describe, expect, it, vi } from 'vitest';
import { IMAGE_ROLES } from '@image-set/shared';

import { OpenAiProvider, resolveOpenAiProviderRouting } from './index.js';

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
  imagePlan: IMAGE_ROLES.map((role) => ({
    role,
    objective: `Create the ${role} image`,
    visualDirection: 'Preserve the real product appearance.',
    copyEn: role === 'main' ? '' : `Benefit for ${role}`,
    copyZh: role === 'main' ? '' : `${role} 卖点`,
  })),
};

describe('OpenAiProvider', () => {
  it('routes every task to its dedicated gateway key without falling back', () => {
    expect(
      resolveOpenAiProviderRouting({
        OPENAI_BASE_URL: 'https://gateway.example.com/v1',
        OPENAI_API_KEY: 'official-fallback-key',
        OPENAI_ANALYSIS_API_KEY: 'analysis-key',
        OPENAI_IMAGE_API_KEY: 'image-key',
        OPENAI_REVIEW_API_KEY: 'review-key',
      }),
    ).toMatchObject({
      baseURL: 'https://gateway.example.com/v1',
      dedicatedKeysEnabled: true,
      apiKeys: {
        analysis: 'analysis-key',
        image: 'image-key',
        review: 'review-key',
      },
    });
  });

  it('uses the explicitly documented legacy key only when no dedicated key exists', () => {
    expect(
      resolveOpenAiProviderRouting({
        OPENAI_API_KEY: 'official-fallback-key',
      }).apiKeys,
    ).toEqual({
      analysis: 'official-fallback-key',
      image: 'official-fallback-key',
      review: 'official-fallback-key',
    });
  });

  it('sends image data to Responses and validates structured output', async () => {
    const parse = vi.fn().mockResolvedValue({
      output_parsed: completeAnalysis,
      output: [],
    });
    const provider = new OpenAiProvider(
      'test-key',
      { analysisModel: 'gpt-6.1-sol' },
      { responses: { parse } },
    );

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
    const serializedRequest = JSON.stringify(parse.mock.calls[0]?.[0]);
    expect(serializedRequest).toContain(
      '你负责为中国跨境卖家分析真实的电商商品照片',
    );
    expect(serializedRequest).toContain('请分析这个面向 amazon_us');
  });

  it('maps empty structured output to a safe provider error', async () => {
    const provider = new OpenAiProvider(
      'test-key',
      {},
      {
        responses: {
          parse: vi.fn().mockResolvedValue({ output_parsed: null, output: [] }),
        },
      },
    );
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

  it('uses image editing with references and returns PNG data', async () => {
    const edit = vi.fn().mockResolvedValue({
      data: [{ b64_json: Buffer.from('generated').toString('base64') }],
    });
    const provider = new OpenAiProvider(
      'test-key',
      { imageModel: 'gpt-image-2.5-sunburst' },
      { images: { edit } },
    );
    const result = await provider.generateImage({
      role: 'main',
      prompt: 'Create a faithful product image.',
      productAssets: [{ mimeType: 'image/jpeg', base64Data: 'aW1hZ2U=' }],
      referenceAssets: [],
      safetyIdentifier: 'safe-user-hash',
    });
    expect(result.mimeType).toBe('image/png');
    expect(edit).toHaveBeenCalledOnce();
    expect(edit.mock.calls[0]?.[0]).toMatchObject({
      model: 'gpt-image-2.5-sunburst',
      size: '1024x1024',
      output_format: 'png',
    });
  });

  it('validates structured consistency review output', async () => {
    const parse = vi.fn().mockResolvedValue({
      output_parsed: {
        status: 'passed',
        summary: 'No meaningful inconsistency found.',
        differences: [],
        unverifiedClaims: [],
      },
      output: [],
    });
    const provider = new OpenAiProvider(
      'test-key',
      { reviewModel: 'gpt-6-luna' },
      { responses: { parse } },
    );
    const result = await provider.reviewConsistency({
      role: 'main',
      productBrief: {},
      productAssets: [{ mimeType: 'image/jpeg', base64Data: 'aW1hZ2U=' }],
      generatedAsset: { mimeType: 'image/png', base64Data: 'aW1hZ2U=' },
    });
    expect(result.status).toBe('passed');
    expect(parse.mock.calls[0]?.[0]).toMatchObject({ model: 'gpt-6-luna' });
    const serializedRequest = JSON.stringify(parse.mock.calls[0]?.[0]);
    expect(serializedRequest).toContain('你是一名严格的电商商品一致性审核员');
    expect(serializedRequest).toContain(
      '请将生成的 main 图片与真实商品参考图进行一致性审核',
    );
  });
});
