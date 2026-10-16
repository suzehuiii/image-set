import { Module } from '@nestjs/common';

import { AssetsController, AssetsService } from './assets.js';
import { AuthController, AuthGuard, AuthService } from './auth.js';
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
  ],
  providers: [
    DatabaseService,
    HealthService,
    AuthService,
    AuthGuard,
    ProjectsService,
    AssetsService,
  ],
})
export class AppModule {}
