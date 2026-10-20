import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { unzipSync } from 'fflate';
import { validate } from 'class-validator';
import {
  campaignRoles,
  campaignSchema,
  DEFAULT_CAMPAIGN_CONFIG,
  generationSnapshotSchema,
  productBriefAnalysisSchema,
} from '@image-set/shared';
import { resolveGenerationPrompt } from './generation-prompts.js';
import {
  GenerationsService,
  type GenerationQueueService,
} from './generations.js';
import { CreateExportDto, ExportsService } from './exports.js';
import type { DatabaseService } from './database.service.js';

const assetId = '22222222-2222-4222-8222-222222222222';
const jobId = '33333333-3333-4333-8333-333333333333';
const config = { ...DEFAULT_CAMPAIGN_CONFIG, pack: 'gallery' as const };
const analysis = productBriefAnalysisSchema.parse({
  schemaVersion: 2,
  analysisLocale: 'zh-CN',
  confirmed: true,
  product: {
    text: 'Blue bottle',
    source: 'image',
    evidence: 'photo',
    confirmed: true,
  },
  functions: [],
  sellingPoints: [
    {
      text: 'UNCONFIRMED CLAIM',
      source: 'suggestion',
      evidence: 'suggestion',
      confirmed: false,
    },
  ],
  audience: [],
  scenes: [],
  specifications: [],
  appearance: 'Blue steel body',
  accessories: [],
  packaging: [],
  forbiddenChanges: ['Keep cap'],
  missingInformation: [],
  warnings: [],
  campaign: campaignSchema.parse({
    id: '11111111-1111-4111-8111-111111111111',
    version: 'ecom-skill-v1',
    config,
    targetLocale: 'en-US',
    confirmed: true,
    driver: 'visual',
    styleLock: 'Warm studio light',
    images: campaignRoles(config).map((role, i) => ({
      role,
      title: role,
      templateId: 'infographic',
      objective: 'Show product',
      composition: 'Product centered',
      copy: i ? 'BLUE BOTTLE' : '',
      factRefs: ['product'],
    })),
  }),
});
const snapshot = generationSnapshotSchema.parse({
  role: 'gallery_1',
  targetPlatform: 'amazon_us',
  targetLocale: 'en-US',
  productCategory: null,
  productBrief: {},
  analysis,
  productAssetIds: [assetId],
  referenceAssetIds: [],
  requestType: 'full_set',
});

