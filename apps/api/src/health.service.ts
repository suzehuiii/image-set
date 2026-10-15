import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { checkDatabase, createDatabaseClient } from '@image-set/database';
import type { DependencyStatus, HealthResponse } from '@image-set/shared';
import { Redis } from 'ioredis';
import { Client as MinioClient } from 'minio';

function requireEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function createObjectStorageClient(): MinioClient {
  const endpoint = new URL(requireEnvironment('S3_ENDPOINT'));
  return new MinioClient({
    endPoint: endpoint.hostname,
    port: Number(endpoint.port || (endpoint.protocol === 'https:' ? 443 : 80)),
    useSSL: endpoint.protocol === 'https:',
    accessKey: requireEnvironment('S3_ACCESS_KEY'),
    secretKey: requireEnvironment('S3_SECRET_KEY'),
    region: process.env.S3_REGION ?? 'us-east-1',
  });
}

@Injectable()
export class HealthService implements OnModuleDestroy {
  private readonly database = createDatabaseClient(
    requireEnvironment('DATABASE_URL'),
  );
  private readonly redis = new Redis(requireEnvironment('REDIS_URL'), {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  private readonly objectStorage = createObjectStorageClient();

  async check(): Promise<HealthResponse> {
    const checks = await Promise.allSettled([
      checkDatabase(this.database.pool),
      this.pingRedis(),
      this.objectStorage.listBuckets(),
    ]);
    const names = ['postgres', 'redis', 'objectStorage'] as const;
    const dependencies: Record<string, DependencyStatus> = {};
    checks.forEach((result, index) => {
      dependencies[names[index] ?? 'unknown'] =
        result.status === 'fulfilled' ? 'up' : 'down';
    });

    return {
      service: 'api',
      status: Object.values(dependencies).every((value) => value === 'up')
        ? 'ok'
        : 'degraded',
      timestamp: new Date().toISOString(),
      dependencies,
    };
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([
      this.database.pool.end(),
      this.redis.quit().catch(() => undefined),
    ]);
  }

  private async pingRedis(): Promise<void> {
    if (this.redis.status === 'wait') await this.redis.connect();
    await this.redis.ping();
  }
}
