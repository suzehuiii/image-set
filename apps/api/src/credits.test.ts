import { describe, expect, it, vi } from 'vitest';
import { CreditsService } from './credits.js';

describe('credit redemption', () => {
  it('atomically grants the fixed test code once per account', async () => {
    const queries: string[] = [];
    const query = vi.fn((sql: string) => {
      queries.push(sql);
      if (sql.includes('select id from credit_ledger'))
        return { rows: [], rowCount: 0 };
      if (sql.includes('update users'))
        return { rows: [{ creditBalance: 780 }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const release = vi.fn();
    const database = {
      client: {
        pool: { connect: vi.fn().mockResolvedValue({ query, release }) },
      },
    };
    const service = new CreditsService(database as never);
    await expect(
      service.redeem('user-1', 'imageset-test-500'),
    ).resolves.toEqual({
      balance: 780,
      credited: 500,
    });
    expect(queries).toContain('begin');
    expect(queries).toContain('commit');
    expect(queries.some((sql) => sql.includes("'grant',500"))).toBe(true);
    expect(release).toHaveBeenCalledOnce();
  });

  it('rejects invalid and already-used codes without adding credits', async () => {
    const service = new CreditsService({} as never);
    await expect(service.redeem('user-1', 'wrong')).rejects.toThrow(
      '兑换码无效',
    );

    const query = vi.fn((sql: string) =>
      sql.includes('select id from credit_ledger')
        ? { rows: [{ id: 'used' }], rowCount: 1 }
        : { rows: [], rowCount: 1 },
    );
    const database = {
      client: {
        pool: {
          connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }),
        },
      },
    };
    await expect(
      new CreditsService(database as never).redeem(
        'user-1',
        'IMAGESET-TEST-500',
      ),
    ).rejects.toThrow('已兑换');
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes('update users')),
    ).toBe(false);
  });
});
