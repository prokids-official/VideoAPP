import { createContext } from 'react';
import type { User } from '../../shared/types';

export interface AuthState {
  user: User | null;
  loading: boolean;
  signup: (input: { email: string; password: string; display_name: string }) => Promise<{
    ok: boolean;
    message?: string;
    pendingEmail?: string;
  }>;
  login: (input: { email: string; password: string }) => Promise<{ ok: boolean; code?: string; message?: string }>;
  resendVerification: (input: { email: string }) => Promise<{ ok: boolean; message?: string }>;
  resetPassword: (input: { email: string }) => Promise<{ ok: boolean; message?: string }>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);
