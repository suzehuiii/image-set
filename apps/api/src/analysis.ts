import { AiProviderError } from '@image-set/ai-provider';
import {
  projectAnalysisSchema,
  isBrief,
  browserLocale,
  campaignConfigSchema,
  validateCampaign,
  type ProjectAnalysis,
  type CampaignConfig,
} from '@image-set/shared';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { IsObject } from 'class-validator';
import { randomUUID } from 'node:crypto';

import { AiProviderService } from './ai-provider.service.js';
import { AssetsService } from './assets.js';
import { AuthGuard, CurrentUser, type AuthUser } from './auth.js';
import { DatabaseService } from './database.service.js';

const ANALYSIS_CREDITS = 1;
const PROMPT_VERSION = 'product-brief-skill-v1';

type AnalysisProject = {
  id: string;
  targetPlatform: string;
  targetLocale: string;
  productCategory: string | null;
  productBrief: Record<string, unknown>;
  analysisResult: ProjectAnalysis | null;
};

type JobRow = {
  id: string;
  projectId: string;
  jobType: string;
  imageRole: string | null;
  status: string;
  provider: string;
  model: string;
  creditsReserved: number;
  attemptCount: number;
  resultAssetId: string | null;
  inputSnapshot?: { operation?: string };
  campaignId?: string;
  progress: number;
  stage: string;
  errorCode: string | null;
  errorMessageSafe: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
};

export class SaveAnalysisDto {
  @IsObject()
  analysis!: Record<string, unknown>;
}

export class PlanCampaignDto {
  @IsObject()
  config!: Record<string, unknown>;
}

@Injectable()
export class AnalysisService {
  constructor(
    private readonly database: DatabaseService,
    private readonly assets: AssetsService,
    private readonly ai: AiProviderService,
  ) {}

  async analyze(
    userId: string,
    projectId: string,
    idempotencyKey: string | undefined,
    language?: string,
    config?: CampaignConfig,
  ) {
    const key = this.validateIdempotencyKey(idempotencyKey);
    const reserved = await this.reserve(
      userId,
      projectId,
      key,
      config ? 'plan' : 'brief',
      browserLocale(language),
      config,
    );
    if (reserved.existing) {
      if (
        reserved.job.status === 'succeeded' &&
        reserved.project.analysisResult
      ) {
        return {
          job: reserved.job,
          analysis: reserved.project.analysisResult,
          creditBalance: reserved.creditBalance,
        };
      }
      throw new ConflictException(
        reserved.job.status === 'running'
          ? '商品分析正在处理中'
          : '该幂等请求已结束，请使用新的 Idempotency-Key 重试',
      );
    }

    try {
      const productAssets = await this.assets.productAnalysisInputs(
        userId,
        projectId,
      );
      let analysis: ProjectAnalysis;
      if (config) {
        const brief = reserved.project.analysisResult;
        if (
          !brief ||
          !isBrief(brief) ||
          !brief.confirmed ||
          !brief.product.confirmed
        )
          throw new AiProviderError(
            'AI_INPUT_INVALID',
            '请先保存并确认商品简报',
          );
        const campaign = await this.ai.planCampaign({
          brief,
          config,
          targetPlatform: reserved.project.targetPlatform,
          targetLocale: reserved.project.targetLocale,
          referenceAssets: await this.assets.productAnalysisInputs(
            userId,
            projectId,
            'reference',
          ),
          referenceContentEnabled:
            reserved.project.productBrief.referenceContentEnabled === true,
        });
        analysis = { ...brief, campaign };
      } else {
        const manual = await this.assets.manualAnalysisInput(userId, projectId);
        const referenceContentEnabled =
          reserved.project.productBrief.referenceContentEnabled === true;
        analysis = await this.ai.analyzeBrief({
          projectId,
          productAssets,
          targetPlatform: reserved.project.targetPlatform,
          targetLocale: reserved.project.targetLocale,
          productCategory: reserved.project.productCategory,
          productBrief: reserved.project.productBrief,
          analysisLocale: browserLocale(language),
          manualText: manual.text,
          referenceContentEnabled,
          referenceAssets: referenceContentEnabled
            ? await this.assets.productAnalysisInputs(
                userId,
                projectId,
                'reference',
              )
            : [],
        });
        if (manual.warning) analysis.warnings.push(manual.warning);
      }
      const settled = await this.consume(
        userId,
        reserved.job.id,
        projectId,
        analysis,
        key,
      );
      return { job: settled.job, analysis, creditBalance: settled.balance };
    } catch (error) {
      const providerError =
        error instanceof AiProviderError
          ? error
          : new AiProviderError('ANALYSIS_FAILED', '商品分析失败');
      await this.refund(userId, reserved.job.id, projectId, key, providerError);
      throw new ServiceUnavailableException({
        code: providerError.code,
        message: providerError.message,
      });
    }
  }

