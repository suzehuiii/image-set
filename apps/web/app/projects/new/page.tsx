'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { api, type Project } from '../../lib/api';

export default function NewProjectPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      const project = await api<Project>('/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: data.get('name'),
          targetPlatform: data.get('targetPlatform'),
          productCategory: data.get('productCategory'),
          productBrief: {
            specifications: data.get('specifications'),
            sellingPoints: data.get('sellingPoints'),
            audience: data.get('audience'),
            requirements: data.get('requirements'),
          },
        }),
      });
      router.push(`/projects/${project.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '创建失败');
      setPending(false);
    }
  }
  return (
    <main className="form-page">
      <Link href="/" className="back">
        ← 返回项目
      </Link>
      <form className="form-card" onSubmit={submit}>
        <p className="eyebrow">NEW PROJECT</p>
        <h1>创建商品项目</h1>
        <div className="field-grid">
          <label>
            项目名称
            <input
              name="name"
              required
              maxLength={120}
              placeholder="例如：不锈钢保温杯"
            />
          </label>
          <label>
            目标平台
            <select name="targetPlatform">
              <option value="amazon_us">Amazon US</option>
              <option value="amazon_jp">Amazon Japan</option>
              <option value="amazon_de">Amazon Germany</option>
              <option value="shopify">Shopify</option>
              <option value="tiktok_shop">TikTok Shop</option>
            </select>
          </label>
        </div>
        <label>
          商品品类
          <input
            name="productCategory"
            maxLength={100}
            placeholder="例如：Drinkware"
          />
        </label>
        <label>
          规格与材质
          <textarea name="specifications" rows={3} />
        </label>
        <label>
          真实卖点
          <textarea name="sellingPoints" rows={3} />
        </label>
        <div className="field-grid">
          <label>
            目标人群
            <input name="audience" />
          </label>
          <label>
            额外要求
            <input name="requirements" />
          </label>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="primary" disabled={pending}>
          {pending ? '创建中…' : '创建并上传素材'}
        </button>
      </form>
    </main>
  );
}
