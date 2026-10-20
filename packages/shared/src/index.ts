import { z } from 'zod';

export const dependencyStatusSchema = z.enum(['up', 'down']);

export const healthResponseSchema = z.object({
  service: z.string().min(1),
  status: z.enum(['ok', 'degraded']),
  timestamp: z.iso.datetime(),
  dependencies: z.record(z.string(), dependencyStatusSchema).optional(),
});

export type DependencyStatus = z.infer<typeof dependencyStatusSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const IMAGE_ROLES = [
  'main',
  'feature_1',
  'feature_2',
  'feature_3',
  'feature_4',
  'lifestyle_1',
  'lifestyle_2',
  'lifestyle_3',
  'detail',
] as const;
export const CAMPAIGN_ROLES = [
  'gallery_1',
  'gallery_2',
  'gallery_3',
  'gallery_4',
  'gallery_5',
  'pdp_1',
  'pdp_2',
  'pdp_3',
  'pdp_4',
  'pdp_5',
  'pdp_6',
  'pdp_7',
  'pdp_8',
  'pdp_9',
] as const;
export const ALL_IMAGE_ROLES = [...IMAGE_ROLES, ...CAMPAIGN_ROLES] as const;
export type ImageRole = (typeof ALL_IMAGE_ROLES)[number];

export type ImageRoleKind = 'main' | 'feature' | 'lifestyle' | 'detail';

export function imageRoleKind(role: ImageRole): ImageRoleKind {
  if (role === 'main' || role === 'detail') return role;
  if (
    role.startsWith('feature_') ||
    role.startsWith('gallery_') ||
    role.startsWith('pdp_')
  )
    return 'feature';
  return 'lifestyle';
}

export const bilingualTextSchema = z.object({
  en: z.string().trim().min(1).max(2_000),
  zh: z.string().trim().min(1).max(2_000),
});

export const productAnalysisOutputSchema = z.object({
  productName: bilingualTextSchema,
  title: bilingualTextSchema,
  keywords: z
    .array(
      z.object({
        en: z.string().trim().min(1).max(120),
        zh: z.string().trim().min(1).max(120),
      }),
    )
    .min(1)
    .max(20),
  sellingPoints: z
    .array(
      z.object({
        en: z.string().trim().min(1).max(500),
        zh: z.string().trim().min(1).max(500),
        evidence: z.string().trim().min(1).max(1_000),
      }),
    )
    .min(1)
    .max(8),
  description: bilingualTextSchema,
  missingInformation: z.array(z.string().trim().min(1).max(500)).max(20),
  complianceFlags: z.array(z.string().trim().min(1).max(500)).max(20),
  imagePlan: z
    .array(
      z.object({
        role: z.enum(IMAGE_ROLES),
        objective: z.string().trim().min(1).max(500),
        visualDirection: z.string().trim().min(1).max(1_000),
        copyEn: z.string().trim().max(200),
        copyZh: z.string().trim().max(200),
      }),
    )
    .length(IMAGE_ROLES.length),
});

export const productAnalysisSchema = productAnalysisOutputSchema.superRefine(
  (analysis, context) => {
    for (const [index, expectedRole] of IMAGE_ROLES.entries()) {
      if (analysis.imagePlan[index]?.role !== expectedRole) {
        context.addIssue({
          code: 'custom',
          message: `imagePlan 必须按 ${IMAGE_ROLES.join(', ')} 排列`,
          path: ['imagePlan', index, 'role'],
        });
      }
    }
    if (
      analysis.imagePlan[0]?.copyEn !== '' ||
      analysis.imagePlan[0]?.copyZh !== ''
    ) {
      context.addIssue({
        code: 'custom',
        message: '主图不得包含营销文案',
        path: ['imagePlan', 0],
      });
    }
  },
);

export type ProductAnalysisResult = z.infer<typeof productAnalysisSchema>;

export const consistencyDifferenceSchema = z.object({
  aspect: z.enum([
    'color',
    'shape',
    'structure',
    'logo',
    'material',
    'quantity',
    'accessories',
    'proportion',
    'claims',
  ]),
  severity: z.enum(['low', 'medium', 'high']),
  description: z.string().trim().min(1).max(500),
});

