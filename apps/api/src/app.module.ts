import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AiProviderService } from './ai-provider.service.js';
import { AnalysisController, AnalysisService } from './analysis.js';
import { AssetsController, AssetsService } from './assets.js';
import { AuthController, AuthGuard, AuthService } from './auth.js';
import { CreditsController, CreditsService } from './credits.js';
import { DatabaseService } from './database.service.js';
import { ExportsController, ExportsService } from './exports.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';
import {
  GenerationsController,
  GenerationsService,
  GenerationQueueService,
} from './generations.js';
import { ProjectsController, ProjectsService } from './projects.js';
import { RateLimitGuard, RequestContextMiddleware } from './operational.js';

@Module({
  controllers: [
    HealthController,
    AuthController,
    ProjectsController,
    AssetsController,
    AnalysisController,
    GenerationsController,
    ExportsController,
    CreditsController,
  ],
  providers: [
    DatabaseService,
    HealthService,
    AuthService,
    AuthGuard,
    ProjectsService,
    AssetsService,
    AiProviderService,
    AnalysisService,
    GenerationQueueService,
    GenerationsService,
    ExportsService,
    CreditsService,
    RequestContextMiddleware,
    RateLimitGuard,
    { provide: APP_GUARD, useExisting: RateLimitGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
