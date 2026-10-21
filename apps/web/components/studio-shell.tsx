'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Aperture,
  ArrowUpRight,
  Coins,
  FolderOpen,
  LayoutGrid,
  LogOut,
  Menu,
  Plus,
  Sparkles,
  X,
} from 'lucide-react';
import { api, type Project, type User } from '@/app/lib/api';
import { Button } from './ui/button';
import { BackToTop } from './back-to-top';

export function StudioShell({
  children,
  user,
  projects: suppliedProjects,
}: {
  children: ReactNode;
  user?: User;
  projects?: Project[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [recent, setRecent] = useState<Project[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (suppliedProjects) return;
    api<{ items: Project[] }>('/projects')
      .then((result) => setRecent(result.items))
      .catch(() => undefined);
  }, [suppliedProjects]);
  useEffect(() => {
    if (!profileOpen) return;
    const close = (event: PointerEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node))
        setProfileOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [profileOpen]);
  const projects = suppliedProjects ?? recent;
  return (
    <div className="studio-shell">
      <Button
        className="mobile-menu"
        aria-label={open ? '关闭导航' : '展开导航'}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </Button>
      {open && (
        <Button
          className="sidebar-scrim"
          aria-label="关闭导航"
          onClick={() => setOpen(false)}
        />
      )}
      <aside className={`studio-sidebar ${open ? 'is-open' : ''}`}>
        <Link className="studio-brand" href="/">
          <span className="brand-mark">
            <Aperture size={23} />
          </span>
          <span>
            商品套图 <b>AI</b>
            <small>PRODUCT IMAGE STUDIO</small>
          </span>
        </Link>
        <Button asChild className="new-project-button">
          <Link href="/projects/new" onClick={() => setOpen(false)}>
            <Plus />
            新建商品项目
          </Link>
        </Button>
        <nav aria-label="项目导航">
          <Link
            className={`nav-item ${pathname === '/' ? 'active' : ''}`}
            href="/"
            onClick={() => setOpen(false)}
          >
            <LayoutGrid size={18} />
            全部项目<span>{projects.length}</span>
          </Link>
          <p className="nav-caption">最近项目</p>
          <div className="recent-projects">
            {projects.slice(0, 12).map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                onClick={() => setOpen(false)}
                aria-current={
                  pathname === `/projects/${project.id}` ? 'page' : undefined
                }
                className={`nav-item ${pathname === `/projects/${project.id}` ? 'active' : ''}`}
              >
                <FolderOpen size={16} />
                <span className="project-nav-name">{project.name}</span>
              </Link>
            ))}
          </div>
          {!projects.length && <p className="nav-empty">新项目会出现在这里</p>}
        </nav>
        <div className="sidebar-bottom">
          <div className="studio-tip">
            <Sparkles size={17} />
            <strong>让好商品，被看见</strong>
            <p>从真实商品图出发，制作属于你的电商视觉。</p>
            <Link href="/projects/new">
              开始创作 <ArrowUpRight size={14} />
            </Link>
          </div>
          {user && (
            <>
              <div className="credit-wallet">
                <Coins size={17} />
                <span>可用额度</span>
                <strong>{user.creditBalance}</strong>
              </div>
              <div className="profile-menu-wrap" ref={profileMenuRef}>
                {profileOpen && (
                  <div className="profile-menu" role="menu">
                    <Link
                      href="/account/redeem"
                      role="menuitem"
                      onClick={() => setProfileOpen(false)}
                    >
                      <Coins size={16} /> 额度兑换
                    </Link>
                    <Button
                      variant="ghost"
                      role="menuitem"
                      onClick={async () => {
                        try {
                          await api('/auth/logout', {
                            method: 'POST',
                            body: '{}',
                          });
                          router.push('/login');
                        } catch (e) {
                          setError(e instanceof Error ? e.message : '退出失败');
                        }
                      }}
                    >
                      <LogOut size={16} /> 退出登录
                    </Button>
                  </div>
                )}
                <Button
                  variant="ghost"
                  className="profile-row"
                  aria-label="账号菜单"
                  aria-expanded={profileOpen}
                  onClick={() => setProfileOpen((value) => !value)}
                >
                  <span className="avatar">
                    {user.displayName.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="profile-name">
                    {user.displayName}
                    <small>个人工作空间</small>
                  </span>
                </Button>
              </div>
            </>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
      </aside>
      <div className="studio-main">{children}</div>
      <BackToTop />
    </div>
  );
}
