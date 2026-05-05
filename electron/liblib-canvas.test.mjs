import { describe, expect, it, vi } from 'vitest';
import {
  createLiblibCanvasController,
  normalizeBounds,
  normalizeLiblibUrl,
} from './liblib-canvas.mjs';

describe('liblib canvas helpers', () => {
  it('normalizes valid external canvas URLs', () => {
    expect(normalizeLiblibUrl('https://www.liblib.tv/canvas/share?shareId=eVpJAFCFd')).toBe(
      'https://www.liblib.tv/canvas/share?shareId=eVpJAFCFd',
    );
    expect(normalizeLiblibUrl('https://liblib.tv/canvas')).toBe('https://www.liblib.tv/canvas');
    expect(normalizeLiblibUrl('https://www.runninghub.ai/canvas')).toBe('https://www.runninghub.ai/canvas');
  });

  it('supports operator-configured external canvas hosts', () => {
    expect(normalizeLiblibUrl('https://canvas.example.com/work/1', {
      extraAllowedHosts: ['canvas.example.com'],
    })).toBe('https://canvas.example.com/work/1');
  });

  it('rejects unsafe or unapproved URLs', () => {
    expect(() => normalizeLiblibUrl('javascript:alert(1)')).toThrow('外部画布 URL 不合法');
    expect(() => normalizeLiblibUrl('file:///C:/secret.txt')).toThrow('外部画布 URL 不合法');
    expect(() => normalizeLiblibUrl('http://www.liblib.tv/canvas')).toThrow('外部画布 URL 不合法');
    expect(() => normalizeLiblibUrl('https://example.com/canvas')).toThrow('外部画布 URL 不合法');
  });

  it('clamps bounds to safe integer rectangles', () => {
    expect(normalizeBounds({ x: 10.4, y: 20.8, width: 300.2, height: 200.9 })).toEqual({
      x: 10,
      y: 21,
      width: 300,
      height: 201,
    });
    expect(normalizeBounds({ x: -4, y: -9, width: 0, height: 2 })).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 2,
    });
  });
});

describe('liblib canvas controller', () => {
  it('loads approved canvas URLs into a persistent BrowserView', async () => {
    const view = makeView();
    const BrowserView = vi.fn(function BrowserView() {
      return view;
    });
    const controller = createLiblibCanvasController({ BrowserView, shell: { openExternal: vi.fn() } });
    const win = makeWindow();

    await expect(controller.show(win, {
      url: 'https://www.liblib.tv/canvas/share?shareId=eVpJAFCFd',
      bounds: { x: 20, y: 30, width: 640, height: 360 },
    })).resolves.toEqual({
      ok: true,
      url: 'https://www.liblib.tv/canvas/share?shareId=eVpJAFCFd',
    });

    expect(BrowserView).toHaveBeenCalledWith({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        partition: 'persist:liblib',
        sandbox: true,
      },
    });
    expect(win.addBrowserView).toHaveBeenCalledWith(view);
    expect(view.setBounds).toHaveBeenCalledWith({ x: 20, y: 30, width: 640, height: 360 });
    expect(view.webContents.loadURL).toHaveBeenCalledWith('https://www.liblib.tv/canvas/share?shareId=eVpJAFCFd');
  });

  it('hides and destroys the embedded view', () => {
    const view = makeView();
    const controller = createLiblibCanvasController({
      BrowserView: vi.fn(function BrowserView() {
        return view;
      }),
      shell: { openExternal: vi.fn() },
    });
    const win = makeWindow();

    return controller.show(win, { url: 'https://www.liblib.tv/canvas', bounds: { x: 0, y: 0, width: 1, height: 1 } })
      .then(() => {
        expect(controller.hide()).toEqual({ ok: true });
        expect(win.removeBrowserView).toHaveBeenCalledWith(view);
        controller.destroy();
        expect(view.webContents.close).toHaveBeenCalled();
      });
  });
});

function makeView() {
  return {
    setBounds: vi.fn(),
    setAutoResize: vi.fn(),
    webContents: {
      getURL: vi.fn(() => ''),
      loadURL: vi.fn(async () => {}),
      isDestroyed: vi.fn(() => false),
      close: vi.fn(),
    },
  };
}

function makeWindow() {
  return {
    addBrowserView: vi.fn(),
    removeBrowserView: vi.fn(),
    isDestroyed: vi.fn(() => false),
  };
}
