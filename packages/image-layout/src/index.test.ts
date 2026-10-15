import { describe, expect, it } from 'vitest';

import { getDefaultLayout } from './index.js';

describe('default image layout', () => {
  it('forbids marketing copy on the main image', () => {
    expect(getDefaultLayout('main').allowsMarketingCopy).toBe(false);
  });

  it('uses the MVP export dimensions', () => {
    expect(getDefaultLayout('feature')).toMatchObject({
      width: 2048,
      height: 2048,
    });
  });
});
