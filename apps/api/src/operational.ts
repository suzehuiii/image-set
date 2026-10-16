import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  type NestMiddleware,
  type OnModuleDestroy,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { Redis } from 'ioredis';

export type OperationalRequest = Request & { requestId?: string };

type RateLimitRule = {
  id: 'auth' | 'upload' | 'analysis' | 'generation';
  limit: number;
  windowSeconds: number;
};

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/;
const INCREMENT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
return {current, ttl}
`;

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function requestPath(url: string): string {
  return url.split('?')[0] ?? url;
}

export function classifyRateLimit(
  method: string,
  url: string,
  environment: NodeJS.ProcessEnv = process.env,
): RateLimitRule | undefined {
  if (method.toUpperCase() !== 'POST') return undefined;
  const path = requestPath(url);
  if (/^\/api\/auth\/(login|register)$/.test(path)) {
    return {
      id: 'auth',
      limit: positiveInteger(environment.RATE_LIMIT_AUTH_MAX, 10),
      windowSeconds: positiveInteger(
        environment.RATE_LIMIT_AUTH_WINDOW_SECONDS,
        900,
      ),
    };
  }
  if (/^\/api\/projects\/[^/]+\/assets$/.test(path)) {
    return {
      id: 'upload',
      limit: positiveInteger(environment.RATE_LIMIT_UPLOAD_MAX, 30),
      windowSeconds: positiveInteger(
        environment.RATE_LIMIT_UPLOAD_WINDOW_SECONDS,
        3600,
      ),
    };
  }
  if (/^\/api\/projects\/[^/]+\/analyze$/.test(path)) {
    return {
      id: 'analysis',
      limit: positiveInteger(environment.RATE_LIMIT_ANALYSIS_MAX, 10),
      windowSeconds: positiveInteger(
        environment.RATE_LIMIT_ANALYSIS_WINDOW_SECONDS,
        3600,
      ),
    };
  }
  if (
    /^\/api\/projects\/[^/]+\/generations$/.test(path) ||
    /^\/api\/jobs\/[^/]+\/retry$/.test(path)
  ) {
    return {
      id: 'generation',
      limit: positiveInteger(environment.RATE_LIMIT_GENERATION_MAX, 30),
      windowSeconds: positiveInteger(
        environment.RATE_LIMIT_GENERATION_WINDOW_SECONDS,
        3600,
      ),
    };
  }
  return undefined;
}

export function validateProductionEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): string[] {
  if (environment.DEPLOYMENT_ENV !== 'production') return [];
  const required = [
    'DATABASE_URL',
    'REDIS_URL',
    'S3_ENDPOINT',
    'S3_PUBLIC_ENDPOINT',
    'S3_ACCESS_KEY',
    'S3_SECRET_KEY',
    'S3_BUCKET',
    'OPENAI_API_KEY',
    'WEB_ORIGIN',
  ];
  const errors = required
    .filter((name) => !environment[name]?.trim())
    .map((name) => `${name} is required`);
  if (environment.COOKIE_SECURE !== 'true') {
    errors.push('COOKIE_SECURE must be true');
  }
  const origins = (environment.WEB_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.some((origin) => !origin.startsWith('https://'))) {
    errors.push('WEB_ORIGIN must contain only HTTPS origins');
  }
  for (const name of ['S3_ENDPOINT', 'S3_PUBLIC_ENDPOINT'] as const) {
    const value = environment[name];
    if (value && !value.startsWith('https://')) {
      errors.push(`${name} must use HTTPS`);
    }
  }
  for (const name of [
    'DATABASE_URL',
    'S3_ACCESS_KEY',
    'S3_SECRET_KEY',
  ] as const) {
    if (environment[name]?.includes('local-only')) {
      errors.push(`${name} still contains a local-only value`);
    }
  }
  return errors;
}

export function assertProductionEnvironment(): void {
  const errors = validateProductionEnvironment();
  if (errors.length > 0) {
    throw new Error(`Invalid production configuration: ${errors.join('; ')}`);
  }
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(
    request: OperationalRequest,
    response: Response,
    next: NextFunction,
  ): void {
    const supplied = request.header('x-request-id');
    const requestId =
      supplied && REQUEST_ID_PATTERN.test(supplied) ? supplied : randomUUID();
    request.requestId = requestId;
    response.setHeader('x-request-id', requestId);
    response.setHeader('cache-control', 'no-store');
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('x-frame-options', 'DENY');
    response.setHeader('referrer-policy', 'no-referrer');
    response.setHeader(
      'permissions-policy',
      'camera=(), microphone=(), geolocation=()',
    );

    const startedAt = process.hrtime.bigint();
    response.once('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      process.stdout.write(
        `${JSON.stringify({
          level: response.statusCode >= 500 ? 'error' : 'info',
          event: 'http_request',
          service: 'api',
          requestId,
          method: request.method,
          path: requestPath(request.originalUrl),
          statusCode: response.statusCode,
          durationMs: Math.round(durationMs * 100) / 100,
          timestamp: new Date().toISOString(),
        })}\n`,
      );
    });
    next();
  }
}

@Injectable()
export class RateLimitGuard implements CanActivate, OnModuleDestroy {
  private readonly redis = new Redis(this.requireEnvironment('REDIS_URL'), {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<OperationalRequest>();
    const response = http.getResponse<Response>();
    const rule = classifyRateLimit(request.method, request.originalUrl);
    if (!rule) return true;

    const clientAddress =
      request.ip || request.socket.remoteAddress || 'unknown-client';
    const addressHash = createHash('sha256')
      .update(clientAddress)
      .digest('hex')
      .slice(0, 32);
    const key = `rate-limit:${rule.id}:${addressHash}`;
    let result: [number, number];
    try {
      if (this.redis.status === 'wait') await this.redis.connect();
      result = (await this.redis.eval(
        INCREMENT_SCRIPT,
        1,
        key,
        rule.windowSeconds,
      )) as [number, number];
    } catch {
      throw new ServiceUnavailableException({
        code: 'RATE_LIMIT_UNAVAILABLE',
        message: '请求保护服务暂时不可用，请稍后重试',
      });
    }

    const used = Number(result[0]);
    const retryAfter = Math.max(1, Number(result[1]));
    response.setHeader('x-ratelimit-limit', rule.limit);
    response.setHeader('x-ratelimit-remaining', Math.max(0, rule.limit - used));
    response.setHeader('x-ratelimit-reset', retryAfter);
    if (used > rule.limit) {
      response.setHeader('retry-after', retryAfter);
      throw new HttpException(
        { code: 'RATE_LIMITED', message: '请求过于频繁，请稍后重试' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }

  private requireEnvironment(name: string): string {
    const value = process.env[name];
    if (!value)
      throw new Error(`Missing required environment variable: ${name}`);
    return value;
  }
}
