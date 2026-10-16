import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import type { ImageQueuePayload } from '@image-set/shared';

import { ImageGenerationRuntime } from './image-generation.runtime.js';

@Processor('image-generation', { concurrency: 2 })
export class ImageGenerationProcessor extends WorkerHost {
  constructor(private readonly runtime: ImageGenerationRuntime) {
    super();
  }

  override process(job: Job<ImageQueuePayload>) {
    return this.runtime.process(job);
  }
}
