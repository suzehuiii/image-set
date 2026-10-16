'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { type ChangeEvent, useCallback, useEffect, useState } from 'react';
import { api, type Asset, type Project } from '../../lib/api';

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Project>();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const load = useCallback(async () => {
    const [details, list] = await Promise.all([
      api<Project>(`/projects/${id}`),
      api<{ items: Asset[] }>(`/projects/${id}/assets`),
    ]);
    setProject(details);
    setAssets(list.items);
  }, [id]);
  useEffect(() => {
    load().catch((caught: unknown) =>
      setError(caught instanceof Error ? caught.message : '载入失败'),
    );
  }, [load]);
  async function upload(
    event: ChangeEvent<HTMLInputElement>,
    assetType: 'product' | 'reference',
  ) {
    const files = Array.from(event.target.files ?? []);
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
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '上传失败');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }
  async function remove(assetId: string) {
    if (!confirm('删除这张素材？')) return;
    await api(`/assets/${assetId}`, { method: 'DELETE' });
    setAssets((current) => current.filter((asset) => asset.id !== assetId));
  }
  async function removeProject() {
    if (!confirm('删除项目？此操作会停止后续生成。')) return;
    await api(`/projects/${id}`, { method: 'DELETE' });
    router.push('/');
  }
  if (!project && !error)
    return <main className="centered">正在载入项目…</main>;
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
        <button className="danger" onClick={removeProject}>
          删除项目
        </button>
      </header>
      {error && <p className="error banner">{error}</p>}
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
          title="风格参考图"
          hint="可选，最多 4 张"
          type="reference"
          assets={assets}
          uploading={uploading}
          onUpload={upload}
          onRemove={remove}
        />
      </section>
      <section className="next-step">
        <p className="eyebrow">NEXT STEP</p>
        <h2>商品分析将在 M2 开放</h2>
        <p>素材已安全保存；刷新或重新登录后仍可恢复。</p>
      </section>
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
  type: 'product' | 'reference';
  assets: Asset[];
  uploading: boolean;
  onUpload: (
    event: ChangeEvent<HTMLInputElement>,
    type: 'product' | 'reference',
  ) => void;
  onRemove: (id: string) => void;
}) {
  const filtered = assets.filter((asset) => asset.assetType === type);
  return (
    <section className="upload-card">
      <div className="section-head">
        <div>
          <h2>{title}</h2>
          <p>{hint}</p>
        </div>
        <label className="primary link-button">
          {uploading ? '上传中…' : '选择图片'}
          <input
            hidden
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={uploading}
            onChange={(event) => onUpload(event, type)}
          />
        </label>
      </div>
      <div className="asset-grid">
        {filtered.map((asset) => (
          <article className="asset" key={asset.id}>
            <img
              src={`/api/assets/${asset.id}/content`}
              alt={asset.originalName}
            />
            <div>
              <strong>{asset.originalName}</strong>
              <small>
                {asset.width} × {asset.height} ·{' '}
                {(asset.fileSize / 1024 / 1024).toFixed(1)} MB
              </small>
              <button
                className="text-danger"
                onClick={() => onRemove(asset.id)}
              >
                删除
              </button>
            </div>
          </article>
        ))}
        {filtered.length === 0 && <p className="placeholder">尚未上传</p>}
      </div>
    </section>
  );
}
