import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import type { User } from '../../shared/types';
import { AuthContext } from './auth-store';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // Hard 6s timeout so a hanging /auth/me never traps the boot UI in
        // a perpetual "loading…" state (slow network, Vercel cold start, etc.)
        const meWithTimeout = async () => {
          return await Promise.race([
            api.me(),
            new Promise<{ ok: false; code: 'TIMEOUT'; message: string; status: 0 }>((resolve) =>
              setTimeout(() => resolve({ ok: false, code: 'TIMEOUT', message: 'boot timeout', status: 0 }), 6000),
            ),
          ]);
        };

        if (!window.fableglitch?.session) {
          // preload bridge not initialised — surface as logged-out so the
          // user at least sees the login page instead of a forever spinner
          console.error('fableglitch preload bridge missing');
          return;
        }
        const has = await window.fableglitch.session.has();
        if (!has) return;

        const r = await meWithTimeout();
        if (cancelled) return;
        if (r.ok) {
          setUser(r.data.user);
        } else {
          await window.fableglitch.session.clear().catch(() => {});
        }
      } catch (e) {
        console.error('auth boot failed:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function signup(input: { email: string; password: string; display_name: string }) {
    const r = await api.signup(input);
    if (r.ok) {
      if ('session' in r.data) {
        setUser(r.data.user);
        return { ok: true, signedIn: true };
      }
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

  async function resetPassword(input: { email: string }) {
    const r = await api.resetPassword(input);
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
    <AuthContext.Provider value={{ user, loading, signup, login, resendVerification, resetPassword, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
