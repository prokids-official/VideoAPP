const DEFAULT_CANVAS_HOSTS = new Set([
  'www.liblib.tv',
  'liblib.tv',
  'www.liblib.art',
  'liblib.art',
  'www.runninghub.ai',
  'runninghub.ai',
  'www.runninghub.cn',
  'runninghub.cn',
]);

const LIBLIB_HOST_MAP = new Map([
  ['liblib.tv', 'www.liblib.tv'],
  ['liblib.art', 'www.liblib.art'],
  ['runninghub.ai', 'www.runninghub.ai'],
  ['runninghub.cn', 'www.runninghub.cn'],
]);

export function normalizeLiblibUrl(input, options = {}) {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw) throw new Error('外部画布 URL 不合法');

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('外部画布 URL 不合法');
  }

  const allowedHosts = allowedCanvasHosts(options.extraAllowedHosts);
  if (url.protocol !== 'https:' || !allowedHosts.has(url.hostname)) {
    throw new Error('外部画布 URL 不合法');
  }

  url.hostname = LIBLIB_HOST_MAP.get(url.hostname) ?? url.hostname;
  return url.toString();
}

export function normalizeBounds(input) {
  const number = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
  };
  return {
    x: Math.max(0, number(input?.x, 0)),
    y: Math.max(0, number(input?.y, 0)),
    width: Math.max(1, number(input?.width, 1)),
    height: Math.max(1, number(input?.height, 1)),
  };
}

export function createLiblibCanvasController({ BrowserView, shell, extraAllowedHosts } = {}) {
  let view = null;
  let ownerWindow = null;

  function ensureView(win) {
    if (!view) {
      view = new BrowserView({
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          partition: 'persist:liblib',
          sandbox: true,
        },
      });
    }

    if (ownerWindow !== win) {
      if (ownerWindow && !ownerWindow.isDestroyed()) {
        ownerWindow.removeBrowserView(view);
      }
      ownerWindow = win;
      ownerWindow.addBrowserView(view);
    }

    return view;
  }

  async function show(win, input) {
    if (!win || win.isDestroyed()) {
      throw new Error('主窗口不可用');
    }
    const url = normalizeLiblibUrl(input?.url, { extraAllowedHosts });
    const bounds = normalizeBounds(input?.bounds);
    const current = ensureView(win);
    current.setBounds(bounds);
    current.setAutoResize({ width: false, height: false });

    if (current.webContents.getURL() !== url) {
      await current.webContents.loadURL(url);
    }

    return { ok: true, url };
  }

  function setBounds(input) {
    if (!view) return { ok: true };
    view.setBounds(normalizeBounds(input));
    return { ok: true };
  }

  function hide() {
    if (ownerWindow && view && !ownerWindow.isDestroyed()) {
      ownerWindow.removeBrowserView(view);
    }
    ownerWindow = null;
    return { ok: true };
  }

  async function openExternal(input) {
    const url = normalizeLiblibUrl(input, { extraAllowedHosts });
    await shell.openExternal(url);
    return { ok: true, url };
  }

  function destroy() {
    hide();
    if (view && !view.webContents.isDestroyed()) {
      view.webContents.close();
    }
    view = null;
  }

  return { show, setBounds, hide, openExternal, destroy };
}

function allowedCanvasHosts(extraAllowedHosts) {
  const hosts = new Set(DEFAULT_CANVAS_HOSTS);
  const rawExtra = Array.isArray(extraAllowedHosts)
    ? extraAllowedHosts
    : String(process.env.FG_CANVAS_ALLOWED_HOSTS ?? '').split(',');
  for (const host of rawExtra) {
    const clean = String(host).trim().toLowerCase();
    if (clean) hosts.add(clean);
  }
  return hosts;
}
