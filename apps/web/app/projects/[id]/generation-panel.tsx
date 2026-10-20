'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  IMAGE_ROLES,
  type ImageRole,
  type ProjectAnalysis,
  isBrief,
  imageRatio,
} from '@image-set/shared';

import { api, type Asset, type Job } from '../../lib/api';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Expand,
  Images,
  ShieldCheck,
  TriangleAlert,
  MessageSquareText,
  Code2,
  Sparkles,
} from 'lucide-react';
import { ImageDetailsDialog } from '@/components/image-details-dialog';
import { DownloadDialog } from '@/components/download-dialog';

const ROLE_LABELS: Partial<Record<ImageRole, string>> = {
  main: '白底主图',
  feature_1: '功能卖点图 1',
  feature_2: '功能卖点图 2',
  feature_3: '功能卖点图 3',
  feature_4: '功能卖点图 4',
  lifestyle_1: '使用场景图 1',
  lifestyle_2: '使用场景图 2',
  lifestyle_3: '使用场景图 3',
  detail: '材质 / 细节图',
};

const STAGE_LABELS: Record<string, string> = {
  queued: '等待中',
  loading_sources: '读取素材',
  generating: '生成视觉',
  reviewing: '一致性检查',
  storing: '保存结果',
  retry_wait: '等待自动重试',
  completed: '已完成',
  failed: '失败',
};

