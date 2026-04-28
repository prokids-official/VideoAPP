import { useAuth } from './stores/auth-context';
import { Button } from './components/ui/Button';
import { Input } from './components/ui/Input';
import { Card } from './components/ui/Card';

export default function App() {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg text-text-3 font-mono text-xs">
        loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-text font-sans p-6">
      <h1 className="text-4xl font-bold tracking-tight">FableGlitch Studio</h1>
      <p className="font-mono text-xs text-text-3 mt-2">P0-C Task 6 · UI atoms</p>

      {user && (
        <Card className="mt-6 p-4 max-w-2xl">
          <div className="text-md mb-1">{user.display_name}</div>
          <div className="font-mono text-xs text-text-3">{user.email}</div>
        </Card>
      )}

      <Card className="mt-3 p-6 max-w-2xl">
        <div className="text-base font-medium mb-4">Button variants</div>
        <div className="flex flex-wrap gap-2 mb-3">
          <Button variant="gradient" size="lg">主 CTA · gradient</Button>
          <Button variant="primary">primary</Button>
          <Button variant="secondary">secondary</Button>
          <Button variant="ghost">ghost</Button>
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          <Button variant="primary" size="sm">sm</Button>
          <Button variant="primary" size="md">md</Button>
          <Button variant="primary" size="lg">lg</Button>
          <Button variant="gradient" disabled>disabled</Button>
        </div>
        {user && (
          <Button variant="secondary" size="sm" onClick={logout}>
            退出登录
          </Button>
        )}
      </Card>

      <Card className="mt-3 p-6 max-w-2xl">
        <div className="text-base font-medium mb-4">Input variants</div>
        <Input label="邮箱" type="email" mono placeholder="name@beva.com" hint="@beva.com 内部邮箱" />
        <Input label="密码" type="password" placeholder="••••••••" />
        <Input label="带错误" placeholder="试一下" error="非法字符" />
      </Card>
    </div>
  );
}