function generationHarness(
  options: {
    duplicatePrompt?: string;
    queueFails?: boolean;
    missing?: boolean;
    active?: boolean;
    balance?: number;
  } = {},
) {
  const writes: string[] = [];
  let saved: typeof snapshot | undefined;
  const query = vi.fn((sql: string, params: unknown[] = []) => {
    if (/^(insert|update)/.test(sql.trim())) writes.push(sql);
    if (sql.includes('select credit_balance'))
      return { rows: [{ creditBalance: options.balance ?? 100 }], rowCount: 1 };
    if (sql.includes('j.idempotency_key = $2'))
      return {
        rows: options.duplicatePrompt
          ? [
              {
                id: 'duplicate',
                jobType: 'image',
                inputSnapshot: {
                  ...snapshot,
                  requestType: 'regenerate',
                  sourceJobId: jobId,
                  promptOverride: options.duplicatePrompt,
                },
              },
            ]
          : [],
        rowCount: 0,
      };
    if (sql.includes('join projects p'))
      return {
        rows: options.missing
          ? []
          : [
              {
                id: jobId,
                projectId: 'project',
                userId: 'owner',
                imageRole: 'gallery_1',
                jobType: 'image',
                status: 'succeeded',
                inputSnapshot: snapshot,
              },
            ],
        rowCount: options.missing ? 0 : 1,
      };
    if (sql.includes("status in ('queued','running')"))
      return {
        rows: options.active ? [{ id: 'active' }] : [],
        rowCount: options.active ? 1 : 0,
      };
    if (sql.includes('insert into generation_jobs')) {
      saved = params[7] as typeof snapshot;
      return {
        rows: [
          {
            id: 'new-job',
            projectId: 'project',
            userId: 'owner',
            imageRole: 'gallery_1',
            creditsReserved: 3,
            inputSnapshot: saved,
          },
        ],
        rowCount: 1,
      };
    }
    if (sql.includes("update generation_jobs set status = 'failed'"))
      return { rows: [{ id: 'new-job' }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  const client = { query, release: vi.fn() };
  const poolQuery = vi.fn().mockResolvedValue({ rows: [] });
  const database = {
    client: {
      pool: {
        connect: vi.fn().mockResolvedValue(client),
        query: poolQuery,
      },
    },
  } as unknown as DatabaseService;
  const enqueue = options.queueFails
    ? vi.fn().mockRejectedValue(new Error('offline'))
    : vi.fn().mockResolvedValue(undefined);
  const service = new GenerationsService(database, {
    enqueue,
  } as unknown as GenerationQueueService);
  return {
    service,
    query,
    writes,
    enqueue,
    database,
    poolQuery,
    saved: () => saved,
  };
}

describe('image prompt regeneration', () => {
  it('keeps exact persisted prompts and adds immutable hero constraints to edited prompts', () => {
    expect(
      resolveGenerationPrompt({
        ...snapshot,
        resolvedPrompt: 'EXACT HISTORICAL PROMPT',
      }),
    ).toBe('EXACT HISTORICAL PROMPT');
    const prompt = resolveGenerationPrompt({
      ...snapshot,
      promptOverride: 'Use softer lighting',
    });
    expect(prompt).toContain('Use softer lighting');
    expect(prompt).toContain('纯白 #FFFFFF');
    expect(prompt).toContain('en-US');
    expect(prompt).not.toContain('UNCONFIRMED CLAIM');
    expect(resolveGenerationPrompt(snapshot)).toContain('Warm studio light');
  });

  it('creates one snapshot-backed task and reserves exactly three credits', async () => {
    const harness = generationHarness();
    const result = await harness.service.retry(
      'owner',
      jobId,
      'regeneration-key',
      'Use softer lighting',
    );
    expect(result.creditBalance).toBe(97);
    expect(harness.saved()).toMatchObject({
      requestType: 'regenerate',
      sourceJobId: jobId,
      promptOverride: 'Use softer lighting',
      productAssetIds: [assetId],
    });
    expect(harness.saved()?.resolvedPrompt).toContain('Use softer lighting');
    expect(harness.enqueue).toHaveBeenCalledTimes(1);
    expect(
      harness.writes.filter((sql) => sql.includes('insert into credit_ledger')),
    ).toHaveLength(1);
  });

  it('replays identical idempotency keys without a second reservation and rejects changed prompts', async () => {
    const same = generationHarness({ duplicatePrompt: 'Softer light' });
    await same.service.retry(
      'owner',
      jobId,
      'regeneration-key',
      'Softer light',
    );
    expect(same.writes).toHaveLength(0);
    expect(same.enqueue).not.toHaveBeenCalled();
    const changed = generationHarness({ duplicatePrompt: 'Softer light' });
    await expect(
      changed.service.retry(
        'owner',
        jobId,
        'regeneration-key',
        'Different light',
      ),
    ).rejects.toThrow('Idempotency-Key');
    expect(changed.writes).toHaveLength(0);
  });

  it('rejects unavailable source records, active projects and insufficient credits before writing', async () => {
    for (const options of [
      { missing: true },
      { active: true },
      { balance: 2 },
    ]) {
      const harness = generationHarness(options);
      await expect(
        harness.service.retry(
          'owner',
          jobId,
          'regeneration-key',
          'Softer light',
        ),
      ).rejects.toThrow();
      expect(harness.writes).toHaveLength(0);
    }
    const harness = generationHarness();
    await expect(
      harness.service.imageDetails('other-user', assetId),
    ).rejects.toThrow('图片生成记录不存在');
    expect(harness.poolQuery).toHaveBeenCalledWith(
      expect.stringContaining('a.owner_user_id=$2'),
      [assetId, 'other-user'],
    );
    await expect(
      harness.service.regenerate('owner', assetId, 'regeneration-key', '   '),
    ).rejects.toThrow('Prompt');
    await expect(
      harness.service.regenerate(
        'owner',
        assetId,
        'regeneration-key',
        'x'.repeat(30001),
      ),
    ).rejects.toThrow('Prompt');
  });

  it('refunds queue failures through the existing settlement path', async () => {
    const harness = generationHarness({ queueFails: true });
    await expect(
      harness.service.retry('owner', jobId, 'regeneration-key', 'Softer light'),
    ).rejects.toThrow('额度已退回');
    expect(harness.writes.some((sql) => sql.includes("'refund'"))).toBe(true);
  });
});

describe('selectable export formats', () => {
  it('rejects empty, duplicate and unsupported formats', async () => {
    for (const formats of [[], ['png', 'png'], ['webp']]) {
      const dto = Object.assign(new CreateExportDto(), { formats });
      expect(await validate(dto)).not.toHaveLength(0);
    }
    expect(
      await validate(Object.assign(new CreateExportDto(), { format: 'png' })),
    ).toHaveLength(0);
    expect(
      await validate(
        Object.assign(new CreateExportDto(), {
          formats: ['png', 'jpg'],
          assetId,
        }),
      ),
    ).toHaveLength(0);
  });

  it('exports the selected historical asset in both formats as a single ZIP', async () => {
    const source = await sharp({
      create: { width: 64, height: 80, channels: 3, background: '#336699' },
    })
      .png()
      .toBuffer();
    const query = vi.fn((sql: string) =>
      sql.includes('from projects')
        ? { rows: [{ name: 'Bottle', analysisResult: analysis }] }
        : {
            rows: [
              {
                imageRole: 'gallery_1',
                objectKey: 'historical-image',
                width: 64,
                height: 80,
                snapshot,
              },
            ],
          },
    );
    const service = Object.create(ExportsService.prototype) as ExportsService;
    Object.assign(service, { database: { client: { pool: { query } } } });
    const internal = service as unknown as {
      readObject: (key: string) => Promise<Buffer>;
      saveOrReuse: (input: {
        buffer: Buffer;
        mimeType: string;
      }) => Promise<{ id: string }>;
    };
    const read = vi.spyOn(internal, 'readObject').mockResolvedValue(source);
    const save = vi
      .spyOn(internal, 'saveOrReuse')
      .mockResolvedValue({ id: 'export' });
    expect(
      (
        await service.create(
          'owner',
          'project',
          'png',
          undefined,
          ['png', 'jpg'],
          assetId,
        )
      ).bundle,
    ).toBe(true);
    const archive = unzipSync(save.mock.calls[0]![0].buffer);
    expect(Object.keys(archive)).toHaveLength(2);
    expect(Object.keys(archive).some((name) => name.endsWith('.png'))).toBe(
      true,
    );
    expect(Object.keys(archive).some((name) => name.endsWith('.jpg'))).toBe(
      true,
    );
    for (const bytes of Object.values(archive))
      expect(await sharp(Buffer.from(bytes)).metadata()).toMatchObject({
        width: 64,
        height: 80,
      });
    expect(read).toHaveBeenCalledWith('historical-image');
    expect(save.mock.calls[0]![0].mimeType).toBe('application/zip');
    expect(query.mock.calls[1]![0]).toContain('a.owner_user_id=$3');
    expect(
      (
        await service.create(
          'owner',
          'project',
          'png',
          undefined,
          ['jpg'],
          assetId,
        )
      ).bundle,
    ).toBe(false);
    expect(save.mock.calls[1]![0].mimeType).toBe('image/jpeg');
  });
});
