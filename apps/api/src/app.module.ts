import { Module } from '@nestjs/common';

import { AiProviderService } from './ai-provider.service.js';
import { AnalysisController, AnalysisService } from './analysis.js';
import { AssetsController, AssetsService } from './assets.js';
import { AuthController, AuthGuard, AuthService } from './auth.js';
import { CreditsController, CreditsService } from './credits.js';
import { DatabaseService } from './database.service.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';
import { ProjectsController, ProjectsService } from './projects.js';

@Module({
  controllers: [
    HealthController,
    AuthController,
    ProjectsController,
    AssetsController,
    AnalysisController,
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
    CreditsService,
  ],
})
export class AppModule {}
