import { app, dialog } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';

function draftsRoot() {
  return path.join(app.getPath('userData'), 'FableGlitch', 'drafts');
}

function viewCacheRoot() {
  return path.join(app.getPath('userData'), 'FableGlitch', 'view-cache');
}

export async function saveDraftFile({ localDraftId, extension, content }) {
  const safeExt = extension.startsWith('.') ? extension : `.${extension}`;
  const dir = draftsRoot();
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${localDraftId}${safeExt}`);
  const data = typeof content === 'string' ? Buffer.from(content, 'utf8') : Buffer.from(content);
  await fs.writeFile(filePath, data);
  return { path: filePath, size_bytes: data.byteLength };
}

export async function readDraftFile(filePath) {
  return fs.readFile(filePath);
}

export async function deleteDraftFile(localDraftId) {
  const dir = draftsRoot();
  let names;
  try {
    names = await fs.readdir(dir);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return;
    }
    throw error;
  }

  await Promise.all(
    names
      .filter((name) => name === localDraftId || name.startsWith(`${localDraftId}.`))
      .map((name) => fs.unlink(path.join(dir, name)).catch((error) => {
        if (error?.code !== 'ENOENT') {
          throw error;
        }
      })),
  );
}

export async function openFileDialog(filters) {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters,
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  const data = await fs.readFile(filePath);
  const stat = await fs.stat(filePath);
  return {
    path: filePath,
    name: path.basename(filePath),
    size_bytes: stat.size,
    content: data,
  };
}

export async function saveViewCacheFile({ assetId, extension, content }) {
  const safeExt = extension.startsWith('.') ? extension : `.${extension}`;
  const dir = viewCacheRoot();
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${assetId}${safeExt}`);
  const data = typeof content === 'string' ? Buffer.from(content, 'utf8') : Buffer.from(content);
  await fs.writeFile(filePath, data);
  return { path: filePath, size_bytes: data.byteLength };
}
