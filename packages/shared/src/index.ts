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
export type ImageRole = (typeof IMAGE_ROLES)[number];

export type ImageRoleKind = 'main' | 'feature' | 'lifestyle' | 'detail';

export function imageRoleKind(role: ImageRole): ImageRoleKind {
  if (role === 'main' || role === 'detail') return role;
  if (role.startsWith('feature_')) return 'feature';
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

export const generationSnapshotSchema = z.object({
  role: z.enum(IMAGE_ROLES),
  targetPlatform: z.string().trim().min(1).max(30),
  targetLocale: z.string().trim().min(1).max(20),
  productCategory: z.string().trim().max(100).nullable(),
  productBrief: z.record(z.string(), z.unknown()),
  analysis: productAnalysisSchema,
  productAssetIds: z.array(z.uuid()).min(1).max(10),
  referenceAssetIds: z.array(z.uuid()).max(4),
  requestType: z.enum(['full_set', 'regenerate', 'retry']),
  sourceJobId: z.uuid().optional(),
});

export type GenerationSnapshot = z.infer<typeof generationSnapshotSchema>;

export const imageQueuePayloadSchema = z.object({
  jobId: z.uuid(),
});

export type ImageQueuePayload = z.infer<typeof imageQueuePayloadSchema>;
