'use client';
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Code2,
  LoaderCircle,
  MessageSquareText,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { api, type Asset } from '@/app/lib/api';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from './ui/dialog';
import { ScrollArea } from './ui/scroll-area';
import { Textarea } from './ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { DownloadDialog } from './download-dialog';

type ImageDetails = {
  prompt: string;
  effectivePrompt: string;
  reconstructed: boolean;
  copy: string;
  title: string;
};
export function ImageDetailsDialog({
  asset,
  images,
  projectId,
  active,
  creditBalance,
  onSelect,
  onClose,
  onRefresh,
  tab,
  onTabChange,
}: {
  asset: Asset | null;
  images: Asset[];
  projectId: string;
  active: boolean;
  creditBalance: number;
  tab: string;
  onTabChange: (tab: string) => void;
  onSelect: (asset: Asset) => void;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [loaded, setLoaded] = useState<{ id: string; details: ImageDetails }>();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!asset) return;
    const controller = new AbortController();
    api<ImageDetails>(`/assets/${asset.id}/generation`, {
      signal: controller.signal,
    })
      .then((details) => {
        setLoaded({ id: asset.id, details });
        setError('');
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : '读取 Prompt 失败');
      });
    return () => controller.abort();
  }, [asset]);
  const details = loaded?.id === asset?.id ? loaded?.details : undefined;
  const prompt = asset ? (drafts[asset.id] ?? details?.prompt ?? '') : '';
  async function regenerate() {
    if (!asset || !details) return;
    setPending(true);
    setError('');
    setNotice('');
    try {
      await api(`/assets/${asset.id}/regenerations`, {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ prompt }),
      });
      setNotice(
        '重新生成任务已创建，消耗 3 额度。原图将保留，新图完成后可在工作区或历史原图中查看。',
      );
      await onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建任务失败');
    } finally {
      setPending(false);
    }
  }
  function navigate(direction: number) {
    if (!asset) return;
    const index = images.findIndex((image) => image.id === asset.id);
    const next = images[(index + direction + images.length) % images.length];
    if (next) {
      setError('');
      setNotice('');
      onSelect(next);
    }
  }
  return (
    <Dialog
      open={Boolean(asset)}
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent className="image-detail-dialog">
        <header className="image-detail-header">
          <div>
            <DialogTitle>
              {details?.title ?? asset?.imageRole ?? '图片详情'}
            </DialogTitle>
            <DialogDescription>
              {asset?.width} × {asset?.height} · 原图预览与生成详情
            </DialogDescription>
          </div>
          <div className="image-navigation">
            <Button
              variant="ghost"
              size="icon"
              aria-label="上一张图片"
              disabled={pending || images.length < 2}
              onClick={() => navigate(-1)}
            >
              <ArrowLeft />
            </Button>
            <span>
              {asset
                ? Math.max(1, images.findIndex((a) => a.id === asset.id) + 1)
                : 0}{' '}
              / {images.length}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="下一张图片"
              disabled={pending || images.length < 2}
              onClick={() => navigate(1)}
            >
              <ArrowRight />
            </Button>
          </div>
        </header>
        {asset && (
          <div className="image-detail-layout">
            <div className="image-detail-canvas">
              <img
                src={`/api/assets/${asset.id}/content`}
                alt={asset.originalName}
              />
            </div>
            <aside className="image-detail-sidebar">
              <Tabs
                value={tab}
                onValueChange={onTabChange}
                className="image-detail-tabs"
              >
                <TabsList aria-label="图片详情分类">
                  <TabsTrigger value="prompt">
                    <Code2 size={16} />
                    Prompt
                  </TabsTrigger>
                  <TabsTrigger value="review">
                    <ShieldCheck size={16} />
                    审核
                  </TabsTrigger>
                  <TabsTrigger value="copy">
                    <MessageSquareText size={16} />
                    文案
                  </TabsTrigger>
                </TabsList>
                <ScrollArea className="image-detail-scroll">
                  <TabsContent value="prompt">
                    <div className="detail-section">
                      <h3>图片生成 Prompt</h3>
                      <p className="detail-hint">
                        可以手动调整构图、场景和视觉表达。商品真实性、目标语言与首图规则会继续作为固定约束。
                      </p>
                      {details ? (
                        <>
                          <Textarea
                            aria-label="图片生成 Prompt"
                            className="prompt-editor"
                            value={prompt}
                            maxLength={30000}
                            onChange={(e) =>
                              setDrafts((current) => ({
                                ...current,
                                [asset.id]: e.target.value,
                              }))
                            }
                            disabled={pending}
                          />
                          <div className="prompt-meta">
                            <span>{prompt.length} / 30000</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={pending}
                              onClick={() =>
                                setDrafts((current) => ({
                                  ...current,
                                  [asset.id]: details.prompt,
                                }))
                              }
                            >
                              <RotateCcw size={14} />
                              恢复此图 Prompt
                            </Button>
                          </div>
                          <details className="effective-prompt">
                            <summary>
                              {details.reconstructed
                                ? '查看历史快照重建的完整 Prompt'
                                : '查看实际发送给模型的完整 Prompt'}
                            </summary>
                            <pre>{details.effectivePrompt}</pre>
                          </details>
                        </>
                      ) : (
                        <p role="status">
                          {error
                            ? '暂时无法读取此图 Prompt。'
                            : '正在读取此图生成记录…'}
                        </p>
                      )}
                    </div>
                  </TabsContent>
                  <TabsContent value="review">
                    <div className="detail-section">
                      <h3>一致性审核</h3>
                      {asset.qaResult ? (
                        <div
                          className={
                            'detail-review ' +
                            (asset.qaResult.status === 'passed'
                              ? 'passed'
                              : 'review')
                          }
                        >
                          <strong>
                            {asset.qaResult.status === 'passed' ? (
                              <ShieldCheck />
                            ) : (
                              <TriangleAlert />
                            )}
                            {asset.qaResult.status === 'passed'
                              ? '一致性检查通过'
                              : '需要人工复核'}
                          </strong>
                          <p>{asset.qaResult.summary}</p>
                          {asset.qaResult.differences.map((difference, i) => (
                            <div className="review-difference" key={i}>
                              <strong>{difference.aspect}</strong>
                              <p>{difference.description}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="detail-hint">这张图片没有审核记录。</p>
                      )}
                    </div>
                  </TabsContent>
                  <TabsContent value="copy">
                    <div className="detail-section">
                      <h3>图片方案文案</h3>
                      <p className="detail-copy">
                        {details?.copy ||
                          '此图未配置营销文案（白底首图不添加营销文字）。'}
                      </p>
                      <p className="detail-hint">
                        这里展示生成任务保存的方案文案。手动 Prompt
                        中的修改以实际生成结果为准。
                      </p>
                    </div>
                  </TabsContent>
                </ScrollArea>
              </Tabs>
              <footer className="image-detail-footer">
                {error && (
                  <p className="error" role="alert">
                    {error}
                  </p>
                )}
                {notice && (
                  <p className="success" role="status">
                    {notice}
                  </p>
                )}
                <Button
                  disabled={
                    pending ||
                    !details ||
                    !prompt.trim() ||
                    prompt.length > 30000 ||
                    creditBalance < 3
                  }
                  onClick={regenerate}
                >
                  {pending ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <RotateCcw />
                  )}
                  {pending ? '正在创建任务…' : '按此 Prompt 重新生成 · 3 额度'}
                </Button>
                <DownloadDialog projectId={projectId} asset={asset} />
                <small>
                  {active
                    ? '已有任务在队列中，新任务会按并发上限继续处理。'
                    : '原图保留；生成失败退回对应额度。'}
                </small>
              </footer>
            </aside>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
