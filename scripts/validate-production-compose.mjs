import { spawnSync } from 'node:child_process';

const environment = {
  ...process.env,
  APP_DOMAIN: 'studio.example.com',
  APP_IMAGE: 'image-set-app:validation',
  TLS_CERT_DIR: '/tmp/image-set-tls-validation',
  DATABASE_URL:
    'postgresql://image_set:validation@db.example.internal:5432/image_set?sslmode=require',
  REDIS_URL: 'rediss://:validation@redis.example.internal:6379',
  S3_ENDPOINT: 'https://s3.example.com',
  S3_PUBLIC_ENDPOINT: 'https://assets.example.com',
  S3_ACCESS_KEY: 'validation-access-key',
  S3_SECRET_KEY: 'validation-secret-key',
  S3_BUCKET: 'image-set-validation',
  OPENAI_BASE_URL: 'https://gateway.example.com/v1',
  OPENAI_ANALYSIS_API_KEY: 'validation-analysis-only',
  OPENAI_IMAGE_API_KEY: 'validation-image-only',
  OPENAI_REVIEW_API_KEY: 'validation-review-only',
};

const result = spawnSync(
  'docker',
  ['compose', '-f', 'docker-compose.production.yml', 'config', '--quiet'],
  { cwd: process.cwd(), env: environment, stdio: 'inherit', shell: false },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
