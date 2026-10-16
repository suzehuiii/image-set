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
export type { ConsistencyReviewResult, ImageRole } from '@image-set/shared';
export type Asset = {
  id: string;
  projectId: string;
  assetType: 'product' | 'reference' | 'manual' | 'generated' | 'export';
  imageRole: ImageRole | null;
  originalName: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  fileSize: number;
  qaResult: ConsistencyReviewResult | null;
  createdAt: string;
};
export type Job = {
  id: string;
  projectId: string;
  jobType: 'analysis' | 'image' | 'review' | 'export';
  imageRole: ImageRole | null;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  provider: string;
  model: string;
  resultAssetId: string | null;
  creditsReserved: number;
  attemptCount: number;
  progress: number;
  stage: string;
  errorCode: string | null;
  errorMessageSafe: string | null;
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
import type { ConsistencyReviewResult, ImageRole } from '@image-set/shared';
