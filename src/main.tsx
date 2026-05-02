import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';
import App from './App';
import { AuthProvider } from './stores/auth-context';
import { bootstrapTheme } from './lib/theme';

// Apply persisted theme to <html> before React mounts so the first paint matches
// the user's saved preference (no light → dark flash on cold start).
bootstrapTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
