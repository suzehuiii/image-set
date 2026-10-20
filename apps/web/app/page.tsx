'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, type Project, type User } from './lib/api';
import { StudioShell } from '@/components/studio-shell';
import { Button } from '@/components/ui/button';
import {
  ArrowUpRight,
  FolderOpen,
  Images,
  Plus,
  Search,
  Sparkles,
} from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<User>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
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
  if (loading)
    return (
      <main className="centered" aria-live="polite" aria-busy="true">
        正在载入工作区…
      </main>
    );
  return (
    <StudioShell user={user} projects={projects}>
      <main className="dashboard">
        <header className="dashboard-header">
          <span>
            <span className="breadcrumb">工作空间 /</span> 全部项目
          </span>
          <span className="workspace-label">
            <span className="live-dot" />
            个人工作空间
          </span>
        </header>
        <section className="dashboard-intro">
          <div>
            <p className="eyebrow">YOUR CREATIVE WORKSPACE</p>
            <h1>每件商品，都值得好好展示。</h1>
            <p>从一张商品图开始，让 AI 帮你完成整套电商视觉。</p>
          </div>
          <Button asChild>
            <Link href="/projects/new">
              <Plus />
              新建项目
            </Link>
          </Button>
        </section>
        <section className="dashboard-guide">
          <span className="guide-icon">
            <Sparkles size={24} />
          </span>
          <div>
            <strong>从商品素材，到完整套图</strong>
            <p>上传实拍图 → 确认商品简报 → 策划图片方案 → 生成与下载</p>
          </div>
          <Link href="/projects/new">
            开始创作 <ArrowUpRight size={16} />
          </Link>
        </section>
        <section className="section-head project-list-heading">
          <div>
            <h2>
              我的项目 <span className="count-badge">{projects.length}</span>
            </h2>
            <p>继续创作，或开启一个新的商品故事。</p>
          </div>
          <label className="project-search">
            <Search size={16} />
            <span className="visually-hidden">搜索项目</span>
            <input
              placeholder="搜索项目名称…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
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
            {projects
              .filter((project) =>
                project.name.toLowerCase().includes(query.toLowerCase()),
              )
              .map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="project-card"
                >
                  <div className="project-thumb">
                    <span className="project-folder">
                      <FolderOpen size={40} strokeWidth={1.2} />
                    </span>
                    <span className="project-platform">
                      {project.targetPlatform
                        .replaceAll('_', ' ')
                        .toUpperCase()}
                    </span>
                    <span className="project-asset-count">
                      <Images size={14} />
                      {project.assetCount
                        ? `${project.assetCount} 份素材`
                        : '等待上传素材'}
                    </span>
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
        {projects.length > 0 &&
          !projects.some((p) =>
            p.name.toLowerCase().includes(query.toLowerCase()),
          ) && (
            <div className="empty">
              <Search size={28} />
              <h2>没有找到相关项目</h2>
              <p>试试其他关键词。</p>
            </div>
          )}
      </main>
    </StudioShell>
  );
}
