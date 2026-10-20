import { describe, it, expect, vi } from 'vitest';
import {
  productBriefAnalysisSchema,
  campaignSchema,
  campaignRoles,
  DEFAULT_CAMPAIGN_CONFIG,
} from '@image-set/shared';
import { OpenAiProvider, buildCampaignPrompt } from './index.js';
const item = {
  text: 'Steel body',
  source: 'image',
  evidence: 'Image 1',
  confirmed: true,
};
const brief = productBriefAnalysisSchema.parse({
  schemaVersion: 2,
  analysisLocale: 'ja-JP',
  confirmed: true,
  campaign: null,
  product: item,
  functions: [],
  sellingPoints: [item],
  audience: [],
  scenes: [],
  specifications: [],
  appearance: 'Blue bottle',
  accessories: [],
  packaging: ['Box'],
  forbiddenChanges: ['Do not change cap'],
  missingInformation: [],
  warnings: [],
});
const config = { ...DEFAULT_CAMPAIGN_CONFIG, pack: 'gallery' as const };
const output = {
  driver: 'visual',
  styleLock:
    'Fixed #FFFFFF background, #222222 text, blue accent; studio light upper-left.',
  images: campaignRoles(config).map((role, i) => ({
    role,
    title: role,
    templateId: 'infographic',
    objective: 'Show confirmed material',
    composition: 'Close-up with short label',
    copy: i ? 'Steel body' : '',
    factRefs: ['sellingPoints.0'],
  })),
};
describe('skill provider', () => {
  it('extracts browser-language brief and never silently confirms facts', async () => {
    const parse = vi.fn().mockResolvedValue({ output_parsed: brief });
    const provider = new OpenAiProvider('test', {}, { responses: { parse } });
    const result = await provider.analyzeBrief({
      projectId: 'p',
      productAssets: [{ mimeType: 'image/png', base64Data: 'aQ==' }],
      productCategory: null,
      productBrief: {},
      targetPlatform: 'amazon_us',
      targetLocale: 'en-US',
      analysisLocale: 'ja-JP',
    });
    expect(result.analysisLocale).toBe('ja-JP');
    expect(result.product.confirmed).toBe(false);
    expect(result.campaign).toBeNull();
    expect(JSON.stringify(parse.mock.calls[0]?.[0])).toContain('ja-JP');
  });
  it('uses reference content only when the project opt-in is enabled', async () => {
    const parse = vi.fn().mockResolvedValue({ output_parsed: brief });
    const provider = new OpenAiProvider('test', {}, { responses: { parse } });
    await provider.analyzeBrief({
      projectId: 'p',
      productAssets: [{ mimeType: 'image/png', base64Data: 'cHJvZHVjdA==' }],
      referenceAssets: [{ mimeType: 'image/png', base64Data: 'cmVmZXJlbmNl' }],
      referenceContentEnabled: true,
      productCategory: null,
      productBrief: {},
      targetPlatform: 'amazon_us',
      targetLocale: 'en-US',
    });
    const request = JSON.stringify(parse.mock.calls[0]?.[0]);
    expect(request).toContain('参考图启发，需确认');
    expect(request).toContain('cmVmZXJlbmNl');
  });
  it('plans with references and injects real templates', async () => {
    const parse = vi.fn().mockResolvedValue({ output_parsed: output });
    const provider = new OpenAiProvider('test', {}, { responses: { parse } });
    const campaign = await provider.planCampaign({
      brief,
      config,
      targetPlatform: 'amazon_us',
      targetLocale: 'en-US',
      referenceAssets: [{ mimeType: 'image/png', base64Data: 'aQ==' }],
    });
    expect(campaign.targetLocale).toBe('en-US');
    expect(campaign.confirmed).toBe(false);
    expect(JSON.stringify(parse.mock.calls[0]?.[0])).toContain(
      'prompt_template',
    );
  });
  it('reuses identical style lock and only includes selected exact copy', () => {
    const campaign = campaignSchema.parse({
      ...output,
      id: '11111111-1111-4111-8111-111111111111',
      config,
      targetLocale: 'en-US',
      confirmed: true,
      version: 'ecom-skill-v1',
    });
    const first = buildCampaignPrompt(
      { ...brief, campaign },
      'gallery_1',
      'amazon_us',
    );
    const next = buildCampaignPrompt(
      { ...brief, campaign },
      'gallery_2',
      'amazon_us',
    );
    expect(first.startsWith(campaign.styleLock)).toBe(true);
    expect(next.startsWith(campaign.styleLock)).toBe(true);
    expect(first).toContain('禁止任何营销文字');
    expect(next).toContain('Steel body');
    expect(next).not.toContain('画面中不得生成任何单词');
  });
  it('uses a portrait generation canvas when requested', async () => {
    const edit = vi.fn().mockResolvedValue({ data: [{ b64_json: 'aQ==' }] });
    await new OpenAiProvider('test', {}, { images: { edit } }).generateImage({
      role: 'pdp_1',
      prompt: 'Portrait infographic',
      aspectRatio: '2:3',
      productAssets: [{ mimeType: 'image/png', base64Data: 'aQ==' }],
      referenceAssets: [],
      safetyIdentifier: 'test',
    });
    expect(edit.mock.calls[0]?.[0]).toMatchObject({ size: '1024x1536' });
  });
});
