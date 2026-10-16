import { describe, expect, it } from 'vitest';

import {
  classifyRateLimit,
  validateProductionEnvironment,
} from './operational.js';

describe('operational safeguards', () => {
  it('limits only sensitive write routes with configured defaults', () => {
    expect(classifyRateLimit('POST', '/api/auth/login')).toMatchObject({
      id: 'auth',
      limit: 10,
      windowSeconds: 900,
    });
    expect(
      classifyRateLimit(
        'POST',
        '/api/projects/project-1/assets?assetType=product',
      ),
    ).toMatchObject({ id: 'upload' });
    expect(
      classifyRateLimit('POST', '/api/projects/project-1/analyze'),
    ).toMatchObject({ id: 'analysis' });
    expect(classifyRateLimit('POST', '/api/jobs/job-1/retry')).toMatchObject({
      id: 'generation',
    });
    expect(classifyRateLimit('GET', '/api/auth/me')).toBeUndefined();
  });

  it('rejects incomplete or insecure production configuration', () => {
    const errors = validateProductionEnvironment({
      DEPLOYMENT_ENV: 'production',
      COOKIE_SECURE: 'false',
      WEB_ORIGIN: 'http://example.com',
      S3_ENDPOINT: 'http://storage.internal',
      S3_PUBLIC_ENDPOINT: 'http://storage.example.com',
      DATABASE_URL: 'postgresql://image_set:local-only@db/image_set',
      REDIS_URL: 'rediss://redis.example.com',
      S3_ACCESS_KEY: 'local-only',
      S3_SECRET_KEY: 'local-only',
      S3_BUCKET: 'image-set',
      OPENAI_API_KEY: 'test-only',
    });
    expect(errors).toContain('COOKIE_SECURE must be true');
    expect(errors).toContain('WEB_ORIGIN must contain only HTTPS origins');
    expect(errors).toContain('S3_ENDPOINT must use HTTPS');
    expect(errors).toContain('DATABASE_URL still contains a local-only value');
  });

  it('accepts the production deployment contract', () => {
    expect(
      validateProductionEnvironment({
        DEPLOYMENT_ENV: 'production',
        COOKIE_SECURE: 'true',
        WEB_ORIGIN: 'https://studio.example.com',
        DATABASE_URL: 'postgresql://image_set:secret@db.example.com/image_set',
        REDIS_URL: 'rediss://redis.example.com',
        S3_ENDPOINT: 'https://storage.example.com',
        S3_PUBLIC_ENDPOINT: 'https://assets.example.com',
        S3_ACCESS_KEY: 'access-key',
        S3_SECRET_KEY: 'secret-key',
        S3_BUCKET: 'image-set',
        OPENAI_API_KEY: 'test-only',
      }),
    ).toEqual([]);
  });
});
