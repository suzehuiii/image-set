import {
  Injectable,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { checkDatabase, createDatabaseClient } from '@image-set/database';
import type { DependencyStatus, HealthResponse } from '@image-set/shared';
import { Redis } from 'ioredis';
import { Client as MinioClient } from 'minio';
import { createServer, type Server } from 'node:http';

function environment(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

@Injectable()
export class WorkerHealthService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly database = createDatabaseClient(environment('DATABASE_URL'));
  private readonly redis = new Redis(environment('REDIS_URL'), {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  private readonly objectStorage = this.createObjectStorageClient();
  private server?: Server;

  onModuleInit(): void {
    this.server = createServer((request, response) => {
      if (request.url !== '/health') {
        response.writeHead(404).end();
        return;
      }

      void this.check().then((result) => {
        response.writeHead(result.status === 'ok' ? 200 : 503, {
          'content-type': 'application/json',
        });
        response.end(JSON.stringify(result));
      });
    });
    this.server.listen(
      Number(process.env.WORKER_HEALTH_PORT ?? 3002),
      '0.0.0.0',
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all([
      new Promise<void>(
        (resolve, reject) =>
          this.server?.close((error) => (error ? reject(error) : resolve())) ??
          resolve(),
      ),
      this.database.pool.end(),
      this.redis.quit().catch(() => undefined),
    ]);
  }

  private async check(): Promise<HealthResponse> {
    const results = await Promise.allSettled([
      checkDatabase(this.database.pool),
      this.pingRedis(),
      this.objectStorage.listBuckets(),
    ]);
    const names = ['postgres', 'redis', 'objectStorage'] as const;
    const dependencies: Record<string, DependencyStatus> = {};
    results.forEach((result, index) => {
      dependencies[names[index] ?? 'unknown'] =
        result.status === 'fulfilled' ? 'up' : 'down';
    });
    return {
      service: 'worker',
      status: Object.values(dependencies).every((value) => value === 'up')
        ? 'ok'
        : 'degraded',
      timestamp: new Date().toISOString(),
      dependencies,
    };
  }

  private createObjectStorageClient(): MinioClient {
    const endpoint = new URL(environment('S3_ENDPOINT'));
    return new MinioClient({
      endPoint: endpoint.hostname,
      port: Number(
        endpoint.port || (endpoint.protocol === 'https:' ? 443 : 80),
      ),
      useSSL: endpoint.protocol === 'https:',
      accessKey: environment('S3_ACCESS_KEY'),
      secretKey: environment('S3_SECRET_KEY'),
      region: process.env.S3_REGION ?? 'us-east-1',
    });
  }

  private async pingRedis(): Promise<void> {
    if (this.redis.status === 'wait') await this.redis.connect();
    await this.redis.ping();
  }
}
