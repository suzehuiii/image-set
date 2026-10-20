'use client';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { api, type Project, type User } from '../../lib/api';
import { StudioShell } from '@/components/studio-shell';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

export default function NewProjectPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [user, setUser] = useState<User>();
  useEffect(() => {
    api<{ user: User }>('/auth/me')
      .then((result) => setUser(result.user))
      .catch(() => router.replace('/login'));
  }, [router]);
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
    <StudioShell user={user}>
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
              <Input
                name="name"
                required
                maxLength={120}
                placeholder="例如：不锈钢保温杯"
              />
            </label>
            <label>
              目标平台
              <Select name="targetPlatform">
                <option value="amazon_us">Amazon US</option>
                <option value="amazon_jp">Amazon Japan</option>
                <option value="amazon_de">Amazon Germany</option>
                <option value="shopify">Shopify</option>
                <option value="tiktok_shop">TikTok Shop</option>
              </Select>
            </label>
          </div>
          <label>
            商品品类
            <Input
              name="productCategory"
              maxLength={100}
              placeholder="例如：Drinkware"
            />
          </label>
          <label>
            规格与材质
            <Textarea name="specifications" rows={3} />
          </label>
          <label>
            真实卖点
            <Textarea name="sellingPoints" rows={3} />
          </label>
          <div className="field-grid">
            <label>
              目标人群
              <Input name="audience" />
            </label>
            <label>
              额外要求
              <Input name="requirements" />
            </label>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? '创建中…' : '创建并上传素材'}
            <ArrowRight />
          </Button>
        </form>
      </main>
    </StudioShell>
  );
}
