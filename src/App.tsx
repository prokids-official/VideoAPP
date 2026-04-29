import { useAuth } from './stores/use-auth';
import { LoginRoute } from './routes/LoginRoute';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg text-text-3 font-mono text-xs">
        loading...
      </div>
    );
  }

  if (!user) {
    return <LoginRoute />;
  }

  return (
    <div className="min-h-screen bg-bg text-text p-6">
      <h1 className="text-2xl">已登录：{user.display_name}（{user.email}）</h1>
      <p className="font-mono text-xs text-text-3">下一步：实现 Shell + Tree</p>
    </div>
  );
}
