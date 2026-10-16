import {
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

import { AuthGuard, CurrentUser, type AuthUser } from './auth.js';
import { DatabaseService } from './database.service.js';

export class CreateProjectDto {
  @IsString()
  @Length(1, 120)
  @Matches(/\S/, { message: 'name 不能为空' })
  name!: string;

  @IsIn(['amazon_us', 'shopify', 'tiktok_shop'])
  targetPlatform: string = 'amazon_us';

  @IsOptional()
  @IsString()
  @Length(0, 100)
  productCategory?: string;

  @IsOptional()
  @IsObject()
  productBrief?: Record<string, unknown>;
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  @Matches(/\S/, { message: 'name 不能为空' })
  name?: string;

  @IsOptional()
  @IsIn(['amazon_us', 'shopify', 'tiktok_shop'])
  targetPlatform?: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  productCategory?: string;

  @IsOptional()
  @IsObject()
  productBrief?: Record<string, unknown>;
}

type ProjectRow = {
  id: string;
  name: string;
  targetPlatform: string;
  targetLocale: string;
  productCategory: string | null;
  productBrief: Record<string, unknown>;
  status: string;
  assetCount: number;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class ProjectsService {
  constructor(private readonly database: DatabaseService) {}

  async create(userId: string, input: CreateProjectDto): Promise<ProjectRow> {
    const result = await this.database.client.pool.query<ProjectRow>(
      `insert into projects(id, user_id, name, target_platform, target_locale, product_category, product_brief)
       values ($1, $2, $3, $4, 'en-US', $5, $6)
       returning id, name, target_platform as "targetPlatform", target_locale as "targetLocale",
                 product_category as "productCategory", product_brief as "productBrief", status,
                 0::int as "assetCount", created_at as "createdAt", updated_at as "updatedAt"`,
      [
        randomUUID(),
        userId,
        input.name.trim(),
        input.targetPlatform,
        input.productCategory?.trim() || null,
        input.productBrief ?? {},
      ],
    );
    return result.rows[0] as ProjectRow;
  }

  async list(userId: string, page: number, pageSize: number) {
    const offset = (page - 1) * pageSize;
    const [items, count] = await Promise.all([
      this.database.client.pool.query<ProjectRow>(
        `select p.id, p.name, p.target_platform as "targetPlatform", p.target_locale as "targetLocale",
                p.product_category as "productCategory", p.product_brief as "productBrief", p.status,
                count(a.id)::int as "assetCount", p.created_at as "createdAt", p.updated_at as "updatedAt"
         from projects p left join assets a on a.project_id = p.id and a.deleted_at is null
         where p.user_id = $1 and p.deleted_at is null
         group by p.id order by p.updated_at desc limit $2 offset $3`,
        [userId, pageSize, offset],
      ),
      this.database.client.pool.query<{ count: number }>(
        'select count(*)::int as count from projects where user_id = $1 and deleted_at is null',
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

  async findOwned(userId: string, projectId: string): Promise<ProjectRow> {
    const result = await this.database.client.pool.query<ProjectRow>(
      `select p.id, p.name, p.target_platform as "targetPlatform", p.target_locale as "targetLocale",
              p.product_category as "productCategory", p.product_brief as "productBrief", p.status,
              count(a.id)::int as "assetCount", p.created_at as "createdAt", p.updated_at as "updatedAt"
       from projects p left join assets a on a.project_id = p.id and a.deleted_at is null
       where p.id = $1 and p.user_id = $2 and p.deleted_at is null group by p.id`,
      [projectId, userId],
    );
    const project = result.rows[0];
    if (!project) throw new NotFoundException('项目不存在');
    return project;
  }

  async update(
    userId: string,
    projectId: string,
    input: UpdateProjectDto,
  ): Promise<ProjectRow> {
    await this.findOwned(userId, projectId);
    await this.database.client.pool.query(
      `update projects set
        name = coalesce($3, name), target_platform = coalesce($4, target_platform),
        product_category = coalesce($5, product_category), product_brief = coalesce($6, product_brief),
        updated_at = now()
       where id = $1 and user_id = $2 and deleted_at is null`,
      [
        projectId,
        userId,
        input.name?.trim() || null,
        input.targetPlatform ?? null,
        input.productCategory?.trim() || null,
        input.productBrief ?? null,
      ],
    );
    return this.findOwned(userId, projectId);
  }

  async remove(userId: string, projectId: string): Promise<void> {
    const result = await this.database.client.pool.query(
      `update projects set deleted_at = now(), updated_at = now()
       where id = $1 and user_id = $2 and deleted_at is null returning id`,
      [projectId, userId],
    );
    if (result.rowCount === 0) throw new NotFoundException('项目不存在');
  }
}

@Controller('projects')
@UseGuards(AuthGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() input: CreateProjectDto) {
    return this.projects.create(user.id, input);
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('page') rawPage?: string,
    @Query('pageSize') rawPageSize?: string,
  ) {
    const page = Math.max(1, Number(rawPage) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(rawPageSize) || 20));
    return this.projects.list(user.id, page, pageSize);
  }

  @Get(':id')
  find(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.projects.findOwned(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() input: UpdateProjectDto,
  ) {
    return this.projects.update(user.id, id, input);
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.projects.remove(user.id, id);
    return { ok: true };
  }
}
