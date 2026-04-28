import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import type { User } from '../../shared/types';

interface AuthState {
  user: User | null;
  loading: boolean;
  signup: (input: { email: string; password: string; display_name: string }) => Promise<{ ok: boolean; message?: string }>;
  login: (input: { email: string; password: string }) => Promise<{ ok: boolean; message?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

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
      setUser(r.data.user);
      return { ok: true };
    }
    return { ok: false, message: r.message };
  }

  async function login(input: { email: string; password: string }) {
    const r = await api.login(input);
    if (r.ok) {
      setUser(r.data.user);
      return { ok: true };
    }
    return { ok: false, message: r.message };
  }

  async function logout() {
    await api.logout();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, signup, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}
