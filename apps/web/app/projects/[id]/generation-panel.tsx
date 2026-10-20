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
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ArrowLeft, ArrowRight, Expand, Images } from 'lucide-react';

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
  const [exporting, setExporting] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
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
  const active = imageJobs.some(
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

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      void onRefresh().catch((caught: unknown) => {
        setError(
          caught instanceof Error ? caught.message : '刷新进度失败，请稍后重试',
        );
      });
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [active, onRefresh]);

  async function create(role?: ImageRole) {
    setPending(true);
    setError('');
    setNotice('');
    try {
      await api(`/projects/${projectId}/generations`, {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify(role ? { role } : {}),
      });
      await onRefresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '创建任务失败');
    } finally {
      setPending(false);
    }
  }

  async function retry(jobId: string) {
    setPending(true);
    setError('');
    setNotice('');
    try {
      await api(`/jobs/${jobId}/retry`, {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      });
      await onRefresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '重试失败');
    } finally {
      setPending(false);
    }
  }

  async function exportImages(format: 'png' | 'jpg', role?: ImageRole) {
    const exportKey = `${role ?? 'set'}-${format}`;
    setExporting(exportKey);
    setError('');
    setNotice('');
    try {
      const result = await api<{ asset: Asset; bundle: boolean }>(
        `/projects/${projectId}/exports`,
        {
          method: 'POST',
          body: JSON.stringify({ format, ...(role ? { role } : {}) }),
        },
      );
      setNotice(
        role
          ? `${label(role)}已导出，未扣额度。`
          : `${format.toUpperCase()} 整套 ZIP 已生成，未扣额度。`,
      );
      await onRefresh();
      window.location.assign(`/api/assets/${result.asset.id}/download`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '导出失败');
    } finally {
      setExporting('');
    }
  }

  return (
    <section className="generation-section" aria-busy={active}>
      <div className="section-head generation-heading">
        <div>
          <p className="eyebrow">CAMPAIGN IMAGE SET</p>
          <h2>你的商品套图</h2>
          <p>
            每张图独立执行与结算；单张失败自动退款。直接成图的文案修改需重新生成。
          </p>
        </div>
        <div className="generation-actions">
          <span>当前余额 {creditBalance}</span>
          <button
            type="button"
            className="primary"
            disabled={
              pending ||
              active ||
              !ready ||
              roles.length === 0 ||
              creditBalance < roles.length * 3
            }
            onClick={() => create()}
          >
            {active
              ? '套图生成中…'
              : `生成整套 ${roles.length} 张 · ${roles.length * 3} 额度`}
          </button>
          <div className="zip-actions">
            <button
              type="button"
              className="ghost"
              disabled={!completeSet || Boolean(exporting)}
              onClick={() => exportImages('png')}
            >
              {exporting === 'set-png' ? '打包中…' : 'PNG 整套 ZIP'}
            </button>
            <button
              type="button"
              className="ghost"
              disabled={!completeSet || Boolean(exporting)}
              onClick={() => exportImages('jpg')}
            >
              {exporting === 'set-jpg' ? '打包中…' : 'JPG 整套 ZIP'}
            </button>
          </div>
        </div>
      </div>
      {error && (
        <p className="error banner" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success banner" role="status">
          {notice}
        </p>
      )}
      {!ready && (
        <p role="status">请先保存并确认商品简报和图片方案，再生成图片。</p>
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
          {assets
            .filter((a) => a.assetType === 'generated')
            .map((asset) => (
              <article key={asset.id}>
                <button
                  className="history-preview"
                  onClick={() => setPreview(asset)}
                  aria-label={'预览历史图片 ' + asset.originalName}
                >
                  <img
                    src={'/api/assets/' + asset.id + '/content'}
                    alt={asset.originalName}
                  />
                </button>
                <p>
                  {asset.imageRole} · {asset.width} × {asset.height}
                </p>
                <a href={'/api/assets/' + asset.id + '/download'}>
                  下载历史原图 ↗
                </a>
              </article>
            ))}
          {!assets.some((a) => a.assetType === 'generated') && (
            <p className="studio-note">
              还没有生成历史。成功生成的图片会保留在这里。
            </p>
          )}
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
              const roleJobs = imageJobs.filter(
                (job) => job.imageRole === role,
              );
              const latest = roleJobs[0];
              const result =
                visibleAssets.find(
                  (asset) =>
                    asset.assetType === 'generated' &&
                    asset.imageRole === role &&
                    asset.id === latest?.resultAssetId,
                ) ??
                visibleAssets.find(
                  (asset) =>
                    asset.assetType === 'generated' && asset.imageRole === role,
                );
              const copy = isBrief(analysis)
                ? (campaign?.images.find((x) => x.role === role)?.copy ?? '')
                : (analysis.imagePlan.find((item) => item.role === role)
                    ?.copyEn ?? '');
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
                      <img
                        src={`/api/assets/${result.id}/content`}
                        alt={label(role)}
                      />
                    ) : (
                      <span className="image-placeholder">
                        <Images size={28} strokeWidth={1} />
                        <span>{label(role)}</span>
                        <small>等待生成</small>
                      </span>
                    )}
                    {result && (
                      <button
                        className="expand-image"
                        aria-label={`放大预览 ${label(role)}`}
                        onClick={() => setPreview(result)}
                      >
                        <Expand size={16} />
                      </button>
                    )}
                    {latest &&
                      (latest.status === 'queued' ||
                        latest.status === 'running') && (
                        <div
                          className="generation-progress"
                          role="progressbar"
                          aria-label={`${label(role)}生成进度`}
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
                    {result?.qaResult && (
                      <div
                        className={`qa-result ${result.qaResult.status === 'passed' ? 'passed' : 'review'}`}
                      >
                        <strong>
                          {result.qaResult.status === 'passed'
                            ? '一致性检查通过'
                            : '需要人工复核'}
                        </strong>
                        <p>{result.qaResult.summary}</p>
                        {result.qaResult.differences
                          .slice(0, 2)
                          .map((difference) => (
                            <small
                              key={`${difference.aspect}-${difference.description}`}
                            >
                              {difference.description}
                            </small>
                          ))}
                      </div>
                    )}
                    {latest?.status === 'failed' && (
                      <p className="job-error">
                        {latest.errorMessageSafe ?? '任务失败，额度已退回。'}
                      </p>
                    )}
                    {result && role !== 'main' && (
                      <p className="export-copy">
                        <strong>图片文案</strong>
                        {copy || '无额外营销文案。'}
                      </p>
                    )}
                    <div className="generation-card-actions">
                      {latest?.status === 'failed' ? (
                        <button
                          type="button"
                          className="ghost"
                          disabled={
                            pending || active || !ready || creditBalance < 3
                          }
                          onClick={() => retry(latest.id)}
                        >
                          重试 · 3 额度
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="ghost"
                          disabled={
                            pending || active || !ready || creditBalance < 3
                          }
                          onClick={() => create(role)}
                        >
                          {result ? '重新生成 · 3 额度' : '单张生成 · 3 额度'}
                        </button>
                      )}
                    </div>
                    {result && (
                      <div className="download-actions">
                        <button
                          type="button"
                          className="ghost"
                          disabled={Boolean(exporting)}
                          onClick={() => exportImages('png', role)}
                        >
                          {exporting === `${role}-png` ? '导出中…' : '下载 PNG'}
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          disabled={Boolean(exporting)}
                          onClick={() => exportImages('jpg', role)}
                        >
                          {exporting === `${role}-jpg` ? '导出中…' : '下载 JPG'}
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
        </div>
      )}
      <Dialog
        open={Boolean(preview)}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
      >
        <DialogContent>
          <DialogTitle className="preview-dialog-title">
            {preview?.imageRole ? label(preview.imageRole) : '图片预览'}
          </DialogTitle>
          <DialogDescription className="preview-dialog-description">
            {preview?.width} × {preview?.height} · 检查成品细节后下载
          </DialogDescription>
          {preview && (
            <>
              <img
                className="lightbox-image"
                src={'/api/assets/' + preview.id + '/content'}
                alt={preview.originalName}
              />
              {preview.qaResult && (
                <div
                  className={
                    preview.qaResult.status === 'passed'
                      ? 'success'
                      : 'qa-result review'
                  }
                >
                  <strong>
                    {preview.qaResult.status === 'passed'
                      ? '一致性检查通过'
                      : '需要人工复核'}
                  </strong>
                  <p>{preview.qaResult.summary}</p>
                  {preview.qaResult.differences.map((difference, i) => (
                    <p key={i}>{difference.description}</p>
                  ))}
                </div>
              )}
              <div className="lightbox-actions">
                <Button
                  variant="outline"
                  disabled={
                    visibleAssets.length < 2 ||
                    !visibleAssets.some((a) => a.id === preview.id)
                  }
                  onClick={() => {
                    const index = visibleAssets.findIndex(
                      (a) => a.id === preview.id,
                    );
                    setPreview(
                      visibleAssets[
                        (index - 1 + visibleAssets.length) %
                          visibleAssets.length
                      ] ?? preview,
                    );
                  }}
                >
                  <ArrowLeft />
                  上一张
                </Button>
                <Button
                  variant="outline"
                  disabled={
                    visibleAssets.length < 2 ||
                    !visibleAssets.some((a) => a.id === preview.id)
                  }
                  onClick={() => {
                    const index = visibleAssets.findIndex(
                      (a) => a.id === preview.id,
                    );
                    setPreview(
                      visibleAssets[(index + 1) % visibleAssets.length] ??
                        preview,
                    );
                  }}
                >
                  下一张
                  <ArrowRight />
                </Button>
                <Button asChild>
                  <a href={'/api/assets/' + preview.id + '/download'}>
                    下载原图
                  </a>
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
