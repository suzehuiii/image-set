import {
  OpenAiProvider,
  resolveOpenAiProviderRouting,
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
  private providers?: Record<'analysis' | 'image' | 'review', OpenAiProvider>;

  analyzeProduct(input: ProductAnalysisInput): Promise<ProductAnalysisResult> {
    return this.instance('analysis').analyzeProduct(input);
  }

  generateImage(input: ImageGenerationInput): Promise<GeneratedImageResult> {
    return this.instance('image').generateImage(input);
  }

  reviewConsistency(
    input: ConsistencyReviewInput,
  ): Promise<ConsistencyReviewResult> {
    return this.instance('review').reviewConsistency(input);
  }

  private instance(purpose: 'analysis' | 'image' | 'review'): OpenAiProvider {
    this.providers ??= this.createProviders();
    return this.providers[purpose];
  }

  private createProviders(): Record<
    'analysis' | 'image' | 'review',
    OpenAiProvider
  > {
    const routing = resolveOpenAiProviderRouting();
    const config = {
      baseURL: routing.baseURL,
      analysisModel: routing.models.analysis,
      imageModel: routing.models.image,
      reviewModel: routing.models.review,
    };
    return {
      analysis: new OpenAiProvider(routing.apiKeys.analysis, config),
      image: new OpenAiProvider(routing.apiKeys.image, config),
      review: new OpenAiProvider(routing.apiKeys.review, config),
    };
  }
}
