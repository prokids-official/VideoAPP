import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useAuth } from '../stores/use-auth';

type AuthTab = 'login' | 'signup';
type EmailMode = 'prefix' | 'full';

// Two patterns:
//   bevaPrefixPattern: validates the LOCAL part typed in prefix-mode (no '@', no whitespace).
//   genericEmailPattern: lightweight client-side check in full-mode. Real domain
//     whitelist enforcement happens server-side (EMAIL_DOMAIN_NOT_ALLOWED).
const bevaPrefixPattern = /^[a-zA-Z0-9._+-]+$/;
const genericEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Hardcoded admin contact for "联系管理员开通" popover. Make this server-driven
// (e.g. GET /api/admin/contact) when there's more than one admin to surface.
// TODO(p1): swap to API-driven list of role=admin users.
const ADMIN_CONTACT = {
  display_name: '乐美林',
  email: 'lemeilin@beva.com',
} as const;

function validatePassword(password: string): string | null {
  if (password.length < 8) return '密码至少 8 位。';
  if (!/[A-Za-z]/.test(password)) return '密码需要包含至少 1 个字母。';
  if (!/[0-9]/.test(password)) return '密码需要包含至少 1 个数字。';
  return null;
}

export function LoginRoute() {
  const { signup, login, resendVerification, resetPassword } = useAuth();
  const [tab, setTab] = useState<AuthTab>('login');
  // emailMode determines what `email` state holds:
  //   'prefix' → just the local part, '@beva.com' is appended at submit
  //   'full'   → the entire email address (for whitelisted external domains)
  const [emailMode, setEmailMode] = useState<EmailMode>('prefix');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [contactOpen, setContactOpen] = useState(false);

  function composeEmail(): string {
    return emailMode === 'prefix' ? `${email.trim()}@beva.com` : email.trim();
  }

  function switchEmailMode(next: EmailMode, preserve?: string): void {
    setEmailMode(next);
    if (preserve !== undefined) {
      setEmail(preserve);
    } else {
      setEmail('');
    }
    setError(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      // Client-side shape check. Domain whitelist (beva.com OR admin-allowed)
      // is enforced server-side, returning EMAIL_DOMAIN_NOT_ALLOWED.
      if (emailMode === 'prefix') {
        if (!bevaPrefixPattern.test(email.trim())) {
          setError('邮箱前缀格式不对（仅允许字母、数字、._+-）。');
          return;
        }
      } else {
        if (!genericEmailPattern.test(email.trim())) {
          setError('邮箱格式不对，请填写完整地址，如 name@somedomain.com');
          return;
        }
      }
      const normalizedEmail = composeEmail().toLowerCase();

      if (tab === 'signup') {
        const passwordError = validatePassword(password);
        if (passwordError) {
          setError(passwordError);
          return;
        }
        if (password !== confirmPassword) {
          setError('两次输入的密码不一致。');
          return;
        }
        if (!displayName.trim()) {
          setError('请填写中文姓名。');
          return;
        }

        const result = await signup({
          email: normalizedEmail,
          password,
          display_name: displayName.trim(),
        });

        if (result.ok) {
          if (result.pendingEmail) {
            setPendingEmail(result.pendingEmail);
          }
          setPassword('');
          setConfirmPassword('');
          return;
        }

        if (result.code === 'EMAIL_DOMAIN_NOT_ALLOWED') {
          setError('该邮箱域名暂未开通注册。请联系管理员开通。');
          return;
        }
        setError(
          result.message === 'Email already registered'
            ? '这个邮箱已经注册过。请直接登录，或使用找回密码。'
            : result.message ?? '注册失败，请稍后再试。',
        );
        return;
      }

      const result = await login({ email: normalizedEmail, password });
      if (!result.ok) {
        if (result.code === 'EMAIL_NOT_CONFIRMED') {
          setNotice('邮箱还没有验证。请去邮箱点击验证链接，或重新发送验证邮件。');
        } else {
          setError(result.message ?? '登录失败，请检查邮箱和密码。');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '请求失败，请稍后再试。');
    } finally {
      setSubmitting(false);
    }
  }

  async function resend(emailToSend?: string) {
    // pendingEmail is always a fully-qualified address; for the inline resend
    // button we compose from the current input fields based on emailMode.
    const candidate = emailToSend ?? pendingEmail ?? composeEmail();
    const normalizedEmail = candidate.trim().toLowerCase();
    if (!genericEmailPattern.test(normalizedEmail)) {
      setError('请先填写有效的邮箱地址。');
      return;
    }

    setResending(true);
    setError(null);
    setNotice(null);

    try {
      const result = await resendVerification({ email: normalizedEmail });
      if (result.ok) {
        setNotice('验证邮件已重新发送，请检查收件箱。');
      } else {
        setError(result.message ?? '重新发送失败，请稍后再试。');
      }
    } finally {
      setResending(false);
    }
  }

  async function sendResetPassword() {
    const normalizedEmail = composeEmail().toLowerCase();
    if (!genericEmailPattern.test(normalizedEmail)) {
      setError('请先填写有效的邮箱地址。');
      return;
    }

    setResetting(true);
    setError(null);
    setNotice(null);

    try {
      const result = await resetPassword({ email: normalizedEmail });
      if (result.ok) {
        setNotice('如果这个邮箱已注册，我们会发送一封密码重置邮件。');
      } else {
        setError(result.message ?? '发送重置邮件失败，请稍后再试。');
      }
    } finally {
      setResetting(false);
    }
  }

  function switchTab(next: AuthTab) {
    setTab(next);
    setError(null);
    setNotice(null);
    setConfirmPassword('');
  }

  return (
    <div
      className="h-full flex items-center justify-center px-5 py-12 bg-bg text-text"
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
              {(['login', 'signup'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => switchTab(item)}
                  className={`flex-1 py-2.5 text-base font-medium rounded transition ${
                    tab === item ? 'bg-surface-3 text-text' : 'text-text-2 hover:text-text'
                  }`}
                >
                  {item === 'login' ? '登录' : '注册'}
                </button>
              ))}
            </div>

            <form onSubmit={onSubmit}>
              <EmailField
                mode={emailMode}
                value={email}
                onChange={setEmail}
                onSwitchMode={switchEmailMode}
              />
              <PasswordField
                label="密码"
                value={password}
                visible={showPassword}
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                onToggleVisible={() => setShowPassword((value) => !value)}
                onChange={setPassword}
              />
              {tab === 'signup' && (
                <>
                  <PasswordField
                    label="确认密码"
                    value={confirmPassword}
                    visible={showConfirmPassword}
                    autoComplete="new-password"
                    onToggleVisible={() => setShowConfirmPassword((value) => !value)}
                    onChange={setConfirmPassword}
                  />
                  <Input
                    label="中文姓名"
                    required
                    placeholder="如：乐美林"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                  />
                </>
              )}

              {notice && (
                <div className="font-mono text-xs text-accent mt-1 mb-3 leading-5">
                  {notice}{' '}
                  {tab === 'login' && (
                    <button
                      type="button"
                      className="border-b border-accent/35 hover:text-accent-hi"
                      onClick={() => void resend()}
                      disabled={resending}
                    >
                      {resending ? '发送中...' : '重发验证邮件'}
                    </button>
                  )}
                </div>
              )}
              {error && <div className="font-mono text-xs text-bad mt-1 mb-3 leading-5">{error}</div>}

              <Button type="submit" variant="gradient" size="lg" className="w-full mt-3" disabled={submitting}>
                {submitting ? (tab === 'login' ? '登录中...' : '注册中...') : tab === 'login' ? '登录' : '注册'}
              </Button>
            </form>

            {tab === 'login' ? (
              <div className="flex items-center justify-between text-sm text-text-3 mt-4">
                <button
                  type="button"
                  onClick={() => switchTab('signup')}
                  className="text-text-2 border-b border-border hover:text-text"
                >
                  创建账号
                </button>
                <button
                  type="button"
                  onClick={() => void sendResetPassword()}
                  className="text-text-2 border-b border-border hover:text-text disabled:opacity-50"
                  disabled={resetting}
                >
                  {resetting ? '发送中...' : '找回密码'}
                </button>
              </div>
            ) : (
              <div className="text-center text-sm text-text-3 mt-4">
                已经注册过？{' '}
                <button
                  type="button"
                  onClick={() => switchTab('login')}
                  className="text-text-2 border-b border-border hover:text-text"
                >
                  直接登录
                </button>
              </div>
            )}
            <div className="text-center text-xs text-text-3 mt-3">
              邮箱域名未开通？{' '}
              <button
                type="button"
                onClick={() => setContactOpen(true)}
                className="text-text-2 border-b border-border hover:text-text"
              >
                联系管理员开通
              </button>
            </div>
          </>
        )}

        <div className="text-center font-mono text-2xs text-text-4 mt-7">v0.1.0 · build 2026.04.29</div>
      </motion.div>

      {contactOpen && <ContactAdminDialog onClose={() => setContactOpen(false)} />}
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

