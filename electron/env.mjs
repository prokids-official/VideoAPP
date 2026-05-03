import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');
const DEV_API_BASE_URL = 'http://localhost:3001/api';
const PROD_API_BASE_URL = 'https://video-app-kappa-murex.vercel.app/api';

let cached = null;

export function loadEnv() {
  if (cached) return cached;
  cached = {};
  if (fs.existsSync(envPath)) {
    const text = fs.readFileSync(envPath, 'utf-8');
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      cached[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
    }
  }
  cached.VITE_API_BASE_URL = resolveApiBaseUrl(
    { ...cached, FG_API_BASE_URL: process.env.FG_API_BASE_URL },
    { isDevServer: Boolean(process.env.VITE_DEV_SERVER_URL) },
  );
  return cached;
}

export function resolveApiBaseUrl(env, options) {
  if (env.FG_API_BASE_URL) return env.FG_API_BASE_URL;
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  return options.isDevServer ? DEV_API_BASE_URL : PROD_API_BASE_URL;
}