export const consistencyReviewSchema = z.object({
  status: z.enum(['passed', 'review_required']),
  summary: z.string().trim().min(1).max(1_000),
  differences: z.array(consistencyDifferenceSchema).max(20),
  unverifiedClaims: z.array(z.string().trim().min(1).max(500)).max(20),
});

export type ConsistencyReviewResult = z.infer<typeof consistencyReviewSchema>;

export const supportedLocales = [
  'en-US',
  'zh-CN',
  'zh-TW',
  'ja-JP',
  'de-DE',
  'fr-FR',
  'es-ES',
  'it-IT',
  'ko-KR',
  'pt-BR',
] as const;
export const localeSchema = z.enum(supportedLocales);
export function browserLocale(
  value = 'en-US',
): (typeof supportedLocales)[number] {
  const language =
    value.split(',')[0]?.trim().replace('_', '-').toLowerCase() ?? '';
  if (/^zh-(tw|hk|hant)/.test(language)) return 'zh-TW';
  return (
    supportedLocales.find((item) =>
      item.toLowerCase().startsWith(language.split('-')[0] + '-'),
    ) ?? 'en-US'
  );
}
export function outputLocale(platform: string, market: string): string {
  if (platform === 'amazon_us') return 'en-US';
  if (platform === 'amazon_jp') return 'ja-JP';
  if (platform === 'amazon_de') return 'de-DE';
  return localeSchema.parse(market);
}
export const briefItemSchema = z.object({
  text: z.string().trim().min(1).max(1200),
  source: z.enum(['image', 'manual', 'user', 'suggestion']),
  evidence: z.string().trim().max(1000),
  confirmed: z.boolean(),
});
export const productBriefOutputSchema = z.object({
  product: briefItemSchema,
  functions: z.array(briefItemSchema).max(8),
  sellingPoints: z.array(briefItemSchema).max(8),
  audience: z.array(briefItemSchema).max(5),
  scenes: z.array(briefItemSchema).max(6),
  specifications: z.array(briefItemSchema).max(12),
  appearance: z.string().trim().min(1).max(3000),
  accessories: z.array(z.string().max(300)).max(15),
  packaging: z.array(z.string().max(300)).max(15),
  forbiddenChanges: z.array(z.string().max(500)).max(20),
  missingInformation: z.array(z.string().max(500)).max(20),
  warnings: z.array(z.string().max(500)).max(20),
});
export const campaignConfigSchema = z.object({
  pack: z.enum(['gallery', 'full']),
  detailCount: z.number().int().min(7).max(9),
  galleryRatio: z.enum(['1:1', '4:5', '3:4']),
  detailRatio: z.enum(['2:3', '3:4', '4:5']),
  marketLocale: localeSchema,
});
export const DEFAULT_CAMPAIGN_CONFIG: z.infer<typeof campaignConfigSchema> = {
  pack: 'full',
  detailCount: 8,
  galleryRatio: '1:1',
  detailRatio: '2:3',
  marketLocale: 'en-US',
};
export function campaignRoles(
  config: z.infer<typeof campaignConfigSchema>,
): ImageRole[] {
  return [
    ...CAMPAIGN_ROLES.slice(0, 5),
    ...(config.pack === 'full'
      ? CAMPAIGN_ROLES.slice(5, 5 + config.detailCount)
      : []),
  ];
}
export const templateIdSchema = z.enum([
  'hero-image',
  'lifestyle-scene',
  'flat-lay',
  'detail-macro',
  'infographic',
  'size-spec',
  'multi-product',
]);
export const campaignImageSchema = z.object({
  role: z.enum(CAMPAIGN_ROLES),
  title: z.string().trim().min(1).max(120),
  templateId: templateIdSchema,
  objective: z.string().trim().min(1).max(800),
  composition: z.string().trim().min(1).max(2000),
  copy: z.string().trim().max(500),
  factRefs: z
    .array(
      z
        .string()
        .regex(
          /^(product|functions|sellingPoints|audience|scenes|specifications)(\.\d+)?$/,
        ),
    )
    .max(20),
});
export const campaignOutputSchema = z.object({
  driver: z.enum(['visual', 'pain', 'emotional']),
  styleLock: z.string().trim().min(1).max(4000),
  images: z.array(campaignImageSchema).min(5).max(14),
});
export const campaignSchema = campaignOutputSchema.extend({
  id: z.uuid(),
  config: campaignConfigSchema,
  targetLocale: localeSchema,
  confirmed: z.boolean(),
  version: z.literal('ecom-skill-v1'),
});
export const productBriefAnalysisSchema = productBriefOutputSchema.extend({
  schemaVersion: z.literal(2),
  analysisLocale: localeSchema,
  confirmed: z.boolean(),
  campaign: campaignSchema.nullable(),
});
export const projectAnalysisSchema = z.union([
  productBriefAnalysisSchema,
  productAnalysisSchema,
]);
export type ProductBriefAnalysis = z.infer<typeof productBriefAnalysisSchema>;
export type Campaign = z.infer<typeof campaignSchema>;
export type CampaignConfig = z.infer<typeof campaignConfigSchema>;
export type ProjectAnalysis = z.infer<typeof projectAnalysisSchema>;
export function isBrief(
  analysis: ProjectAnalysis,
): analysis is ProductBriefAnalysis {
  return 'schemaVersion' in analysis && analysis.schemaVersion === 2;
}
export function ratioDimensions(ratio: string): {
  width: number;
  height: number;
} {
  const sizes: Record<string, { width: number; height: number }> = {
    '1:1': { width: 2048, height: 2048 },
    '2:3': { width: 1360, height: 2040 },
    '3:4': { width: 1536, height: 2048 },
    '4:5': { width: 1632, height: 2040 },
  };
  return sizes[ratio] ?? sizes['1:1']!;
}
export function imageRatio(campaign: Campaign, role: ImageRole): string {
  return role === 'gallery_1'
    ? '1:1'
    : role.startsWith('gallery_')
      ? campaign.config.galleryRatio
      : campaign.config.detailRatio;
}
export function confirmedBrief(brief: ProductBriefAnalysis) {
  return {
    ...brief,
    campaign: null,
    functions: brief.functions.filter((x) => x.confirmed),
    sellingPoints: brief.sellingPoints.filter((x) => x.confirmed),
    audience: brief.audience.filter((x) => x.confirmed),
    scenes: brief.scenes.filter((x) => x.confirmed),
    specifications: brief.specifications.filter((x) => x.confirmed),
  };
}
export function validateCampaign(
  brief: ProductBriefAnalysis,
  campaign: Campaign,
): boolean {
  const roles = campaignRoles(campaign.config);
  if (
    roles.length !== campaign.images.length ||
    campaign.images.some((x, i) => x.role !== roles[i])
  )
    return false;
  return (
    campaign.images.every((image) =>
      image.factRefs.every((ref) => {
        if (ref === 'product') return brief.product.confirmed;
        const [group, index] = ref.split('.');
        if (
          ![
            'functions',
            'sellingPoints',
            'audience',
            'scenes',
            'specifications',
          ].includes(group ?? '') ||
          index === undefined
        )
          return false;
        const items = brief[group as 'functions'];
        return items[Number(index)]?.confirmed === true;
      }),
    ) && campaign.images[0]?.copy === ''
  );
}

export const generationSnapshotSchema = z.object({
  role: z.enum(ALL_IMAGE_ROLES),
  targetPlatform: z.string().trim().min(1).max(30),
  targetLocale: z.string().trim().min(1).max(20),
  productCategory: z.string().trim().max(100).nullable(),
  productBrief: z.record(z.string(), z.unknown()),
  analysis: projectAnalysisSchema,
  productAssetIds: z.array(z.uuid()).min(1).max(10),
  referenceAssetIds: z.array(z.uuid()).max(4),
  requestType: z.enum(['full_set', 'regenerate', 'retry']),
  sourceJobId: z.uuid().optional(),
  promptOverride: z.string().trim().min(1).max(30000).optional(),
  resolvedPrompt: z.string().min(1).max(100000).optional(),
});

export type GenerationSnapshot = z.infer<typeof generationSnapshotSchema>;

export const imageQueuePayloadSchema = z.object({
  jobId: z.uuid(),
});

export type ImageQueuePayload = z.infer<typeof imageQueuePayloadSchema>;