function PasswordField({
  label,
  value,
  visible,
  autoComplete,
  onToggleVisible,
  onChange,
}: {
  label: string;
  value: string;
  visible: boolean;
  autoComplete: string;
  onToggleVisible: () => void;
  onChange: (value: string) => void;
}) {
  return (
    <div className="mb-4">
      <label className="block text-sm text-text-2 font-medium mb-2" htmlFor={label}>
        {label}
      </label>
      <div className="relative">
        <input
          id={label}
          type={visible ? 'text' : 'password'}
          required
          autoComplete={autoComplete}
          placeholder="至少 8 位，含字母和数字"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full h-11 pl-3.5 pr-16 rounded bg-surface-2 border border-border text-text outline-none transition placeholder:text-text-4 focus:border-accent/35 focus:bg-surface-3 font-sans text-base"
        />
        <button
          type="button"
          onClick={onToggleVisible}
          className="absolute right-2 top-1/2 -translate-y-1/2 h-7 px-2 rounded text-xs text-text-2 hover:text-text hover:bg-surface-3"
          aria-label={visible ? `隐藏${label}` : `显示${label}`}
        >
          {visible ? '隐藏' : '显示'}
        </button>
      </div>
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
      <div className="font-mono text-xs text-accent mb-4">EMAIL VERIFICATION</div>
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

/**
 * Segmented email input. In 'prefix' mode shows `[ prefix ] @beva.com` so users
 * never have to type the company suffix; in 'full' mode shows a normal email
 * input for whitelisted external domains.
 *
 * If a user types '@' in prefix mode we auto-flip to full mode with what they
 * typed preserved — so accidental full-email typing doesn't get truncated.
 */
function EmailField({
  mode,
  value,
  onChange,
  onSwitchMode,
}: {
  mode: EmailMode;
  value: string;
  onChange: (next: string) => void;
  onSwitchMode: (mode: EmailMode, preserve?: string) => void;
}) {
  function handlePrefixChange(text: string) {
    if (text.includes('@')) {
      onSwitchMode('full', text);
      return;
    }
    onChange(text);
  }

  if (mode === 'prefix') {
    return (
      <div className="mb-4">
        <label className="block text-sm text-text-2 font-medium mb-2" htmlFor="email-prefix">
          邮箱
        </label>
        <div className="flex items-stretch h-11 rounded bg-surface-2 border border-border focus-within:border-accent/35 focus-within:bg-surface-3 transition overflow-hidden">
          <input
            id="email-prefix"
            type="text"
            required
            autoComplete="username"
            spellCheck={false}
            value={value}
            placeholder="lemeilin"
            onChange={(event) => handlePrefixChange(event.target.value)}
            className="flex-1 bg-transparent outline-none px-3.5 font-mono text-sm text-text placeholder:text-text-4 min-w-0"
          />
          <span className="flex items-center pr-3.5 pl-1 font-mono text-sm text-text-3 select-none whitespace-nowrap">
            @beva.com
          </span>
        </div>
        <div className="font-mono text-xs text-text-3 mt-2 flex items-center justify-between gap-4">
          <span className="truncate">公司邮箱前缀，无需输入 @beva.com</span>
          <button
            type="button"
            onClick={() => onSwitchMode('full')}
            className="text-text-2 border-b border-border hover:text-text whitespace-nowrap"
          >
            使用其他域名邮箱 →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <label className="block text-sm text-text-2 font-medium mb-2" htmlFor="email-full">
        邮箱
      </label>
      <input
        id="email-full"
        type="email"
        required
        autoComplete="email"
        spellCheck={false}
        value={value}
        placeholder="name@somedomain.com"
        onChange={(event) => onChange(event.target.value)}
        className="w-full h-11 px-3.5 rounded bg-surface-2 border border-border focus:border-accent/35 focus:bg-surface-3 outline-none transition font-mono text-sm text-text placeholder:text-text-4"
      />
      <div className="font-mono text-xs text-text-3 mt-2 flex items-center justify-between gap-4">
        <span className="truncate">完整邮箱地址（外部协作者使用）</span>
        <button
          type="button"
          onClick={() => onSwitchMode('prefix', '')}
          className="text-text-2 border-b border-border hover:text-text whitespace-nowrap"
        >
          ← 切回 @beva.com
        </button>
      </div>
    </div>
  );
}

/**
 * Modal-ish overlay shown when the user clicks "联系管理员开通". Displays the
 * hardcoded admin contact and a one-click mailto: link.
 */
function ContactAdminDialog({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/75 backdrop-blur-sm px-4"
      onClick={onClose}
      role="presentation"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.14 }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-admin-title"
        className="w-full max-w-[420px] bg-surface border border-border rounded-xl p-7"
      >
        <div className="font-mono text-xs text-accent mb-3">CONTACT ADMIN</div>
        <h2 id="contact-admin-title" className="text-lg font-bold tracking-tight mb-3">
          请联系管理员开通
        </h2>
        <p className="text-sm text-text-2 leading-6 mb-5">
          注册需要管理员先开通你的邮箱域名。如果你的邮箱不是 @beva.com 也不在已开通的列表里，请联系内部管理员申请：
        </p>
        <a
          href={`mailto:${ADMIN_CONTACT.email}?subject=${encodeURIComponent('FableGlitch Studio · 申请开通邮箱域名')}`}
          className="block bg-surface-2 border border-border rounded-lg px-4 py-3 mb-5 hover:border-accent/35 transition"
        >
          <div className="text-sm text-text font-medium">{ADMIN_CONTACT.display_name}</div>
          <div className="font-mono text-xs text-text-3 mt-1">{ADMIN_CONTACT.email}</div>
        </a>
        <p className="font-mono text-xs text-text-3 mb-5 leading-5">
          也可以在公司内部 IM 中找 @{ADMIN_CONTACT.display_name} 申请开通。
        </p>
        <div className="flex justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            知道了
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
