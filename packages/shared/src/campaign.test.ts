import { describe, it, expect } from 'vitest';
import {
  browserLocale,
  outputLocale,
  campaignRoles,
  DEFAULT_CAMPAIGN_CONFIG,
  ratioDimensions,
  validateCampaign,
  productBriefAnalysisSchema,
  campaignSchema,
  confirmedBrief,
} from './index.js';
const item = {
  text: 'Steel bottle',
  source: 'image',
  evidence: 'Photo 1',
  confirmed: true,
};
const brief = productBriefAnalysisSchema.parse({
  schemaVersion: 2,
  analysisLocale: 'zh-CN',
  confirmed: true,
  campaign: null,
  product: item,
  functions: [],
  sellingPoints: [item, { ...item, confirmed: false }],
  audience: [],
  scenes: [],
  specifications: [],
  appearance: 'Blue steel body',
  accessories: [],
  packaging: [],
  forbiddenChanges: [],
  missingInformation: [],
  warnings: [],
});
const config = { ...DEFAULT_CAMPAIGN_CONFIG, pack: 'gallery' as const };
const campaign = campaignSchema.parse({
  id: '11111111-1111-4111-8111-111111111111',
  version: 'ecom-skill-v1',
  config,
  targetLocale: 'en-US',
  confirmed: true,
  driver: 'visual',
  styleLock: '#FFFFFF background, charcoal text',
  images: campaignRoles(config).map((role, i) => ({
    role,
    title: role,
    templateId: 'infographic',
    objective: 'Explain real product',
    composition: 'Product left, short text right',
    copy: i ? 'Steel body' : '',
    factRefs: ['sellingPoints.0'],
  })),
});
describe('campaign contracts', () => {
  it('separates browser language from target market', () => {
    expect(browserLocale('ja-JP')).toBe('ja-JP');
    expect(browserLocale('zh-Hant-TW')).toBe('zh-TW');
    expect(browserLocale('xx-XX')).toBe('en-US');
    expect(outputLocale('amazon_us', 'ja-JP')).toBe('en-US');
    expect(outputLocale('amazon_jp', 'en-US')).toBe('ja-JP');
    expect(outputLocale('shopify', 'de-DE')).toBe('de-DE');
  });
  it('plans bounded gallery and PDP image counts', () => {
    expect(campaignRoles(config)).toHaveLength(5);
    expect(campaignRoles(DEFAULT_CAMPAIGN_CONFIG)).toHaveLength(13);
    expect(
      campaignRoles({ ...DEFAULT_CAMPAIGN_CONFIG, detailCount: 9 }),
    ).toHaveLength(14);
  });
  it('requires ordered slots, confirmed evidence and an unlettered hero', () => {
    expect(validateCampaign(brief, campaign)).toBe(true);
    const altered = structuredClone(campaign);
    altered.images[1]!.factRefs = ['sellingPoints.1'];
    expect(validateCampaign(brief, altered)).toBe(false);
    altered.images[1]!.factRefs = ['sellingPoints.0'];
    altered.images[0]!.copy = 'SALE';
    expect(validateCampaign(brief, altered)).toBe(false);
    altered.images.reverse();
    expect(validateCampaign(brief, altered)).toBe(false);
  });
  it('excludes unconfirmed facts and maps portrait export dimensions', () => {
    expect(confirmedBrief(brief).sellingPoints).toHaveLength(1);
    expect(ratioDimensions('2:3')).toEqual({ width: 1360, height: 2040 });
  });
});
