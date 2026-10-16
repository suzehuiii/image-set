'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { api } from './lib/api';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      await api(`/auth/${mode}`, {
        method: 'POST',
        body: JSON.stringify({
          email: data.get('email'),
          password: data.get('password'),
          ...(mode === 'register'
            ? { displayName: data.get('displayName') }
            : {}),
        }),
      });
      router.push('/');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '操作失败');
    } finally {
      setPending(false);
    }
  }
  const registering = mode === 'register';
  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={submit}>
        <Link href="/" className="brand">
          商品套图 AI
        </Link>
        <p className="eyebrow">
          {registering ? 'CREATE ACCOUNT' : 'WELCOME BACK'}
        </p>
        <h1>{registering ? '创建账号' : '登录'}</h1>
        {registering && (
          <label>
            称呼
            <input
              name="displayName"
              required
              maxLength={80}
              autoComplete="name"
            />
          </label>
        )}
        <label>
          邮箱
          <input name="email" required type="email" autoComplete="email" />
        </label>
        <label>
          密码
          <input
            name="password"
            required
            type="password"
            minLength={registering ? 10 : 1}
            autoComplete={registering ? 'new-password' : 'current-password'}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="primary" disabled={pending}>
          {pending ? '请稍候…' : registering ? '注册并开始' : '登录'}
        </button>
        <p className="switch">
          {registering ? '已有账号？' : '还没有账号？'}{' '}
          <Link href={registering ? '/login' : '/register'}>
            {registering ? '登录' : '免费注册'}
          </Link>
        </p>
      </form>
    </main>
  );
}
