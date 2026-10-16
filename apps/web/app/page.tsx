'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, type Project, type User } from './lib/api';

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<User>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([
      api<{ user: User }>('/auth/me'),
      api<{ items: Project[] }>('/projects'),
    ])
      .then(([me, list]) => {
        setUser(me.user);
        setProjects(list.items);
      })
      .catch(() => router.replace('/login'))
      .finally(() => setLoading(false));
  }, [router]);
  async function logout() {
    await api('/auth/logout', { method: 'POST', body: '{}' });
    router.push('/login');
  }
  if (loading) return <main className="centered">正在载入工作区…</main>;
  return (
    <main className="workspace">
      <header className="topbar">
        <div>
          <p className="eyebrow">PRODUCT IMAGE STUDIO</p>
          <h1>项目</h1>
        </div>
        <div className="account">
          <span>
            {user?.displayName} · {user?.creditBalance} 额度
          </span>
          <button className="ghost" onClick={logout}>
            退出
          </button>
        </div>
      </header>
      <section className="section-head">
        <div>
          <h2>最近项目</h2>
          <p>上传真实商品图，生成可编辑的双语商品信息与四图规划。</p>
        </div>
        <Link className="primary link-button" href="/projects/new">
          创建项目
        </Link>
      </section>
      {projects.length === 0 ? (
        <section className="empty">
          <span>✦</span>
          <h2>从第一件商品开始</h2>
          <p>可上传 1–10 张商品图和最多 4 张风格参考图。</p>
          <Link className="primary link-button" href="/projects/new">
            新建项目
          </Link>
        </section>
      ) : (
        <section className="project-grid">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="project-card"
            >
              <div className="project-thumb">
                {project.assetCount ? `${project.assetCount} 张素材` : '待上传'}
              </div>
              <h3>{project.name}</h3>
              <p>
                {project.productCategory || '未填写品类'} ·{' '}
                {project.targetPlatform.replace('_', ' ')}
              </p>
              <small>
                更新于 {new Date(project.updatedAt).toLocaleString('zh-CN')}
              </small>
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
