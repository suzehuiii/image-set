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

export const IMAGE_ROLES = ['main', 'feature', 'lifestyle', 'detail'] as const;
export type ImageRole = (typeof IMAGE_ROLES)[number];

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
    .length(4),
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
