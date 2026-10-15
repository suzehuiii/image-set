import type { ImageRole } from '@image-set/shared';

export const EXPORT_SIZE = 2048;

export type ImageLayout = {
  role: ImageRole;
  width: number;
  height: number;
  allowsMarketingCopy: boolean;
};

export function getDefaultLayout(role: ImageRole): ImageLayout {
  return {
    role,
    width: EXPORT_SIZE,
    height: EXPORT_SIZE,
    allowsMarketingCopy: role !== 'main',
  };
}
