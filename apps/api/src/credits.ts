import {
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import { randomUUID } from 'node:crypto';

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

const TEST_REDEMPTION_CODE = 'IMAGESET-TEST-500';

export class RedeemCreditsDto {
  @IsString()
  @Length(1, 100)
  code!: string;
}

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

  async redeem(userId: string, rawCode: string) {
    const code = rawCode.trim().toUpperCase();
    if (code !== TEST_REDEMPTION_CODE)
      throw new ConflictException('兑换码无效');
    const client = await this.database.client.pool.connect();
    try {
      await client.query('begin');
      const key = `redemption:${TEST_REDEMPTION_CODE}:${userId}`;
      const duplicate = await client.query(
        'select id from credit_ledger where idempotency_key=$1',
        [key],
      );
      if (duplicate.rowCount) throw new ConflictException('该兑换码已兑换');
      const updated = await client.query<{ creditBalance: number }>(
        `update users set credit_balance=credit_balance+500, updated_at=now()
         where id=$1 and status='active'
         returning credit_balance as "creditBalance"`,
        [userId],
      );
      const balance = updated.rows[0]?.creditBalance;
      if (balance === undefined) throw new ConflictException('账号不可用');
      await client.query(
        `insert into credit_ledger(id,user_id,entry_type,delta,balance_after,idempotency_key,description)
         values ($1,$2,'grant',500,$3,$4,'测试兑换码入账')`,
        [randomUUID(), userId, balance, key],
      );
      await client.query('commit');
      return { balance, credited: 500 };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
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

  @Post('redeem')
  redeem(@CurrentUser() user: AuthUser, @Body() input: RedeemCreditsDto) {
    return this.credits.redeem(user.id, input.code);
  }
}
