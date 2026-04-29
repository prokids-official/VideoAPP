import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import type { User } from '../../shared/types';
import { AuthContext } from './auth-store';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const has = await window.fableglitch.session.has();
      if (!has) {
        setLoading(false);
        return;
      }
      // Pessimistic boot: validate the cached token against the server before
      // showing any signed-in UI. The api client already retries with a fresh
      // access token via /auth/refresh once on 401, so an expired access token
      // doesn't bounce the user back to login here.
      const r = await api.me();
      if (r.ok) {
        setUser(r.data.user);
      } else {
        await window.fableglitch.session.clear();
      }
      setLoading(false);
    })();
  }, []);

  async function signup(input: { email: string; password: string; display_name: string }) {
    const r = await api.signup(input);
    if (r.ok) {
      return { ok: true, pendingEmail: r.data.user.email };
    }
    return { ok: false, message: r.message };
  }

  async function login(input: { email: string; password: string }) {
    const r = await api.login(input);
    if (r.ok) {
      setUser(r.data.user);
      return { ok: true };
    }
    return { ok: false, code: r.code, message: r.message };
  }

  async function resendVerification(input: { email: string }) {
    const r = await api.resendVerification(input);
    if (r.ok) {
      return { ok: true };
    }
    return { ok: false, message: r.message };
  }

  async function logout() {
    await api.logout();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, signup, login, resendVerification, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
