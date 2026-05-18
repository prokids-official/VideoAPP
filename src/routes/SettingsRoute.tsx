import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { TopNav } from '../components/chrome/TopNav';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { defaultAiProviderSettings, loadAiProviderSettings, saveAiProviderSettings } from '../lib/ai-provider-settings';
import { api } from '../lib/api';
import { useAuth } from '../stores/use-auth';
import type { AIProviderConfigInput, AIProviderTestResult, UsageMeResponse } from '../../shared/types';

type SettingsTab = 'profile' | 'security' | 'ai' | 'usage' | 'logout';

const tabs: Array<{ id: SettingsTab; label: string }> = [
  { id: 'profile', label: '个人资料' },
  { id: 'security', label: '安全' },
  { id: 'ai', label: 'AI Provider' },
  { id: 'usage', label: '用量' },
  { id: 'logout', label: '退出登录' },
];

export function SettingsRoute({ onBack }: { onBack: () => void }) {
  const { user, resetPassword, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [usage, setUsage] = useState<UsageMeResponse | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [securityMessage, setSecurityMessage] = useState<string | null>(null);
  const [securityBusy, setSecurityBusy] = useState(false);

  useEffect(() => {
    if (activeTab !== 'usage' || usage || usageLoading) {
      return;
    }

    let cancelled = false;

    void (async () => {
      setUsageLoading(true);
      setUsageError(null);
      const result = await api.usageMe();
      if (cancelled) {
        return;
      }

      if (result.ok) {
        setUsage(result.data);
      } else {
        setUsageError(result.message);
      }
      setUsageLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTab, usage, usageLoading]);

  const providers = useMemo(() => Object.entries(usage?.by_provider ?? {}), [usage]);

  if (!user) {
    return null;
  }

  const currentUser = user;

  async function sendPasswordReset() {
    setSecurityBusy(true);
    setSecurityMessage(null);
    const result = await resetPassword({ email: currentUser.email });
    setSecurityMessage(result.ok ? '重置邮件已发送' : result.message ?? '发送失败');
    setSecurityBusy(false);
  }

  return (
    <div className="h-full flex flex-col bg-bg text-text">
      <TopNav onOpenSettings={() => setActiveTab('profile')} />
      <main className="flex-1 overflow-y-auto px-10 py-10">
        <div className="max-w-[980px] mx-auto">
          <div className="flex items-center gap-4 mb-10">
            <Button
              variant="secondary"
              size="sm"
              className="text-[0]"
              aria-label="Back to workspace"
              onClick={onBack}
            >
              <span className="text-sm">返回工作台</span>
            </Button>
            <div>
              <h1 className="text-4xl font-bold tracking-tight">设置</h1>
              <p className="font-mono text-xs text-text-3 mt-2">{currentUser.email}</p>
            </div>
          </div>

          <div className="grid grid-cols-[180px_1fr] gap-8">
            <aside className="space-y-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full h-10 px-3 rounded text-left text-sm transition ${
                    activeTab === tab.id
                      ? 'bg-surface-3 text-text'
                      : 'text-text-3 hover:bg-surface-2 hover:text-text-2'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </aside>

            <section>
              {activeTab === 'profile' && (
                <SettingsPanel title="个人资料">
                  <Field label="显示名" value={currentUser.display_name} />
                  <Field label="邮箱" value={currentUser.email} mono />
                  <Field label="团队" value={currentUser.team ?? '未设置'} />
                  <Field label="权限" value={currentUser.role === 'admin' ? '管理员' : '成员'} />
                </SettingsPanel>
              )}

              {activeTab === 'security' && (
                <SettingsPanel title="安全">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm text-text-2">密码</div>
                      <div className="font-mono text-xs text-text-3 mt-1">通过验证邮件更新密码</div>
                    </div>
                    <Button variant="secondary" onClick={() => void sendPasswordReset()} disabled={securityBusy}>
                      {securityBusy ? '发送中...' : '发送改密邮件'}
                    </Button>
                  </div>
                  {securityMessage && <div className="font-mono text-xs text-text-3 mt-4">{securityMessage}</div>}
                </SettingsPanel>
              )}

              {activeTab === 'ai' && (
                <SettingsPanel title="AI Provider">
                  <AIProviderPanel />
                </SettingsPanel>
              )}

              {activeTab === 'usage' && (
                <SettingsPanel title="用量">
                  {usageLoading ? (
                    <div className="font-mono text-xs text-text-3">loading usage...</div>
                  ) : usageError ? (
                    <div className="font-mono text-xs text-bad">{usageError}</div>
                  ) : usage ? (
                    <UsageSummary usage={usage} providers={providers} />
                  ) : (
                    <div className="font-mono text-xs text-text-3">暂无用量数据</div>
                  )}
                </SettingsPanel>
              )}

              {activeTab === 'logout' && (
                <SettingsPanel title="退出登录">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm text-text-2">当前账号</div>
                      <div className="font-mono text-xs text-text-3 mt-1">{currentUser.email}</div>
                    </div>
                    <Button variant="secondary" onClick={() => void logout()}>
                      退出登录
                    </Button>
                  </div>
                </SettingsPanel>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

function SettingsPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="rounded-lg p-6">
      <h2 className="text-xl font-semibold tracking-tight mb-6">{title}</h2>
      {children}
    </Card>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-4 py-3 border-b border-border last:border-b-0">
      <div className="text-sm text-text-3">{label}</div>
      <div className={`${mono ? 'font-mono text-xs' : 'text-sm'} text-text-2`}>{value}</div>
    </div>
  );
}

function AIProviderPanel() {
  const [settings, setSettings] = useState<AIProviderConfigInput>(defaultAiProviderSettings);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<AIProviderTestResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const loaded = await loadAiProviderSettings();
      if (!cancelled) {
        setSettings(loaded);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setBusy(true);
    setMessage(null);
    await saveAiProviderSettings(settings);
    setMessage('已保存');
    setBusy(false);
  }

  async function testConnection() {
    setTesting(true);
    setMessage(null);
    setTestResult(null);
    const result = await api.aiProviderTest({ provider_config: settings });
    if (result.ok) {
      setTestResult(result.data);
      setMessage('连接成功');
    } else {
      setMessage(formatProviderError(settings, result.message));
    }
    setTesting(false);
  }

  function applyDeepSeekPreset() {
    const currentApiKey = settings.mode === 'custom-openai-compatible' ? settings.api_key ?? '' : '';
    const currentModel = settings.model === 'deepseek-v4-pro' ? 'deepseek-v4-pro' : 'deepseek-v4-flash';
    setSettings({
      mode: 'custom-openai-compatible',
      base_url: 'https://api.deepseek.com/v1',
      api_key: currentApiKey,
      model: currentModel,
    });
    setMessage('已切换到自带 DeepSeek Key 线路，请填入 API Key 后保存并测试。');
    setTestResult(null);
  }

  function applyCodingPlanPreset() {
    const currentApiKey = settings.mode === 'custom-openai-compatible' ? settings.api_key ?? '' : '';
    setSettings({
      mode: 'custom-openai-compatible',
      base_url: 'https://coding.dashscope.aliyuncs.com/v1',
      api_key: currentApiKey,
      model: 'qwen3.6-plus',
    });
    setMessage('已填入 CodingPlan 多模态线路预设。');
    setTestResult(null);
  }

  const isCustom = settings.mode === 'custom-openai-compatible';
  return (
    <div className="space-y-5">
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-text-2">线路</span>
        <select
          value={settings.mode}
          onChange={(event) => {
            const mode = event.target.value as AIProviderConfigInput['mode'];
            setSettings(mode === 'official-deepseek'
              ? { mode, model: 'deepseek-v4-flash' }
              : {
                mode,
                base_url: 'https://api.deepseek.com/v1',
                api_key: '',
                model: 'deepseek-v4-flash',
              });
            setMessage(null);
            setTestResult(null);
          }}
          className="h-10 w-full rounded-md border border-border bg-surface-2 px-3 text-sm text-text outline-none transition focus:border-accent/60"
        >
          <option value="official-deepseek">官方 DeepSeek（服务端 Key）</option>
          <option value="custom-openai-compatible">自带 Key / OpenAI-compatible</option>
        </select>
      </label>

      {isCustom ? (
        <div className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={applyDeepSeekPreset}>
              DeepSeek 预设
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={applyCodingPlanPreset}>
              CodingPlan 预设
            </Button>
          </div>
          <TextInput
            label="Base URL"
            value={settings.base_url ?? ''}
            onChange={(baseUrl) => setSettings({ ...settings, base_url: baseUrl })}
            placeholder="https://api.deepseek.com/v1"
          />
          <TextInput
            label="Model"
            value={settings.model}
            onChange={(model) => setSettings({ ...settings, model })}
            placeholder="deepseek-v4-flash"
          />
          <TextInput
            label="API Key"
            type="password"
            value={settings.api_key ?? ''}
            onChange={(apiKey) => setSettings({ ...settings, api_key: apiKey })}
            placeholder="sk-..."
          />
          <div className="rounded-lg border border-border bg-surface-2 p-3 text-xs leading-5 text-text-3">
            自带 Key 会把 API Key 随本次请求发给当前后端，用于你自己的 DeepSeek、CodingPlan、Kimi
            等 OpenAI-compatible 线路。Key 只保存在本机设置里。
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-text-2">模型</span>
            <select
              value={settings.model}
              onChange={(event) => setSettings({ mode: 'official-deepseek', model: event.target.value })}
              className="h-10 w-full rounded-md border border-border bg-surface-2 px-3 font-mono text-sm text-text outline-none transition focus:border-accent/60"
            >
              <option value="deepseek-v4-flash">deepseek-v4-flash</option>
              <option value="deepseek-v4-pro">deepseek-v4-pro</option>
            </select>
          </label>
          <div className="rounded-lg border border-border bg-surface-2 p-3 text-xs leading-5 text-text-3">
            官方 DeepSeek 使用后端部署环境里的 <span className="font-mono">AI_CHAT_API_KEY</span>。
            如果测试连接提示未配置，说明当前 API 服务还没有接入官方 Key；临时开发或个人使用可以切到自带
            Key。
            <div className="mt-3">
              <Button type="button" variant="secondary" size="sm" onClick={applyDeepSeekPreset}>
                使用我的 DeepSeek Key
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void save()}>
          {busy ? '保存中...' : '保存'}
        </Button>
        <Button type="button" variant="secondary" disabled={testing} onClick={() => void testConnection()}>
          {testing ? '测试中...' : '测试连接'}
        </Button>
      </div>

      {message && <div className="font-mono text-xs text-text-3">{message}</div>}
      {testResult && (
        <div className="rounded-lg border border-border bg-surface-2 p-3 font-mono text-xs text-text-3">
          {testResult.provider} / {testResult.model} / {testResult.content}
        </div>
      )}
    </div>
  );
}

function formatProviderError(settings: AIProviderConfigInput, message: string) {
  if (settings.mode === 'official-deepseek' && message.includes('AI_CHAT_API_KEY')) {
    return '当前官方 DeepSeek 后端没有配置 AI_CHAT_API_KEY。请先切到“自带 Key / OpenAI-compatible”，填入你的 DeepSeek API Key 后再测试。';
  }
  return message;
}

function TextInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'password';
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-text-2">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-md border border-border bg-surface-2 px-3 font-mono text-sm text-text outline-none transition placeholder:text-text-4 focus:border-accent/60"
      />
    </label>
  );
}

function UsageSummary({
  usage,
  providers,
}: {
  usage: UsageMeResponse;
  providers: Array<[string, { usd: number; bytes: number; count: number }]>;
}) {
  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Metric label="总费用" value={formatUsd(usage.total_usd)} />
        <Metric label="传输量" value={formatBytes(usage.total_bytes)} />
        <Metric label="记录数" value={String(usage.recent.length)} />
      </div>

      <div className="space-y-2">
        {providers.length > 0 ? (
          providers.map(([provider, row]) => (
            <div key={provider} className="grid grid-cols-[1fr_auto_auto_auto] gap-4 py-2 border-b border-border">
              <div className="font-mono text-xs text-text-2">{provider}</div>
              <div className="font-mono text-xs text-text-3">{row.count} 次</div>
              <div className="font-mono text-xs text-text-3">{formatBytes(row.bytes)}</div>
              <div className="font-mono text-xs text-text-3">{formatUsd(row.usd)}</div>
            </div>
          ))
        ) : (
          <div className="font-mono text-xs text-text-3">暂无 provider 记录</div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-4">
      <div className="font-mono text-xs text-text-3 mb-2">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function formatUsd(value: number) {
  return `$${value.toFixed(4)}`;
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }
  const kb = value / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }
  return `${(kb / 1024).toFixed(1)} MB`;
}
