import { Controller, Get, Injectable, Query, UseGuards } from '@nestjs/common';

import { AuthGuard, CurrentUser, type AuthUser } from './auth.js';
import { DatabaseService } from './database.service.js';

type LedgerRow = {
  id: string;
  jobId: string | null;
  entryType: string;
  delta: number;
  balanceAfter: number;
  description: string;
  createdAt: Date;
};

@Injectable()
export class CreditsService {
  constructor(private readonly database: DatabaseService) {}

  async balance(userId: string): Promise<number> {
    const result = await this.database.client.pool.query<{
      creditBalance: number;
    }>(
      `select credit_balance as "creditBalance" from users
       where id = $1 and status = 'active'`,
      [userId],
    );
    return result.rows[0]?.creditBalance ?? 0;
  }

  async ledger(userId: string, page: number, pageSize: number) {
    const offset = (page - 1) * pageSize;
    const [items, count] = await Promise.all([
      this.database.client.pool.query<LedgerRow>(
        `select id, job_id as "jobId", entry_type as "entryType", delta,
                balance_after as "balanceAfter", description, created_at as "createdAt"
         from credit_ledger where user_id = $1
         order by created_at desc, id desc limit $2 offset $3`,
        [userId, pageSize, offset],
      ),
      this.database.client.pool.query<{ count: number }>(
        'select count(*)::int as count from credit_ledger where user_id = $1',
        [userId],
      ),
    ]);
    return {
      items: items.rows,
      page,
      pageSize,
      total: count.rows[0]?.count ?? 0,
    };
  }
}

@Controller('credits')
@UseGuards(AuthGuard)
export class CreditsController {
  constructor(private readonly credits: CreditsService) {}

  async getBalance(@CurrentUser() user: AuthUser) {
    return { balance: await this.credits.balance(user.id) };
  }

  @Get('balance')
  balance(@CurrentUser() user: AuthUser) {
    return this.getBalance(user);
  }

  @Get('ledger')
  ledger(
    @CurrentUser() user: AuthUser,
    @Query('page') rawPage?: string,
    @Query('pageSize') rawPageSize?: string,
  ) {
    const page = Math.max(1, Number(rawPage) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(rawPageSize) || 20));
    return this.credits.ledger(user.id, page, pageSize);
  }
}
