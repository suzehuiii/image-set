import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { ImageGenerationProcessor } from './image-generation.processor.js';
import { ImageGenerationRuntime } from './image-generation.runtime.js';
import { WorkerHealthService } from './worker-health.service.js';

const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: redisUrl.hostname,
        port: Number(redisUrl.port || 6379),
        password: redisUrl.password || undefined,
      },
    }),
    BullModule.registerQueue({ name: 'image-generation' }),
  ],
  providers: [
    ImageGenerationProcessor,
    ImageGenerationRuntime,
    WorkerHealthService,
  ],
})
export class WorkerModule {}
