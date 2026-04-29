'use client';

import { FormEvent, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

export function ResetPasswordClient({
  supabaseUrl,
  supabaseAnonKey,
}: {
  supabaseUrl: string;
  supabaseAnonKey: string;
}) {
  const supabase = useMemo(
    () => createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } }),
    [supabaseAnonKey, supabaseUrl],
  );
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function restoreRecoverySession(): Promise<boolean> {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = hash.get('access_token');
    const refreshToken = hash.get('refresh_token');

    if (accessToken && refreshToken) {
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      return !sessionError;
    }

    const code = new URLSearchParams(window.location.search).get('code');

    if (code) {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      return !exchangeError;
    }

    return false;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setError('密码至少 8 位，并包含字母和数字。');
      return;
    }

    if (password !== confirm) {
      setError('两次输入的密码不一致。');
      return;
    }

    setSubmitting(true);
    const hasSession = await restoreRecoverySession();

    if (!hasSession) {
      setSubmitting(false);
      setError('重置链接无效或已过期，请回到桌面 App 重新发送邮件。');
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setMessage('密码已更新。请回到桌面 App 使用新密码登录。');
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 14 }}>
      <label style={{ display: 'grid', gap: 8, color: '#a1a1a8', fontSize: 13 }}>
        新密码
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          style={inputStyle}
        />
      </label>
      <label style={{ display: 'grid', gap: 8, color: '#a1a1a8', fontSize: 13 }}>
        确认新密码
        <input
          type="password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          style={inputStyle}
        />
      </label>
      {error && <p style={{ color: '#f87171', margin: 0, fontSize: 13 }}>{error}</p>}
      {message && <p style={{ color: '#4ade80', margin: 0, fontSize: 13 }}>{message}</p>}
      <button type="submit" disabled={submitting} style={buttonStyle}>
        {submitting ? '更新中...' : '更新密码'}
      </button>
    </form>
  );
}

const inputStyle = {
  height: 42,
  borderRadius: 8,
  border: '1px solid #25252c',
  background: '#18181d',
  color: '#f5f5f7',
  padding: '0 12px',
  outline: 'none',
};

const buttonStyle = {
  height: 44,
  borderRadius: 8,
  border: 0,
  background: '#9b7cff',
  color: 'white',
  fontWeight: 700,
  cursor: 'pointer',
};
