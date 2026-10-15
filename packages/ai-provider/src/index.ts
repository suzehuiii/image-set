export type ProductAnalysisInput = {
  projectId: string;
  productAssetKeys: string[];
  productBrief: Record<string, unknown>;
};

export type ProductAnalysisResult = Record<string, unknown>;
export type ImageGenerationInput = Record<string, unknown>;
export type GeneratedImageResult = Record<string, unknown>;
export type ConsistencyReviewInput = Record<string, unknown>;
export type ConsistencyReviewResult = Record<string, unknown>;

export interface AiProvider {
  analyzeProduct(input: ProductAnalysisInput): Promise<ProductAnalysisResult>;
  generateImage(input: ImageGenerationInput): Promise<GeneratedImageResult>;
  reviewConsistency(
    input: ConsistencyReviewInput,
  ): Promise<ConsistencyReviewResult>;
}
