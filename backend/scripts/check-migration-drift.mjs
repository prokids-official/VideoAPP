import { execFile } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const migrationsDir = fileURLToPath(new URL('../supabase/migrations/', import.meta.url));

function localVersions() {
  return readdirSync(migrationsDir)
    .filter((name) => /^\d{14}_.+\.sql$/.test(name))
    .map((name) => ({ version: name.slice(0, 14), file: name }))
    .sort((a, b) => a.version.localeCompare(b.version));
}

function parseRemoteVersions(output) {
  return Array.from(new Set(output.match(/\b\d{14}\b/g) ?? [])).sort();
}

function formatList(items) {
  return items.length ? items.join('\n  - ') : '(none)';
}

async function migrationListOutput() {
  if (process.env.MIGRATION_LIST_OUTPUT_FILE) {
    return await import('node:fs/promises').then((fs) =>
      fs.readFile(process.env.MIGRATION_LIST_OUTPUT_FILE, 'utf8'),
    );
  }

  const localCli = resolve(dirname(migrationsDir), '..', 'node_modules', '.bin', process.platform === 'win32' ? 'supabase.cmd' : 'supabase');
  let cmd = process.env.SUPABASE_BIN || (existsSync(localCli) ? localCli : process.platform === 'win32' ? 'npx.cmd' : 'npx');
  let args = process.env.SUPABASE_BIN || existsSync(localCli)
    ? ['migration', 'list', '--linked']
    : ['supabase', 'migration', 'list', '--linked'];

  if (process.env.SUPABASE_DB_PASSWORD) {
    args.push('--password', process.env.SUPABASE_DB_PASSWORD);
  }

  if (process.platform === 'win32' && cmd.endsWith('.cmd')) {
    args = ['/d', '/s', '/c', cmd, ...args];
    cmd = 'cmd.exe';
  }

  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      cwd: dirname(migrationsDir),
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 4,
    });
    return `${stdout}\n${stderr}`;
  } catch (error) {
    const stderr = error.stderr ? `\nSTDERR:\n${error.stderr}` : '';
    const stdout = error.stdout ? `\nSTDOUT:\n${error.stdout}` : '';
    const message = error.message ? `\nERROR:\n${error.message}` : '';
    throw new Error(
      `Unable to read linked Supabase migration list. Run "npx supabase link --project-ref <ref>" and "npx supabase login", then retry.${message}${stdout}${stderr}`,
    );
  }
}

async function main() {
  const local = localVersions();
  const remote = parseRemoteVersions(await migrationListOutput());
  const localSet = new Set(local.map((item) => item.version));
  const remoteSet = new Set(remote);
  const missingRemote = local.filter((item) => !remoteSet.has(item.version));
  const extraRemote = remote.filter((version) => !localSet.has(version));

  console.log(`Local migrations (${local.length}):`);
  for (const item of local) {
    console.log(`  - ${item.version} ${basename(item.file)}`);
  }
  console.log(`Remote migrations (${remote.length}):`);
  for (const version of remote) {
    console.log(`  - ${version}`);
  }

  if (missingRemote.length || extraRemote.length) {
    console.error('Migration drift detected.');
    console.error(`Local not applied remotely:\n  - ${formatList(missingRemote.map((item) => item.file))}`);
    console.error(`Remote not present locally:\n  - ${formatList(extraRemote)}`);
    process.exitCode = 1;
    return;
  }

  console.log('No migration drift detected.');
}

main().catch((error) => {
  console.error(`FAIL ${error.message}`);
  process.exitCode = 1;
});
