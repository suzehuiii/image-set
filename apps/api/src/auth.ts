import {
  Body,
  CanActivate,
  ConflictException,
  Controller,
  createParamDecorator,
  ExecutionContext,
  Get,
  Injectable,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import type { Request, Response } from 'express';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  IsEmail,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { DatabaseService } from './database.service.js';

const COOKIE_NAME = 'image_set_session';
const SESSION_DAYS = 30;

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  creditBalance: number;
};
type AuthenticatedRequest = Request & {
  user?: AuthUser;
  sessionToken?: string;
};

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function parseCookie(request: Request): string | undefined {
  const cookie = request.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`));
  return cookie
    ? decodeURIComponent(cookie.slice(COOKIE_NAME.length + 1))
    : undefined;
}

function setSessionCookie(response: Response, token: string): void {
  response.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
  });
}

export class RegisterDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password!: string;

  @IsString()
  @Length(1, 80)
  @Matches(/\S/, { message: 'displayName 不能为空' })
  displayName!: string;
}

export class LoginDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly database: DatabaseService) {}

  async register(
    input: RegisterDto,
  ): Promise<{ user: AuthUser; token: string }> {
    const email = input.email.trim().toLowerCase();
    const passwordHash = await hash(input.password, 12);
    const client = await this.database.client.pool.connect();
    try {
      await client.query('begin');
      const created = await client.query<AuthUser>(
        `insert into users(id, email, password_hash, display_name)
         values ($1, $2, $3, $4)
         returning id, email, display_name as "displayName", credit_balance as "creditBalance"`,
        [randomUUID(), email, passwordHash, input.displayName.trim()],
      );
      const user = created.rows[0];
      if (!user) throw new Error('User creation returned no row');
      await client.query(
        `insert into credit_ledger(id, user_id, entry_type, delta, balance_after, idempotency_key, description)
         values ($1, $2, 'grant', 50, 50, $3, '首次注册赠送')`,
        [randomUUID(), user.id, `registration-grant:${user.id}`],
      );
      const token = await this.createSession(user.id, client);
      await client.query('commit');
      return { user, token };
    } catch (error) {
      await client.query('rollback');
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('该邮箱已注册');
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async login(input: LoginDto): Promise<{ user: AuthUser; token: string }> {
    const result = await this.database.client.pool.query<
      AuthUser & { passwordHash: string; status: string }
    >(
      `select id, email, password_hash as "passwordHash", display_name as "displayName",
              credit_balance as "creditBalance", status
       from users where email = $1`,
      [input.email.trim().toLowerCase()],
    );
    const user = result.rows[0];
    if (
      !user ||
      user.status !== 'active' ||
      !(await compare(input.password, user.passwordHash))
    ) {
      throw new UnauthorizedException('邮箱或密码错误');
    }
    const token = await this.createSession(user.id);
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        creditBalance: user.creditBalance,
      },
    };
  }

  async resolveUser(token: string): Promise<AuthUser | undefined> {
    const result = await this.database.client.pool.query<AuthUser>(
      `select u.id, u.email, u.display_name as "displayName", u.credit_balance as "creditBalance"
       from auth_sessions s join users u on u.id = s.user_id
       where s.token_hash = $1 and s.expires_at > now() and u.status = 'active'`,
      [tokenHash(token)],
    );
    return result.rows[0];
  }

  async logout(token: string | undefined): Promise<void> {
    if (token) {
      await this.database.client.pool.query(
        'delete from auth_sessions where token_hash = $1',
        [tokenHash(token)],
      );
    }
  }

  private async createSession(
    userId: string,
    queryable: Pick<DatabaseService['client']['pool'], 'query'> = this.database
      .client.pool,
  ): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await queryable.query(
      `insert into auth_sessions(id, user_id, token_hash, expires_at)
       values ($1, $2, $3, now() + interval '${SESSION_DAYS} days')`,
      [randomUUID(), userId, tokenHash(token)],
    );
    return token;
  }
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = parseCookie(request);
    const user = token ? await this.auth.resolveUser(token) : undefined;
    if (!user) throw new UnauthorizedException('请先登录');
    request.user = user;
    request.sessionToken = token;
    return true;
  }
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) throw new UnauthorizedException('请先登录');
    return request.user;
  },
);

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(
    @Body() input: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.register(input);
    setSessionCookie(response, result.token);
    return { user: result.user };
  }

  @Post('login')
  async login(
    @Body() input: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(input);
    setSessionCookie(response, result.token);
    return { user: result.user };
  }

  @Post('logout')
  async logout(
    @Res({ passthrough: true }) response: Response,
    @Req() request: Request,
  ) {
    await this.auth.logout(parseCookie(request));
    response.clearCookie(COOKIE_NAME, { path: '/' });
    return { ok: true };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return { user };
  }
}
