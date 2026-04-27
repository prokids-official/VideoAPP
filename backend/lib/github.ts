import { Octokit } from '@octokit/rest';
import { env } from './env';

export class GithubConflictError extends Error {
  code = 'GITHUB_CONFLICT' as const;

  constructor(message = 'GitHub ref update conflict after retry') {
    super(message);
    this.name = 'GithubConflictError';
    Object.setPrototypeOf(this, GithubConflictError.prototype);
  }
}

let client: Octokit | null = null;

export function getOctokit(): Octokit {
  if (!client) {
    client = new Octokit({ auth: env.GITHUB_BOT_TOKEN });
  }

  return client;
}

export interface CommitFile {
  path: string;
  content: string;
}

export interface CommitResult {
  commit_sha: string;
  blobs: Record<string, string>;
}

export async function getDefaultBranchHead(branch?: string): Promise<string> {
  const ref = `heads/${branch ?? env.GITHUB_DEFAULT_BRANCH}`;
  const { data } = await getOctokit().rest.git.getRef({
    owner: env.GITHUB_REPO_OWNER,
    repo: env.GITHUB_REPO_NAME,
    ref,
  });

  return data.object.sha;
}

async function performCommit(opts: {
  branch: string;
  message: string;
  files: CommitFile[];
}): Promise<CommitResult> {
  const octokit = getOctokit();
  const owner = env.GITHUB_REPO_OWNER;
  const repo = env.GITHUB_REPO_NAME;
  const headSha = await getDefaultBranchHead(opts.branch);
  const { data: parentCommit } = await octokit.rest.git.getCommit({
    owner,
    repo,
    commit_sha: headSha,
  });
  const blobs: Record<string, string> = {};

  for (const file of opts.files) {
    const { data: blob } = await octokit.rest.git.createBlob({
      owner,
      repo,
      content: file.content,
      encoding: 'utf-8',
    });
    blobs[file.path] = blob.sha;
  }

  const { data: tree } = await octokit.rest.git.createTree({
    owner,
    repo,
    base_tree: parentCommit.tree.sha,
    tree: opts.files.map((file) => ({
      path: file.path,
      mode: '100644' as const,
      type: 'blob' as const,
      sha: blobs[file.path],
    })),
  });
  const { data: commit } = await octokit.rest.git.createCommit({
    owner,
    repo,
    message: opts.message,
    tree: tree.sha,
    parents: [headSha],
  });

  await octokit.rest.git.updateRef({
    owner,
    repo,
    ref: `heads/${opts.branch}`,
    sha: commit.sha,
  });

  return { commit_sha: commit.sha, blobs };
}

export async function createCommitWithFiles(opts: {
  branch?: string;
  message: string;
  files: CommitFile[];
}): Promise<CommitResult> {
  const branch = opts.branch ?? env.GITHUB_DEFAULT_BRANCH;

  try {
    return await performCommit({ branch, message: opts.message, files: opts.files });
  } catch (error) {
    if ((error as { status?: number }).status !== 422) {
      throw error;
    }

    try {
      return await performCommit({ branch, message: opts.message, files: opts.files });
    } catch (retryError) {
      if ((retryError as { status?: number }).status === 422) {
        throw new GithubConflictError();
      }

      throw retryError;
    }
  }
}

export async function getBlobContent(sha: string): Promise<string> {
  const { data } = await getOctokit().rest.git.getBlob({
    owner: env.GITHUB_REPO_OWNER,
    repo: env.GITHUB_REPO_NAME,
    file_sha: sha,
  });

  if (data.encoding === 'base64') {
    return Buffer.from(data.content, 'base64').toString('utf-8');
  }

  return data.content;
}
