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
