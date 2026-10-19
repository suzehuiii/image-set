'use client';
import { isBrief, type ProjectAnalysis } from '@image-set/shared';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  type ChangeEvent,
  type DragEvent,
  useCallback,
  useEffect,
  useState,
} from 'react';
import {
  api,
  type Asset,
  type Job,
  type Project,
  type User,
} from '../../lib/api';
import { BriefEditor } from './brief-editor';
import { AnalysisEditor } from './analysis-editor';
import { GenerationPanel } from './generation-panel';

type UploadAssetType = 'product' | 'reference' | 'manual';

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Project>();
  const [user, setUser] = useState<User>();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [analysis, setAnalysis] = useState<ProjectAnalysis>();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [analysisPending, setAnalysisPending] = useState(false);
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    const [details, list, me, jobList] = await Promise.all([
      api<Project>(`/projects/${id}`),
      api<{ items: Asset[] }>(`/projects/${id}/assets`),
      api<{ user: User }>('/auth/me'),
      api<{ items: Job[] }>(`/projects/${id}/jobs`),
    ]);
    setProject(details);
    setAssets(list.items);
    setUser(me.user);
    setAnalysis(details.analysisResult ?? undefined);
    setJobs(jobList.items);
  }, [id]);
  useEffect(() => {
    load().catch((caught: unknown) =>
      setError(caught instanceof Error ? caught.message : '载入失败'),
    );
  }, [load]);
  async function upload(files: File[], assetType: UploadAssetType) {
    if (!files.length) return;
    setUploading(true);
    setError('');
    try {
      for (const file of files) {
        const form = new FormData();
        form.append('file', file);
        await api(`/projects/${id}/assets?assetType=${assetType}`, {
          method: 'POST',
          body: form,
        });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '上传失败');
    } finally {
      await load().catch(() => undefined);
      setUploading(false);
    }
  }
  async function remove(assetId: string) {
    if (!confirm('删除这个素材？')) return;
    await api(`/assets/${assetId}`, { method: 'DELETE' });
    await load();
  }
  async function removeProject() {
    if (!confirm('删除项目？此操作会停止后续生成。')) return;
    await api(`/projects/${id}`, { method: 'DELETE' });
    router.push('/');
  }
  async function analyzeProduct() {
    if (!assets.some((asset) => asset.assetType === 'product')) {
      setError('请先上传至少一张商品实拍图');
      return;
    }
    setAnalysisPending(true);
    setError('');
    setNotice('');
    try {
      const result = await api<{
        analysis: ProjectAnalysis;
        creditBalance: number;
      }>(`/projects/${id}/analyze`, {
        method: 'POST',
        headers: {
          'Idempotency-Key': crypto.randomUUID(),
          'Accept-Language': navigator.language,
        },
      });
      setAnalysis(result.analysis);
      setProject((current) =>
        current
          ? { ...current, analysisResult: result.analysis, status: 'ready' }
          : current,
      );
      setUser((current) =>
        current ? { ...current, creditBalance: result.creditBalance } : current,
      );
      setNotice('简报已提取，请检查并确认后进行图片策划。');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '商品分析失败');
      await load().catch(() => undefined);
    } finally {
      setAnalysisPending(false);
    }
  }
  async function saveAnalysis(next: ProjectAnalysis | undefined = analysis) {
    if (!next) return;
    setAnalysisPending(true);
    setError('');
    setNotice('');
    try {
      const result = await api<{ analysis: ProjectAnalysis }>(
        `/projects/${id}/content`,
        {
          method: 'PATCH',
          body: JSON.stringify({ analysis: next }),
        },
      );
      setAnalysis(result.analysis);
      setProject((current) =>
        current ? { ...current, analysisResult: result.analysis } : current,
      );
      setNotice('修改已保存；本次未扣额度。');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '保存失败');
    } finally {
      setAnalysisPending(false);
    }
  }
  if (!project && !error)
    return (
      <main className="centered" aria-live="polite" aria-busy="true">
        正在载入项目…
      </main>
    );
  return (
    <main className="workspace">
      <header className="topbar">
        <div>
          <Link href="/" className="back">
            ← 全部项目
          </Link>
          <h1>{project?.name ?? '项目'}</h1>
          <p>
            {project?.productCategory || '未填写品类'} ·{' '}
            {project?.targetPlatform.replace('_', ' ')}
          </p>
        </div>
        <button type="button" className="danger" onClick={removeProject}>
          删除项目
        </button>
      </header>
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
      <section className="upload-columns">
        <UploadGroup
          title="商品实拍图"
          hint="1–10 张，JPG/PNG/WebP，单张 ≤15MB"
          type="product"
          assets={assets}
          uploading={uploading}
          onUpload={upload}
          onRemove={remove}
        />
        <UploadGroup
          title="产品／竞品参考图"
          hint="可选，最多 4 张；仅参考风格与构图，不提取竞品事实"
          type="reference"
          assets={assets}
          uploading={uploading}
          onUpload={upload}
          onRemove={remove}
        />
        <UploadGroup
          title="产品说明书"
          hint="可选，≤15MB；提取 PDF/DOCX 文字，旧 DOC 请转换"
          type="manual"
          assets={assets}
          uploading={uploading}
          onUpload={upload}
          onRemove={remove}
        />
      </section>
      {assets.some((a) => a.assetType === 'generated') && (
        <details className="analysis-card">
          <summary>已生成图片历史（含旧方案）</summary>
          <div className="asset-grid">
            {assets
              .filter((a) => a.assetType === 'generated')
              .map((a) => (
                <a key={a.id} href={`/api/assets/${a.id}/download`}>
                  <img
                    style={{
                      maxWidth: 140,
                      maxHeight: 140,
                      objectFit: 'contain',
                    }}
                    src={`/api/assets/${a.id}/content`}
                    alt={a.originalName}
                  />
                  <small>
                    {a.imageRole} · {a.width} × {a.height}
                  </small>
                </a>
              ))}
          </div>
        </details>
      )}
      {analysis ? (
        <>
          {isBrief(analysis) ? (
            <BriefEditor
              value={analysis}
              disabled={
                analysisPending ||
                jobs.some(
                  (j) => j.status === 'running' || j.status === 'queued',
                )
              }
              dirty={
                JSON.stringify(analysis) !==
                JSON.stringify(project?.analysisResult)
              }
              projectId={id}
              platform={project?.targetPlatform ?? 'amazon_us'}
              balance={user?.creditBalance ?? 0}
              onChange={setAnalysis}
              onSave={saveAnalysis}
              onReanalyze={analyzeProduct}
              onPlanned={load}
            />
          ) : (
            <AnalysisEditor
              value={analysis}
              disabled={analysisPending}
              onChange={setAnalysis}
              onSave={() => saveAnalysis()}
              onReanalyze={analyzeProduct}
            />
          )}
          <GenerationPanel
            projectId={id}
            creditBalance={user?.creditBalance ?? 0}
            analysis={analysis}
            dirty={
              JSON.stringify(analysis) !==
              JSON.stringify(project?.analysisResult)
            }
            assets={assets}
            jobs={jobs}
            onRefresh={load}
          />
        </>
      ) : (
        <section className="next-step analysis-cta">
          <div>
            <p className="eyebrow">AI PRODUCT ANALYSIS</p>
            <h2>提取商品身份、功能、卖点、人群与场景</h2>
            <p>基于商品图与已填资料分析；成功消耗 1 额度，失败自动退款。</p>
          </div>
          <div className="analysis-cta-actions">
            <span>当前余额 {user?.creditBalance ?? '—'}</span>
            <button
              type="button"
              className="primary"
              disabled={analysisPending}
              onClick={analyzeProduct}
            >
              {analysisPending ? '正在分析图片…' : '开始分析 · 1 额度'}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}

function UploadGroup({
  title,
  hint,
  type,
  assets,
  uploading,
  onUpload,
  onRemove,
}: {
  title: string;
  hint: string;
  type: UploadAssetType;
  assets: Asset[];
  uploading: boolean;
  onUpload: (files: File[], type: UploadAssetType) => Promise<void>;
  onRemove: (id: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const filtered = assets.filter((asset) => asset.assetType === type);
  const isManual = type === 'manual';
  const limit = type === 'product' ? 10 : type === 'reference' ? 4 : 1;
  const atLimit = filtered.length >= limit;
  const disabled = uploading || atLimit;
  const accept = isManual
    ? '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    : 'image/jpeg,image/png,image/webp';

  async function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    await onUpload(Array.from(input.files ?? []), type);
    input.value = '';
  }

  async function dropFiles(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    await onUpload(Array.from(event.dataTransfer.files), type);
  }

  return (
    <section className="upload-card">
      <div className="section-head">
        <div>
          <h2>{title}</h2>
          <p>{hint}</p>
        </div>
      </div>
      <label
        className={`upload-dropzone${dragging ? ' dragging' : ''}${disabled ? ' disabled' : ''}${uploading ? ' uploading' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => void dropFiles(event)}
      >
        <span className="upload-icon" aria-hidden="true">
          {isManual ? 'DOC' : '↑'}
        </span>
        <strong>
          {uploading
            ? '正在上传…'
            : atLimit
              ? isManual
                ? '已上传说明书'
                : `已达到 ${limit} 张上限`
              : isManual
                ? '拖拽说明书到这里'
                : '拖拽图片到这里'}
        </strong>
        <small>
          {atLimit
            ? `如需更换，请先删除已有${isManual ? '文件' : '图片'}`
            : `或点击选择${isManual ? '文件' : '图片'}`}
        </small>
        <input
          className="visually-hidden"
          type="file"
          accept={accept}
          multiple={!isManual}
          disabled={disabled}
          onChange={(event) => void selectFiles(event)}
        />
      </label>
      <div className="asset-grid">
        {filtered.map((asset) => (
          <article className="asset" key={asset.id}>
            {isManual ? (
              <span className="document-preview" aria-hidden="true">
                {asset.originalName.split('.').pop()?.toUpperCase() ?? 'DOC'}
              </span>
            ) : (
              <img
                src={`/api/assets/${asset.id}/content`}
                alt={asset.originalName}
              />
            )}
            <div>
              <strong>{asset.originalName}</strong>
              <small>
                {asset.width && asset.height
                  ? `${asset.width} × ${asset.height} · `
                  : ''}
                {(asset.fileSize / 1024 / 1024).toFixed(1)} MB
              </small>
              <div className="asset-actions">
                {isManual && (
                  <a
                    href={`/api/assets/${asset.id}/content`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    查看
                  </a>
                )}
                <button
                  type="button"
                  className="text-danger"
                  aria-label={`删除 ${asset.originalName}`}
                  onClick={() => onRemove(asset.id)}
                >
                  删除
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
