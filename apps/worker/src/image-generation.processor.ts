import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

@Processor('image-generation', { concurrency: 2 })
export class ImageGenerationProcessor extends WorkerHost {
  override async process(
    job: Job<Record<string, unknown>>,
  ): Promise<Record<string, unknown>> {
    return Promise.resolve({ accepted: true, jobId: job.id });
  }
}