export function GenerationPanel({
  projectId,
  creditBalance,
  analysis,
  dirty,
  assets,
  jobs,
  onRefresh,
}: {
  projectId: string;
  creditBalance: number;
  analysis: ProjectAnalysis;
  dirty: boolean;
  assets: Asset[];
  jobs: Job[];
  onRefresh: () => Promise<void>;
}) {
  const campaign = isBrief(analysis) ? analysis.campaign : null;
  const roles: ImageRole[] = isBrief(analysis)
    ? (campaign?.images.map((x) => x.role) ?? [])
    : [...IMAGE_ROLES];
  const label = (role: ImageRole) =>
    campaign?.images.find((x) => x.role === role)?.title ??
    ROLE_LABELS[role] ??
    role;
  const ready =
    !dirty &&
    (!isBrief(analysis) || Boolean(analysis.confirmed && campaign?.confirmed));
  const [pending, setPending] = useState(false);
  const [filter, setFilter] = useState('gallery');
  const [preview, setPreview] = useState<Asset | null>(null);
  const [detailTab, setDetailTab] = useState('prompt');
  const [error, setError] = useState('');
  const imageJobs = useMemo(
    () =>
      jobs.filter(
        (job) =>
          job.jobType === 'image' &&
          (campaign
            ? job.campaignId === campaign.id
            : !isBrief(analysis) && !job.campaignId),
      ),
    [jobs, campaign, analysis],
  );
  // Historical prompt regenerations also need progress polling.
  const active = jobs.some(
    (job) => job.status === 'queued' || job.status === 'running',
  );
  const visibleAssets = assets.filter((asset) =>
    imageJobs.some((job) => job.resultAssetId === asset.id),
  );
  const completeSet =
    roles.length > 0 &&
    roles.every((role) =>
      visibleAssets.some((asset) => asset.imageRole === role),
    );
  const history = assets.filter((asset) => asset.assetType === 'generated');
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      void onRefresh().catch((e: unknown) =>
        setError(e instanceof Error ? e.message : '刷新失败'),
      );
    }, 2000);
    return () => window.clearInterval(timer);
  }, [active, onRefresh]);
  async function create(role?: ImageRole, retryId?: string) {
    setPending(true);
    setError('');
    try {
      await api(
        retryId
          ? `/jobs/${retryId}/retry`
          : `/projects/${projectId}/generations`,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': crypto.randomUUID() },
          ...(retryId ? {} : { body: JSON.stringify(role ? { role } : {}) }),
        },
      );
      await onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建任务失败');
    } finally {
      setPending(false);
    }
  }
  function indicators(asset: Asset, copy: boolean) {
    return (
      <div className="image-indicators">
        <Button
          variant="ghost"
          size="icon"
          className={
            'image-indicator ' +
            (asset.qaResult?.status === 'passed' ? 'passed' : 'review')
          }
          aria-label={
            asset.qaResult?.status === 'passed'
              ? '查看审核：一致性检查通过'
              : '查看审核：需要人工复核或暂无记录'
          }
          title={
            asset.qaResult?.status === 'passed'
              ? '一致性通过，点击查看详情'
              : '点击查看审核详情'
          }
          onClick={() => {
            setDetailTab('review');
            setPreview(asset);
          }}
        >
          {asset.qaResult?.status === 'passed' ? (
            <ShieldCheck />
          ) : (
            <TriangleAlert />
          )}
        </Button>
        {copy && (
          <Button
            variant="ghost"
            size="icon"
            className="image-indicator"
            title="查看图片文案"
            aria-label="查看图片文案"
            onClick={() => {
              setDetailTab('copy');
              setPreview(asset);
            }}
          >
            <MessageSquareText />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="image-indicator"
          title="查看与编辑 Prompt"
          aria-label="查看与编辑 Prompt"
          onClick={() => {
            setDetailTab('prompt');
            setPreview(asset);
          }}
        >
          <Code2 />
        </Button>
      </div>
    );
  }
  return (
    <section className="generation-section" aria-busy={active}>
      <div className="section-head generation-heading">
        <div>
          <p className="eyebrow">CAMPAIGN IMAGE SET</p>
          <h2>你的商品套图</h2>
          <p>点击图片查看大图、审核与文案，也可以修改 Prompt 单张重新生成。</p>
        </div>
        <div className="generation-actions">
          <Button
            disabled={
              pending ||
              !ready ||
              !roles.length ||
              creditBalance < roles.length * 3
            }
            onClick={() => create()}
          >
            <Sparkles size={16} />
            {`生成整套 ${roles.length} 张 · ${roles.length * 3} 额度`}
          </Button>
          <DownloadDialog
            projectId={projectId}
            disabled={!completeSet}
            label="下载整套"
          />
        </div>
      </div>
      {error && (
        <p className="error banner" role="alert">
          {error}
        </p>
      )}
      {!ready && (
        <p className="detail-hint" role="status">
          请先保存并确认商品简报和图片方案，再生成图片。
        </p>
      )}
      <Tabs value={filter} onValueChange={setFilter} className="result-tabs">
        <TabsList aria-label="图片分组">
          <TabsTrigger value="gallery">
            {campaign ? '展示图' : '套图'}{' '}
            <span>
              {campaign
                ? roles.filter((r) => r.startsWith('gallery_')).length
                : roles.length}
            </span>
          </TabsTrigger>
          {campaign && roles.some((r) => r.startsWith('pdp_')) && (
            <TabsTrigger value="detail">
              详情图{' '}
              <span>{roles.filter((r) => r.startsWith('pdp_')).length}</span>
            </TabsTrigger>
          )}
          <TabsTrigger value="history">历史原图</TabsTrigger>
        </TabsList>
        <span className="result-count">
          已完成{' '}
          {
            roles.filter((r) => visibleAssets.some((a) => a.imageRole === r))
              .length
          }{' '}
          / {roles.length}
        </span>
      </Tabs>
      {filter === 'history' ? (
        <div className="history-grid">
          {history.map((asset) => (
            <article key={asset.id}>
              <Button
                variant="ghost"
                className="image-open history-preview"
                onClick={() => setPreview(asset)}
                aria-label={'查看历史图片 ' + asset.originalName}
              >
                <img
                  src={`/api/assets/${asset.id}/content`}
                  alt={asset.originalName}
                />
              </Button>
              <p>
                {asset.imageRole} · {asset.width} × {asset.height}
              </p>
              <div className="image-card-footer">
                {indicators(
                  asset,
                  asset.imageRole !== 'main' && asset.imageRole !== 'gallery_1',
                )}
                <DownloadDialog
                  projectId={projectId}
                  asset={asset}
                  label="下载"
                  variant="ghost"
                />
              </div>
            </article>
          ))}
          {!history.length && <p className="studio-note">还没有生成历史。</p>}
        </div>
      ) : (
        <div className="generation-grid">
          {roles
            .filter(
              (role) =>
                !campaign ||
                (filter === 'detail'
                  ? role.startsWith('pdp_')
                  : role.startsWith('gallery_')),
            )
            .map((role) => {
              const latest = imageJobs.find((job) => job.imageRole === role);
              const result =
                visibleAssets.find(
                  (asset) => asset.id === latest?.resultAssetId,
                ) ?? visibleAssets.find((asset) => asset.imageRole === role);
              const processing =
                latest?.status === 'queued' || latest?.status === 'running';
              return (
                <article className="generation-card" key={role}>
                  <div
                    className="generation-preview"
                    style={{
                      aspectRatio: campaign
                        ? imageRatio(campaign, role).replace(':', '/')
                        : '1',
                    }}
                  >
                    {result ? (
                      <Button
                        variant="ghost"
                        className="image-open"
                        aria-label={'查看大图 ' + label(role)}
                        onClick={() => setPreview(result)}
                      >
                        <img
                          src={`/api/assets/${result.id}/content`}
                          alt={label(role)}
                        />
                        <span className="image-open-hint">
                          <Expand size={16} />
                          查看详情
                        </span>
                      </Button>
                    ) : (
                      <span className="image-placeholder">
                        <Images size={28} strokeWidth={1} />
                        <span>{label(role)}</span>
                        <small>等待生成</small>
                      </span>
                    )}
                    {processing && (
                      <div
                        className="generation-progress"
                        role="progressbar"
                        aria-label={label(role) + '生成进度'}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={latest.progress}
                      >
                        <strong>{latest.progress}%</strong>
                        <span>
                          {STAGE_LABELS[latest.stage] ?? latest.stage}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="generation-card-body">
                    <div className="generation-title">
                      <h3>{label(role)}</h3>
                      <span
                        className={`job-status ${latest?.status ?? 'empty'}`}
                      >
                        {latest?.status === 'succeeded'
                          ? '完成'
                          : latest?.status === 'failed'
                            ? '失败'
                            : latest
                              ? (STAGE_LABELS[latest.stage] ?? latest.status)
                              : '未生成'}
                      </span>
                    </div>
                    {latest?.status === 'failed' && (
                      <p className="job-error">
                        {latest.errorMessageSafe ?? '任务失败，额度已退回。'}
                      </p>
                    )}
                    {result ? (
                      <div className="image-card-footer">
                        {indicators(
                          result,
                          role !== 'main' && role !== 'gallery_1',
                        )}
                        <DownloadDialog
                          projectId={projectId}
                          asset={result}
                          label="下载"
                          variant="ghost"
                        />
                      </div>
                    ) : (
                      <div className="generation-card-actions">
                        <Button
                          variant="outline"
                          disabled={pending || !ready || creditBalance < 3}
                          onClick={() =>
                            create(
                              role,
                              latest?.status === 'failed'
                                ? latest.id
                                : undefined,
                            )
                          }
                        >
                          {latest?.status === 'failed'
                            ? '重试 · 3 额度'
                            : '单张生成 · 3 额度'}
                        </Button>
                      </div>
                    )}
                    {result && latest?.status === 'failed' && (
                      <Button
                        variant="outline"
                        disabled={pending || !ready || creditBalance < 3}
                        onClick={() => create(role, latest.id)}
                      >
                        重试失败任务 · 3 额度
                      </Button>
                    )}
                  </div>
                </article>
              );
            })}
        </div>
      )}
      <ImageDetailsDialog
        tab={detailTab}
        onTabChange={setDetailTab}
        asset={preview}
        images={filter === 'history' ? history : visibleAssets}
        projectId={projectId}
        active={active}
        creditBalance={creditBalance}
        onSelect={setPreview}
        onClose={() => setPreview(null)}
        onRefresh={onRefresh}
      />
    </section>
  );
}
