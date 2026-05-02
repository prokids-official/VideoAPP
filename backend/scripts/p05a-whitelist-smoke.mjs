import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvFile(path) {
  try {
    const text = readFileSync(path, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq);
      const value = trimmed.slice(eq + 1).replace(/^"|"$/g, '');
      process.env[key] ??= value;
    }
  } catch {}
}

loadEnvFile(resolve(process.cwd(), '..', '.env'));
loadEnvFile(resolve(process.cwd(), '.env.local'));

const apiBase = (process.env.P05A_SMOKE_API_BASE ?? process.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
const adminEmail = process.env.P05A_SMOKE_ADMIN_EMAIL ?? 'meilinle@beva.com';
const adminPassword = process.env.P05A_SMOKE_ADMIN_PASSWORD ?? 'Admin1234';
const domain = process.env.P05A_SMOKE_DOMAIN ?? 'test-vendor.com';
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function log(name, details = {}) {
  const suffix = Object.keys(details).length ? ` ${JSON.stringify(details)}` : '';
  console.log(`PASS ${name}${suffix}`);
}

async function api(path, { method = 'GET', token, json, expected = [200] } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (json !== undefined) headers['content-type'] = 'application/json';

  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers,
    body: json === undefined ? undefined : JSON.stringify(json),
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!expected.includes(res.status)) {
    throw new Error(`${method} ${path} expected ${expected.join('/')} got ${res.status}: ${text.slice(0, 500)}`);
  }

  return { status: res.status, body };
}

async function findActiveEntry(token) {
  const listed = await api('/admin/whitelist?include_revoked=true', { token });
  return listed.body?.data?.entries?.find((entry) => entry.domain === domain && !entry.revoked_at) ?? null;
}

async function ensureActiveWhitelist(token) {
  const created = await api('/admin/whitelist', {
    method: 'POST',
    token,
    json: {
      domain,
      reason: `P0.5-A smoke ${stamp}`,
    },
    expected: [201, 409],
  });

  if (created.status === 201) {
    return created.body.data.entry;
  }

  const active = await findActiveEntry(token);
  assert(active, `domain ${domain} is duplicate but no active entry was returned by list`);
  return active;
}

async function main() {
  assert(apiBase, 'Missing P05A_SMOKE_API_BASE or VITE_API_BASE_URL');

  console.log(`BASE ${apiBase}`);
  const login = await api('/auth/login', {
    method: 'POST',
    json: { email: adminEmail, password: adminPassword },
  });
  const token = login.body?.data?.session?.access_token;
  assert(token, 'admin login did not return access_token');
  assert(login.body?.data?.user?.role === 'admin', 'smoke account is not admin');
  log('admin login', { email: adminEmail });

  const entry = await ensureActiveWhitelist(token);
  assert(entry?.id, 'whitelist entry missing id');
  log('add whitelist domain', { domain, entry_id: entry.id });

  const allowedEmail = `someone-${stamp}@${domain}`;
  const deniedEmail = `another-${stamp}@${domain}`;
  const password = 'SmokePass123';
  const signupAllowed = await api('/auth/signup', {
    method: 'POST',
    json: {
      email: allowedEmail,
      password,
      display_name: '白名单烟测',
    },
    expected: [201],
  });
  assert(signupAllowed.body?.ok === true, 'whitelisted signup did not return ok=true');
  log('signup allowed while domain active', { email: allowedEmail });

  const revoked = await api(`/admin/whitelist/${entry.id}`, {
    method: 'DELETE',
    token,
    expected: [200],
  });
  assert(revoked.body?.data?.revoked_at, 'revoked entry missing revoked_at');
  log('revoke whitelist domain', { domain, entry_id: entry.id });

  const signupDenied = await api('/auth/signup', {
    method: 'POST',
    json: {
      email: deniedEmail,
      password,
      display_name: '白名单烟测拒绝',
    },
    expected: [400],
  });
  assert(signupDenied.body?.error?.code === 'EMAIL_DOMAIN_NOT_ALLOWED', 'revoked domain did not return EMAIL_DOMAIN_NOT_ALLOWED');
  log('signup denied after revoke', { email: deniedEmail, code: signupDenied.body.error.code });

  const loginExisting = await api('/auth/login', {
    method: 'POST',
    json: { email: allowedEmail, password },
  });
  assert(loginExisting.body?.data?.session?.access_token, 'existing whitelisted user cannot log in after revoke');
  log('existing user login still works after revoke', { email: allowedEmail });

  const activeAfter = await findActiveEntry(token);
  assert(!activeAfter, `${domain} should be left revoked, but an active row still exists`);
  log('domain left revoked', { domain });
}

main().catch((error) => {
  console.error(`FAIL ${error.message}`);
  process.exitCode = 1;
});