  async save(
    userId: string,
    projectId: string,
    rawAnalysis: Record<string, unknown>,
  ) {
    const parsed = projectAnalysisSchema.safeParse(rawAnalysis);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'INVALID_ANALYSIS',
        message: '分析内容不符合结构要求',
        details: { issues: parsed.error.issues },
      });
    }
    const client = await this.database.client.pool.connect();
    try {
      await client.query('begin');
      await client.query('select id from users where id=$1 for update', [
        userId,
      ]);
      const current = await client.query<{ analysis: unknown }>(
        `select analysis_result as analysis from projects where id=$1 and user_id=$2 and deleted_at is null for update`,
        [projectId, userId],
      );
      if (!current.rows[0]) throw new NotFoundException('项目不存在');
      const active = await client.query(
        `select id from generation_jobs where project_id=$1 and user_id=$2 and status in ('queued','running') limit 1`,
        [projectId, userId],
      );
      if (active.rowCount)
        throw new ConflictException('任务处理中，请完成后修改简报或方案');
      if (isBrief(parsed.data)) {
        const old = projectAnalysisSchema.safeParse(current.rows[0].analysis);
        if (parsed.data.campaign) {
          if (
            !old.success ||
            !isBrief(old.data) ||
            !old.data.campaign ||
            parsed.data.campaign.id !== old.data.campaign.id
          )
            throw new BadRequestException('请先由系统生成图片方案');
          const brief = { ...parsed.data, campaign: null };
          const previous = { ...old.data, campaign: null };
          if (JSON.stringify(brief) !== JSON.stringify(previous))
            parsed.data.campaign = null;
          else {
            const previousCampaign = old.data.campaign;
            if (
              JSON.stringify(parsed.data.campaign.config) !==
                JSON.stringify(previousCampaign.config) ||
              parsed.data.campaign.targetLocale !==
                previousCampaign.targetLocale
            )
              throw new BadRequestException('配置变更后请重新策划');
            if (!validateCampaign(parsed.data, parsed.data.campaign))
              throw new BadRequestException('方案数量、顺序或事实引用不正确');
            if (
              JSON.stringify({ ...parsed.data.campaign, confirmed: false }) !==
              JSON.stringify({ ...previousCampaign, confirmed: false })
            )
              parsed.data.campaign.id = randomUUID();
          }
        }
        if (parsed.data.confirmed && !parsed.data.product.confirmed)
          throw new BadRequestException('请先确认主商品身份');
      }
      const result = await client.query(
        `update projects set analysis_result = $3, status = 'ready', updated_at = now()
       where id = $1 and user_id = $2 and deleted_at is null returning id`,
        [projectId, userId, parsed.data],
      );
      if (result.rowCount === 0) throw new NotFoundException('项目不存在');
      await client.query('commit');
      return { analysis: parsed.data };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async listJobs(userId: string, projectId: string): Promise<JobRow[]> {
    const result = await this.database.client.pool.query<JobRow>(
      `select j.id, j.project_id as "projectId", j.job_type as "jobType", j.status,
              j.image_role as "imageRole", j.provider, j.model,
              j.result_asset_id as "resultAssetId", j.credits_reserved as "creditsReserved",
              j.attempt_count as "attemptCount", j.error_code as "errorCode",
              j.input_snapshot->'analysis'->'campaign'->>'id' as "campaignId",
              j.progress, j.stage,
              j.error_message_safe as "errorMessageSafe", j.started_at as "startedAt",
              j.completed_at as "completedAt", j.created_at as "createdAt"
       from generation_jobs j join projects p on p.id = j.project_id
       where j.project_id = $1 and j.user_id = $2 and p.deleted_at is null
       order by j.created_at desc limit 250`,
      [projectId, userId],
    );
    return result.rows;
  }

  async findJob(userId: string, jobId: string): Promise<JobRow> {
    const result = await this.database.client.pool.query<JobRow>(
      `select j.id, j.project_id as "projectId", j.job_type as "jobType", j.status,
              j.image_role as "imageRole", j.provider, j.model,
              j.result_asset_id as "resultAssetId", j.credits_reserved as "creditsReserved",
              j.attempt_count as "attemptCount", j.error_code as "errorCode",
              j.input_snapshot->'analysis'->'campaign'->>'id' as "campaignId",
              j.progress, j.stage,
              j.error_message_safe as "errorMessageSafe", j.started_at as "startedAt",
              j.completed_at as "completedAt", j.created_at as "createdAt"
       from generation_jobs j join projects p on p.id = j.project_id
       where j.id = $1 and j.user_id = $2 and p.deleted_at is null`,
      [jobId, userId],
    );
    const job = result.rows[0];
    if (!job) throw new NotFoundException('任务不存在');
    return job;
  }

  private validateIdempotencyKey(key: string | undefined): string {
    const normalized = key?.trim();
    if (!normalized || normalized.length < 8 || normalized.length > 120) {
      throw new BadRequestException('Idempotency-Key 长度须为 8–120 个字符');
    }
    return normalized;
  }

  private async reserve(
    userId: string,
    projectId: string,
    key: string,
    operation: string,
    analysisLocale: string,
    config?: CampaignConfig,
  ) {
    const client = await this.database.client.pool.connect();
    try {
      await client.query('begin');
      const user = await client.query<{ creditBalance: number }>(
        `select credit_balance as "creditBalance" from users
         where id = $1 and status = 'active' for update`,
        [userId],
      );
      const balance = user.rows[0]?.creditBalance;
      if (balance === undefined) throw new NotFoundException('用户不存在');
      const existing = await client.query<JobRow>(
        `select id, input_snapshot as "inputSnapshot", project_id as "projectId", job_type as "jobType", status, provider, model,
                credits_reserved as "creditsReserved", attempt_count as "attemptCount",
                error_code as "errorCode", error_message_safe as "errorMessageSafe",
                started_at as "startedAt", completed_at as "completedAt", created_at as "createdAt"
         from generation_jobs where user_id = $1 and idempotency_key = $2`,
        [userId, key],
      );
      const projectResult = await client.query<AnalysisProject>(
        `select id, target_platform as "targetPlatform", target_locale as "targetLocale",
                product_category as "productCategory", product_brief as "productBrief",
                analysis_result as "analysisResult"
         from projects where id = $1 and user_id = $2 and deleted_at is null for update`,
        [projectId, userId],
      );
      const project = projectResult.rows[0];
      if (!project) throw new NotFoundException('项目不存在');
      const active = await client.query(
        `select id from generation_jobs where project_id=$1 and user_id=$2 and status in ('queued','running') and idempotency_key<>$3 limit 1`,
        [projectId, userId, key],
      );
      if (active.rowCount) throw new ConflictException('该项目已有任务执行中');
      if (
        operation === 'plan' &&
        (!project.analysisResult ||
          !isBrief(project.analysisResult) ||
          !project.analysisResult.confirmed)
      )
        throw new BadRequestException('请先确认商品简报');
      const previousJob = existing.rows[0];
      if (previousJob) {
        if (
          previousJob.projectId !== projectId ||
          previousJob.jobType !== 'analysis' ||
          (previousJob.inputSnapshot?.operation ?? 'brief') !== operation
        ) {
          throw new ConflictException('Idempotency-Key 已用于其他请求');
        }
        await client.query('commit');
        return {
          existing: true as const,
          job: previousJob,
          project,
          creditBalance: balance,
        };
      }
      const assetResult = await client.query<{
        id: string;
        checksum: string;
      }>(
        `select id, checksum from assets
         where project_id = $1 and owner_user_id = $2 and asset_type = 'product'
           and status = 'ready' and deleted_at is null order by created_at`,
        [projectId, userId],
      );
      if (assetResult.rowCount === 0) {
        throw new BadRequestException('请先上传至少一张商品图');
      }
      if (balance < ANALYSIS_CREDITS) {
        throw new ConflictException('额度不足');
      }
      const jobId = randomUUID();
      const model = process.env.OPENAI_ANALYSIS_MODEL ?? 'gpt-6.1-sol';
      const updatedUser = await client.query<{ creditBalance: number }>(
        `update users set credit_balance = credit_balance - $2, updated_at = now()
         where id = $1 returning credit_balance as "creditBalance"`,
        [userId, ANALYSIS_CREDITS],
      );
      const job = await client.query<JobRow>(
        `insert into generation_jobs(
           id, project_id, user_id, job_type, status, provider, model, prompt_version,
           idempotency_key, input_snapshot, credits_reserved, attempt_count, started_at
         ) values ($1,$2,$3,'analysis','running','openai',$4,$5,$6,$7,$8,1,now())
         returning id, project_id as "projectId", job_type as "jobType", status, provider, model,
                   credits_reserved as "creditsReserved", attempt_count as "attemptCount",
                   error_code as "errorCode", error_message_safe as "errorMessageSafe",
                   started_at as "startedAt", completed_at as "completedAt", created_at as "createdAt"`,
        [
          jobId,
          projectId,
          userId,
          model,
          PROMPT_VERSION,
          key,
          {
            operation,
            brief: project.analysisResult,
            analysisLocale,
            config,
            targetPlatform: project.targetPlatform,
            targetLocale: project.targetLocale,
            productCategory: project.productCategory,
            productBrief: project.productBrief,
            productAssets: assetResult.rows,
          },
          ANALYSIS_CREDITS,
        ],
      );
      const nextBalance = updatedUser.rows[0]?.creditBalance ?? 0;
      await client.query(
        `insert into credit_ledger(id, user_id, job_id, entry_type, delta, balance_after, idempotency_key, description)
         values ($1,$2,$3,'reserve',$4,$5,$6,'AI 商品分析额度预留')`,
        [
          randomUUID(),
          userId,
          jobId,
          -ANALYSIS_CREDITS,
          nextBalance,
          `${key}:reserve`,
        ],
      );
      await client.query(
        `update projects set status = 'analyzing', updated_at = now() where id = $1`,
        [projectId],
      );
      await client.query('commit');
      return {
        existing: false as const,
        job: job.rows[0] as JobRow,
        project,
        creditBalance: nextBalance,
      };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  private async consume(
    userId: string,
    jobId: string,
    projectId: string,
    analysis: ProjectAnalysis,
    key: string,
  ) {
    const client = await this.database.client.pool.connect();
    try {
      await client.query('begin');
      const balance = await client.query<{ creditBalance: number }>(
        `select credit_balance as "creditBalance" from users where id = $1 for update`,
        [userId],
      );
      const job = await client.query<JobRow>(
        `update generation_jobs set status = 'succeeded', completed_at = now()
         where id = $1 and user_id = $2 and status = 'running'
         returning id, project_id as "projectId", job_type as "jobType", status, provider, model,
                   credits_reserved as "creditsReserved", attempt_count as "attemptCount",
                   error_code as "errorCode", error_message_safe as "errorMessageSafe",
                   started_at as "startedAt", completed_at as "completedAt", created_at as "createdAt"`,
        [jobId, userId],
      );
      if (job.rowCount === 0) throw new Error('Analysis job is not running');
      await client.query(
        `update projects set analysis_result = $3, status = 'ready', updated_at = now()
         where id = $1 and user_id = $2`,
        [projectId, userId, analysis],
      );
      const currentBalance = balance.rows[0]?.creditBalance ?? 0;
      await client.query(
        `insert into credit_ledger(id, user_id, job_id, entry_type, delta, balance_after, idempotency_key, description)
         values ($1,$2,$3,'consume',0,$4,$5,'AI 商品分析额度消费')`,
        [randomUUID(), userId, jobId, currentBalance, `${key}:consume`],
      );
      await client.query('commit');
      return { job: job.rows[0] as JobRow, balance: currentBalance };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  private async refund(
    userId: string,
    jobId: string,
    projectId: string,
    key: string,
    error: AiProviderError,
  ): Promise<void> {
    const client = await this.database.client.pool.connect();
    try {
      await client.query('begin');
      const failed = await client.query<{ creditsReserved: number }>(
        `update generation_jobs set status = 'failed', error_code = $3,
                error_message_safe = $4, completed_at = now()
         where id = $1 and user_id = $2 and status = 'running'
         returning credits_reserved as "creditsReserved"`,
        [jobId, userId, error.code, error.message.slice(0, 500)],
      );
      const amount = failed.rows[0]?.creditsReserved;
      if (amount === undefined) {
        await client.query('commit');
        return;
      }
      const user = await client.query<{ creditBalance: number }>(
        `update users set credit_balance = credit_balance + $2, updated_at = now()
         where id = $1 returning credit_balance as "creditBalance"`,
        [userId, amount],
      );
      await client.query(
        `insert into credit_ledger(id, user_id, job_id, entry_type, delta, balance_after, idempotency_key, description)
         values ($1,$2,$3,'refund',$4,$5,$6,'AI 商品分析失败退款')`,
        [
          randomUUID(),
          userId,
          jobId,
          amount,
          user.rows[0]?.creditBalance ?? 0,
          `${key}:refund`,
        ],
      );
      await client.query(
        `update projects set status = case when analysis_result is null then 'failed' else 'ready' end,
                updated_at = now() where id = $1 and user_id = $2`,
        [projectId, userId],
      );
      await client.query('commit');
    } catch (refundError) {
      await client.query('rollback');
      throw refundError;
    } finally {
      client.release();
    }
  }
}

@Controller()
@UseGuards(AuthGuard)
export class AnalysisController {
  constructor(private readonly analysis: AnalysisService) {}

  @Post('projects/:id/analyze')
  analyzeProject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('accept-language') language?: string,
  ) {
    return this.analysis.analyze(user.id, id, idempotencyKey, language);
  }

  @Post('projects/:id/plan')
  plan(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: PlanCampaignDto,
  ) {
    const parsed = campaignConfigSchema.safeParse(input.config);
    if (!parsed.success) throw new BadRequestException('图片包配置不正确');
    return this.analysis.analyze(user.id, id, key, undefined, parsed.data);
  }

  @Patch('projects/:id/content')
  save(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() input: SaveAnalysisDto,
  ) {
    return this.analysis.save(user.id, id, input.analysis);
  }

  @Get('projects/:id/jobs')
  async listJobs(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { items: await this.analysis.listJobs(user.id, id) };
  }

  @Get('jobs/:id')
  findJob(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.analysis.findJob(user.id, id);
  }
}
