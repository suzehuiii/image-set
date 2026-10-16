export type User = {
  id: string;
  email: string;
  displayName: string;
  creditBalance: number;
};
export type Project = {
  id: string;
  name: string;
  targetPlatform: string;
  productCategory: string | null;
  productBrief: Record<string, unknown>;
  analysisResult: ProductAnalysisResult | null;
  status: string;
  assetCount: number;
  updatedAt: string;
};
export type { ProductAnalysisResult } from '@image-set/shared';
export type Asset = {
  id: string;
  projectId: string;
  assetType: 'product' | 'reference';
  originalName: string;
  mimeType: string;
  width: number;
  height: number;
  fileSize: number;
  createdAt: string;
};

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: 'include',
    headers:
      init?.body instanceof FormData
        ? init.headers
        : { 'content-type': 'application/json', ...init?.headers },
  });
  const body = (await response.json().catch(() => ({}))) as {
    message?: string;
  } & T;
  if (!response.ok) throw new Error(body.message ?? '请求失败，请稍后重试');
  return body;
}
import type { ProductAnalysisResult } from '@image-set/shared';
