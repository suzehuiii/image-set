'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, Gift, TicketCheck } from 'lucide-react';
import { api, type User } from '../../lib/api';
import { StudioShell } from '@/components/studio-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function RedeemPage() {
  const [user, setUser] = useState<User>();
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    api<{ user: User }>('/auth/me')
      .then((result) => setUser(result.user))
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : '载入失败'),
      );
  }, []);
  async function redeem(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');
    setMessage('');
    try {
      const result = await api<{ balance: number; credited: number }>(
        '/credits/redeem',
        { method: 'POST', body: JSON.stringify({ code }) },
      );
      setUser((current) =>
        current ? { ...current, creditBalance: result.balance } : current,
      );
      setMessage(`兑换成功，已增加 ${result.credited} 额度。`);
      setCode('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '兑换失败');
    } finally {
      setPending(false);
    }
  }
  return (
    <StudioShell user={user}>
      <main className="redeem-page">
        <Link href="/" className="studio-back">
          <ArrowLeft size={15} /> 返回项目
        </Link>
        <section className="redeem-card">
          <span className="redeem-icon">
            <Gift />
          </span>
          <p className="eyebrow">CREDIT REDEMPTION</p>
          <h1>额度兑换</h1>
          <p>
            输入兑换码，额度将立即发放到当前账号。测试兑换码每个账号限用一次。
          </p>
          <form onSubmit={redeem}>
            <label htmlFor="redemption-code">兑换码</label>
            <Input
              id="redemption-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="请输入兑换码"
              autoComplete="off"
              required
            />
            <Button disabled={pending || !code.trim()}>
              <TicketCheck /> {pending ? '正在兑换…' : '立即兑换'}
            </Button>
          </form>
          {message && (
            <p className="success" role="status">
              {message}
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <small>当前测试码：IMAGESET-TEST-500</small>
        </section>
      </main>
    </StudioShell>
  );
}
