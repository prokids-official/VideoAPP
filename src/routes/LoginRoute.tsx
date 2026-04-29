import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useAuth } from '../stores/use-auth';

type AuthTab = 'login' | 'signup';

export function LoginRoute() {
  const { signup, login, resendVerification } = useAuth();
  const [tab, setTab] = useState<AuthTab>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);

    if (tab === 'login') {
      const r = await login({ email, password });
      if (!r.ok) {
        if (r.code === 'EMAIL_NOT_CONFIRMED') {
          setNotice('邮箱还没有验证。请去邮箱点击验证链接，或重新发送验证邮件。');
        } else {
          setError(r.message ?? '登录失败');
        }
      }
      setSubmitting(false);
      return;
    }

    const r = await signup({ email, password, display_name: displayName });
    if (r.ok && r.pendingEmail) {
      setPendingEmail(r.pendingEmail);
    } else {
      setError(r.message ?? '注册失败');
    }
    setSubmitting(false);
  }

  async function resend(emailToSend = pendingEmail ?? email) {
    if (!emailToSend) {
      return;
    }

    setResending(true);
    setError(null);
    const r = await resendVerification({ email: emailToSend });
    setResending(false);

    if (r.ok) {
      setNotice('验证邮件已重新发送。');
    } else {
      setError(r.message ?? '重新发送失败');
    }
  }

  function switchTab(next: AuthTab) {
    setTab(next);
    setError(null);
    setNotice(null);
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-5 py-12 bg-bg text-text"
      style={{
        backgroundImage:
          'radial-gradient(ellipse at 30% 0%, rgba(155,124,255,0.06), transparent 60%), radial-gradient(ellipse at 80% 100%, rgba(232,121,249,0.04), transparent 55%)',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-[480px] bg-surface border border-border rounded-xl pt-12 px-10 pb-8"
      >
        <BrandHeader />

        {pendingEmail ? (
          <VerificationPending
            email={pendingEmail}
            resending={resending}
            notice={notice}
            error={error}
            onResend={() => void resend(pendingEmail)}
            onBack={() => {
              setPendingEmail(null);
              setTab('login');
              setNotice(null);
              setError(null);
            }}
          />
        ) : (
          <>
            <div className="flex bg-surface-2 border border-border rounded-[10px] p-1 mb-7">
              {(['login', 'signup'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => switchTab(t)}
                  className={`flex-1 py-2.5 text-base font-medium rounded transition ${
                    tab === t ? 'bg-surface-3 text-text' : 'text-text-2 hover:text-text'
                  }`}
                >
                  {t === 'login' ? '登录' : '注册'}
                </button>
              ))}
            </div>

            <form onSubmit={onSubmit}>
              <Input
                label="邮箱"
                type="email"
                mono
                required
                placeholder="name@beva.com"
                hint="@beva.com 内部邮箱"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Input
                label="密码"
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {tab === 'signup' && (
                <Input
                  label="中文姓名"
                  required
                  placeholder="如：乐美林"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              )}
              {notice && (
                <div className="font-mono text-xs text-accent mt-1 mb-3">
                  {notice}{' '}
                  <button
                    type="button"
                    className="border-b border-accent/35 hover:text-accent-hi"
                    onClick={() => void resend(email)}
                    disabled={resending}
                  >
                    {resending ? '发送中...' : '重发验证邮件'}
                  </button>
                </div>
              )}
              {error && <div className="font-mono text-xs text-bad mt-1 mb-3">{error}</div>}
              <Button type="submit" variant="gradient" size="lg" className="w-full mt-3" disabled={submitting}>
                {submitting ? (tab === 'login' ? '登录中...' : '注册中...') : tab === 'login' ? '登录' : '注册'}
              </Button>
            </form>

            {tab === 'login' && (
              <div className="text-center text-sm text-text-3 mt-4">
                还没有账号？{' '}
                <button
                  type="button"
                  onClick={() => switchTab('signup')}
                  className="text-text-2 border-b border-border hover:text-text"
                >
                  注册
                </button>
              </div>
            )}
          </>
        )}

        <div className="text-center font-mono text-2xs text-text-4 mt-7">v0.1.0 · build 2026.04.27</div>
      </motion.div>
    </div>
  );
}

function BrandHeader() {
  return (
    <div className="text-center mb-10">
      <div className="text-[28px] font-bold tracking-tight bg-gradient-brand bg-clip-text text-transparent inline-block">
        FableGlitch&nbsp;Studio
      </div>
      <div className="font-mono text-xs text-text-3 mt-2.5">菲博幻境工作室 · 内部资产管理</div>
    </div>
  );
}

function VerificationPending({
  email,
  resending,
  notice,
  error,
  onResend,
  onBack,
}: {
  email: string;
  resending: boolean;
  notice: string | null;
  error: string | null;
  onResend: () => void;
  onBack: () => void;
}) {
  return (
    <div className="text-center">
      <div className="text-[52px] leading-none mb-6">📧</div>
      <h1 className="text-xl font-bold tracking-tight mb-3">验证邮件已发送</h1>
      <p className="text-sm text-text-3 leading-6 mb-7">
        我们已把验证链接发送到
        <span className="block font-mono text-text-2 mt-1">{email}</span>
      </p>
      {notice && <div className="font-mono text-xs text-accent mb-3">{notice}</div>}
      {error && <div className="font-mono text-xs text-bad mb-3">{error}</div>}
      <div className="grid grid-cols-2 gap-3">
        <Button type="button" variant="secondary" size="lg" onClick={onBack}>
          返回登录
        </Button>
        <Button type="button" variant="gradient" size="lg" onClick={onResend} disabled={resending}>
          {resending ? '发送中...' : '重发邮件'}
        </Button>
      </div>
    </div>
  );
}
