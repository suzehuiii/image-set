import {
  OpenAiProvider,
  type AiProvider,
  type ConsistencyReviewInput,
  type ConsistencyReviewResult,
  type GeneratedImageResult,
  type ImageGenerationInput,
  type ProductAnalysisInput,
  type ProductAnalysisResult,
} from '@image-set/ai-provider';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AiProviderService implements AiProvider {
  private provider?: OpenAiProvider;

  analyzeProduct(input: ProductAnalysisInput): Promise<ProductAnalysisResult> {
    return this.instance().analyzeProduct(input);
  }

  generateImage(input: ImageGenerationInput): Promise<GeneratedImageResult> {
    return this.instance().generateImage(input);
  }

  reviewConsistency(
    input: ConsistencyReviewInput,
  ): Promise<ConsistencyReviewResult> {
    return this.instance().reviewConsistency(input);
  }

  private instance(): OpenAiProvider {
    this.provider ??= new OpenAiProvider(process.env.OPENAI_API_KEY ?? '', {
      analysisModel: process.env.OPENAI_ANALYSIS_MODEL ?? 'gpt-6.1-sol',
      imageModel: process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-2.5-sunburst',
      reviewModel: process.env.OPENAI_REVIEW_MODEL ?? 'gpt-6-luna',
    });
    return this.provider;
  }
}
