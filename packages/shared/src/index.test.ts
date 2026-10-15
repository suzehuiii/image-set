import { describe, expect, it } from 'vitest';

import { healthResponseSchema, IMAGE_ROLES } from './index.js';

describe('shared contracts', () => {
  it('accepts a valid health payload', () => {
    const result = healthResponseSchema.safeParse({
      service: 'api',
      status: 'ok',
      timestamp: new Date().toISOString(),
      dependencies: { postgres: 'up' },
    });

    expect(result.success).toBe(true);
  });

  it('defines the four MVP image roles', () => {
    expect(IMAGE_ROLES).toEqual(['main', 'feature', 'lifestyle', 'detail']);
  });
});
