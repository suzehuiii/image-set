import { NextResponse } from 'next/server';

import { healthResponseSchema } from '@image-set/shared';

export function GET() {
  const body = healthResponseSchema.parse({
    service: 'web',
    status: 'ok',
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json(body);
}
