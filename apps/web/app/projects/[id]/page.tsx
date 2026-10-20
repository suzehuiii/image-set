'use client';
import { Input } from '@/components/ui/input';
import {
  isBrief,
  REFERENCE_ASSET_LIMIT,
  type ProjectAnalysis,
} from '@image-set/shared';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  type ChangeEvent,
  type DragEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  api,
  type Asset,
  type Job,
  type Project,
  type User,
} from '../../lib/api';
import { StudioShell } from '@/components/studio-shell';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  FileText,
  ImagePlus,
  Images,
  LayoutTemplate,
  Sparkles,
  Trash2,
  UploadCloud,
} from 'lucide-react';
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
  const [step, setStep] = useState('materials');
  const [mobilePanel, setMobilePanel] = useState('config');
  const [planContainer, setPlanContainer] = useState<HTMLDivElement | null>(
    null,
  );
  const [selectedAsset, setSelectedAsset] = useState<string>();
  const openedProject = useRef('');
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
    if (openedProject.current !== id) {
      openedProject.current = id;
      const saved = details.analysisResult;
      const savedCampaign = saved && isBrief(saved) ? saved.campaign : null;
      const hasImageJobs = jobList.items.some(
        (job) =>
          job.jobType === 'image' &&
          (savedCampaign
            ? job.campaignId === savedCampaign.id
            : !job.campaignId),
      );
      setStep(
        hasImageJobs
          ? 'results'
          : savedCampaign
            ? 'plan'
            : saved
              ? 'brief'
              : 'materials',
      );
      setMobilePanel(hasImageJobs ? 'preview' : 'config');
    }
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
    try {
      await api(`/assets/${assetId}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败');
    }
  }
  async function removeProject() {
    if (!confirm('删除项目？此操作会停止后续生成。')) return;
    try {
      await api(`/projects/${id}`, { method: 'DELETE' });
      router.push('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败');
    }
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
      setStep('brief');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '商品分析失败');
      await load().catch(() => undefined);
    } finally {
      setAnalysisPending(false);
    }
  }
  async function saveAnalysis(next: ProjectAnalysis | undefined = analysis) {
    if (!next) return false;
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
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '保存失败');
      return false;
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
  const brief = analysis && isBrief(analysis) ? analysis : undefined;
  const campaign = brief?.campaign;
  const dirty =
    JSON.stringify(analysis) !== JSON.stringify(project?.analysisResult);
  const busy =
    analysisPending ||
    jobs.some((j) => j.status === 'running' || j.status === 'queued');
  const sources = assets.filter((a) => a.assetType === 'product');
  const preview = sources.find((a) => a.id === selectedAsset) ?? sources[0];
  const steps = [
    {
      id: 'materials',
      label: '商品素材',
      icon: ImagePlus,
      done: sources.length > 0,
    },
    {
      id: 'brief',
      label: '商品简报',
      icon: FileText,
      done: Boolean(brief?.confirmed) && !dirty,
    },
    {
      id: 'plan',
      label: '图片方案',
      icon: LayoutTemplate,
      done: Boolean(campaign?.confirmed) && !dirty,
    },
    { id: 'results', label: '生成结果', icon: Images, done: false },
  ];
  return (
    <StudioShell user={user}>
      <main className="project-studio">
        <header className="project-header">
          <div>
            <Link href="/" className="studio-back">
              <ArrowLeft size={15} /> 全部项目
            </Link>
            <div className="project-title-row">
              <h1>{project?.name ?? '项目'}</h1>
              <span className="platform-pill">
                {project?.targetPlatform.replaceAll('_', ' ').toUpperCase()}
              </span>
            </div>
          </div>
          <div className="project-header-actions">
            <span className="save-state">
              <CheckCircle2 size={14} />
              {dirty ? '有未保存的修改' : '已与服务器同步'}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="删除项目"
              onClick={removeProject}
            >
              <Trash2 size={16} />
            </Button>
          </div>
        </header>
        <Tabs value={step} onValueChange={setStep} className="project-tabs">
          <TabsList className="workflow-steps" aria-label="创作步骤">
            {steps.map((item, index) => (
              <TabsTrigger
                key={item.id}
                value={item.id}
                disabled={item.id !== 'materials' && !analysis}
                className="workflow-step"
              >
                <span
                  className={
                    item.done ? 'step-number completed' : 'step-number'
                  }
                >
                  {item.done ? <Check size={14} /> : index + 1}
                </span>
                <span>{item.label}</span>
                <item.icon size={15} className="step-icon" />
              </TabsTrigger>
            ))}
          </TabsList>
          {error && (
            <p className="error studio-banner" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="success studio-banner" role="status">
              {notice}
            </p>
          )}
          <div className="mobile-panel-switch" aria-label="工作区视图">
            <Button
              size="sm"
              variant={mobilePanel === 'config' ? 'default' : 'ghost'}
              onClick={() => setMobilePanel('config')}
            >
              配置与操作
            </Button>
            <Button
              size="sm"
              variant={mobilePanel === 'preview' ? 'default' : 'ghost'}
              onClick={() => setMobilePanel('preview')}
            >
              图片工作区
            </Button>
          </div>
          <div className={'studio-workbench mobile-' + mobilePanel}>
            <aside className="configuration-panel" aria-label="商品配置">
              <TabsContent value="materials">
                <div className="panel-heading">
                  <span className="eyebrow">01 / MATERIALS</span>
                  <h2>从真实商品开始</h2>
                  <p>清晰的实拍图，让 AI 更懂你的商品。</p>
                </div>
                <div className="material-groups">
                  <UploadGroup
                    title="商品实拍图"
                    hint="1–10 张 · JPG / PNG / WebP · 单张 ≤15MB"
                    type="product"
                    assets={assets}
                    uploading={uploading}
                    onUpload={upload}
                    onRemove={remove}
                  />
                  <UploadGroup
                    title="风格参考图"
                    hint={`可选，最多 ${REFERENCE_ASSET_LIMIT} 张，支持 AVIF；仅参考风格与构图`}
                    type="reference"
                    assets={assets}
                    uploading={uploading}
                    onUpload={upload}
                    onRemove={remove}
                  />
                  <UploadGroup
                    title="产品说明书"
                    hint="可选 · PDF / DOCX 文字提取；旧 DOC 请转换"
                    type="manual"
                    assets={assets}
                    uploading={uploading}
                    onUpload={upload}
                    onRemove={remove}
                  />
                </div>
                <div className="panel-footer">
                  <p>分析成功消耗 1 额度，失败自动退款</p>
                  <Button
                    disabled={
                      busy ||
                      uploading ||
                      !sources.length ||
                      (user?.creditBalance ?? 0) < 1
                    }
                    onClick={analyzeProduct}
                  >
                    <Sparkles />
                    {analysisPending
                      ? '正在分析商品…'
                      : analysis
                        ? '重新分析商品 · 1 额度'
                        : '分析商品 · 1 额度'}
                    <ArrowRight />
                  </Button>
                  {analysis && (
                    <Button variant="ghost" onClick={() => setStep('brief')}>
                      继续编辑已有简报 <ArrowRight />
                    </Button>
                  )}
                </div>
              </TabsContent>
              {analysis && (
                <div hidden={step !== 'brief' && step !== 'plan'}>
                  {isBrief(analysis) ? (
                    <BriefEditor
                      key={id}
                      value={analysis}
                      view={step === 'plan' ? 'plan' : 'brief'}
                      planContainer={planContainer}
                      disabled={busy}
                      dirty={dirty}
                      projectId={id}
                      platform={project?.targetPlatform ?? 'amazon_us'}
                      balance={user?.creditBalance ?? 0}
                      onChange={setAnalysis}
                      onSave={saveAnalysis}
                      onReanalyze={analyzeProduct}
                      onPlanned={load}
                      onConfirmed={() => setStep('plan')}
                    />
                  ) : (
                    <AnalysisEditor
                      value={analysis}
                      disabled={analysisPending}
                      onChange={setAnalysis}
                      onSave={() => void saveAnalysis()}
                      onReanalyze={analyzeProduct}
                    />
                  )}
                </div>
              )}
              <TabsContent value="results">
                <div className="panel-heading">
                  <span className="eyebrow">04 / YOUR IMAGE SET</span>
                  <h2>让方案成为作品</h2>
                  <p>确认方案后开始生成，每张图片独立执行与结算。</p>
                </div>
                <div className="result-summary">
                  <span>
                    <Images size={18} />
                    图片数量
                    <strong>
                      {campaign?.images.length ?? (brief ? 0 : 9)} 张
                    </strong>
                  </span>
                  <span>
                    <Sparkles size={18} />
                    单图生成<strong>3 额度</strong>
                  </span>
                  <span>
                    <CheckCircle2 size={18} />
                    方案状态
                    <strong>
                      {campaign
                        ? campaign.confirmed && !dirty
                          ? '已确认'
                          : '待确认'
                        : brief
                          ? '待策划'
                          : '历史方案'}
                    </strong>
                  </span>
                </div>
                <div className="studio-note">
                  <strong>每一张，都可以再打磨</strong>
                  <p>
                    支持单张重新生成。需要复核的图片会保留，并显示具体原因。
                  </p>
                  <p>已绘制的文字修改需要重新生图，每张 3 额度。</p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setStep(brief ? 'plan' : 'brief')}
                >
                  <ArrowLeft />
                  返回调整方案
                </Button>
              </TabsContent>
            </aside>
            <section className="visual-workspace" aria-label="图片工作区">
              <div
                hidden={step !== 'materials' && step !== 'brief'}
                className="source-workspace"
              >
                <div className="visual-heading">
                  <div>
                    <h2>商品原图</h2>
                    <p>
                      {step === 'brief'
                        ? '对照实拍，确认每一个商品事实'
                        : '好素材，是好作品的第一步'}
                    </p>
                  </div>
                  <span className="subtle-badge">{sources.length} / 10 张</span>
                </div>
                {preview ? (
                  <>
                    <div className="source-preview">
                      <img
                        src={'/api/assets/' + preview.id + '/content'}
                        alt={preview.originalName}
                      />
                    </div>
                    <div className="source-filmstrip">
                      {sources.map((asset) => (
                        <Button
                          key={asset.id}
                          className={preview.id === asset.id ? 'selected' : ''}
                          onClick={() => setSelectedAsset(asset.id)}
                          aria-label={'预览 ' + asset.originalName}
                          aria-pressed={preview.id === asset.id}
                        >
                          <img
                            src={'/api/assets/' + asset.id + '/content'}
                            alt={asset.originalName}
                          />
                        </Button>
                      ))}
                    </div>
                    <p className="preview-caption">
                      {preview.originalName} · {preview.width} ×{' '}
                      {preview.height}
                    </p>
                  </>
                ) : (
                  <div className="studio-empty">
                    <div className="empty-composition">
                      <span />
                      <span />
                      <span>
                        <Images size={42} strokeWidth={1} />
                      </span>
                    </div>
                    <span className="eyebrow">
                      A LITTLE INPUT. A WHOLE NEW LOOK.
                    </span>
                    <h2>你的下一套商品视觉，从这里开始</h2>
                    <p>
                      在左侧上传真实商品图，AI 将协助你提炼卖点、
                      <br />
                      策划视觉，并生成完整的展示图与详情图。
                    </p>
                    <div className="empty-flow">
                      <span>01 上传素材</span>
                      <ArrowRight size={14} />
                      <span>02 确认方案</span>
                      <ArrowRight size={14} />
                      <span>03 生成套图</span>
                    </div>
                  </div>
                )}
              </div>
              <div hidden={step !== 'plan'} className="plan-workspace">
                <div className="visual-heading">
                  <div>
                    <h2>逐图视觉方案</h2>
                    <p>检查每张图的目标、构图和文案，再确认生成。</p>
                  </div>
                  {campaign && (
                    <span className="subtle-badge">
                      {campaign.images.length} 张 · {campaign.targetLocale}
                    </span>
                  )}
                </div>
                {!campaign && (
                  <div className="studio-empty">
                    <LayoutTemplate size={48} strokeWidth={1} />
                    <h2>先定方向，再开始创作</h2>
                    <p>在左侧选择图片包与比例，生成整套视觉方案。</p>
                  </div>
                )}
                <div ref={setPlanContainer} />
                {campaign && (
                  <div className="plan-next">
                    <span>
                      {campaign.confirmed && !dirty
                        ? '方案已确认，可以开始生成'
                        : '请先在左侧确认并保存图片方案'}
                    </span>
                    <Button
                      disabled={!campaign.confirmed || dirty}
                      onClick={() => setStep('results')}
                    >
                      进入生成 <ArrowRight />
                    </Button>
                  </div>
                )}
              </div>
              {analysis && (
                <div hidden={step !== 'results'}>
                  <GenerationPanel
                    projectId={id}
                    creditBalance={user?.creditBalance ?? 0}
                    analysis={analysis}
                    dirty={dirty}
                    assets={assets}
                    jobs={jobs}
                    onRefresh={load}
                  />
                </div>
              )}
            </section>
          </div>
        </Tabs>
      </main>
    </StudioShell>
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
  const limit =
    type === 'product' ? 10 : type === 'reference' ? REFERENCE_ASSET_LIMIT : 1;
  const atLimit = filtered.length >= limit;
  const disabled = uploading || atLimit;
  const accept = isManual
    ? '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    : type === 'reference'
      ? 'image/jpeg,image/png,image/webp,image/avif,.avif'
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
          {isManual ? <FileText size={20} /> : <UploadCloud size={24} />}
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
        <Input
          className="visually-hidden"
          type="file"
          accept={accept}
          multiple={!isManual}
          disabled={disabled}
          onChange={(event) => void selectFiles(event)}
        />
      </label>
      <ScrollArea
        className={`asset-scroll-list${filtered.length > 4 ? ' constrained' : ''}`}
        aria-label={`${title}列表，共 ${filtered.length} 项`}
      >
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
                  <Button
                    type="button"
                    className="text-danger"
                    aria-label={`删除 ${asset.originalName}`}
                    onClick={() => onRemove(asset.id)}
                  >
                    删除
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </ScrollArea>
    </section>
  );
}
