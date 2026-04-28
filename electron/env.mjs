import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');

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
  // Production override (set at build time when packaging the installer)
  if (process.env.FG_API_BASE_URL) {
    cached.VITE_API_BASE_URL = process.env.FG_API_BASE_URL;
  }
  if (!cached.VITE_API_BASE_URL) {
    cached.VITE_API_BASE_URL = 'http://localhost:3001/api';
  }
  return cached;
}
