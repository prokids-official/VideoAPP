import { beforeEach, describe, expect, it, vi } from 'vitest';

const octokitMocks = vi.hoisted(() => ({
  getRef: vi.fn(),
  getCommit: vi.fn(),
  createBlob: vi.fn(),
  createTree: vi.fn(),
  createCommit: vi.fn(),
  updateRef: vi.fn(),
  getBlob: vi.fn(),
}));

vi.mock('@octokit/rest', () => ({
  Octokit: class {
    rest = {
      git: {
        getRef: octokitMocks.getRef,
        getCommit: octokitMocks.getCommit,
        createBlob: octokitMocks.createBlob,
        createTree: octokitMocks.createTree,
        createCommit: octokitMocks.createCommit,
        updateRef: octokitMocks.updateRef,
        getBlob: octokitMocks.getBlob,
      },
    };
  },
}));

import {
  GithubConflictError,
  createCommitWithFiles,
  getBlobContent,
  getDefaultBranchHead,
} from './github';

describe('getDefaultBranchHead', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns sha from refs/heads/main', async () => {
    octokitMocks.getRef.mockResolvedValueOnce({ data: { object: { sha: 'abc123' } } });

    expect(await getDefaultBranchHead()).toBe('abc123');
    expect(octokitMocks.getRef).toHaveBeenCalledWith({
      owner: 'fableglitch',
      repo: 'asset-library',
      ref: 'heads/main',
    });
  });
});

describe('createCommitWithFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates blobs, tree, commit, and updates ref', async () => {
    octokitMocks.getRef.mockResolvedValueOnce({ data: { object: { sha: 'parent-sha' } } });
    octokitMocks.getCommit.mockResolvedValueOnce({ data: { tree: { sha: 'parent-tree' } } });
    octokitMocks.createBlob
      .mockResolvedValueOnce({ data: { sha: 'blob-1' } })
      .mockResolvedValueOnce({ data: { sha: 'blob-2' } });
    octokitMocks.createTree.mockResolvedValueOnce({ data: { sha: 'new-tree' } });
    octokitMocks.createCommit.mockResolvedValueOnce({ data: { sha: 'new-commit' } });
    octokitMocks.updateRef.mockResolvedValueOnce({ data: {} });

    const result = await createCommitWithFiles({
      branch: 'main',
      message: 'test commit',
      files: [
        { path: 'a/b.md', content: 'hello' },
        { path: 'a/c.md', content: 'world' },
      ],
    });

    expect(result).toEqual({
      commit_sha: 'new-commit',
      blobs: { 'a/b.md': 'blob-1', 'a/c.md': 'blob-2' },
    });
    expect(octokitMocks.createTree).toHaveBeenCalledWith(
      expect.objectContaining({
        base_tree: 'parent-tree',
        tree: [
          { path: 'a/b.md', mode: '100644', type: 'blob', sha: 'blob-1' },
          { path: 'a/c.md', mode: '100644', type: 'blob', sha: 'blob-2' },
        ],
      }),
    );
    expect(octokitMocks.updateRef).toHaveBeenCalledWith(
      expect.objectContaining({
        ref: 'heads/main',
        sha: 'new-commit',
      }),
    );
  });

  it('retries once on update-ref 422 (conflict) by re-reading HEAD', async () => {
    octokitMocks.getRef
      .mockResolvedValueOnce({ data: { object: { sha: 'old-head' } } })
      .mockResolvedValueOnce({ data: { object: { sha: 'newer-head' } } });
    octokitMocks.getCommit
      .mockResolvedValueOnce({ data: { tree: { sha: 'tree-1' } } })
      .mockResolvedValueOnce({ data: { tree: { sha: 'tree-2' } } });
    octokitMocks.createBlob.mockResolvedValue({ data: { sha: 'b' } });
    octokitMocks.createTree
      .mockResolvedValueOnce({ data: { sha: 't1' } })
      .mockResolvedValueOnce({ data: { sha: 't2' } });
    octokitMocks.createCommit
      .mockResolvedValueOnce({ data: { sha: 'c1' } })
      .mockResolvedValueOnce({ data: { sha: 'c2' } });
    octokitMocks.updateRef
      .mockRejectedValueOnce(Object.assign(new Error('Reference cannot be updated'), { status: 422 }))
      .mockResolvedValueOnce({ data: {} });

    const result = await createCommitWithFiles({
      branch: 'main',
      message: 'm',
      files: [{ path: 'x.md', content: 'y' }],
    });

    expect(result.commit_sha).toBe('c2');
    expect(octokitMocks.updateRef).toHaveBeenCalledTimes(2);
  });

  it('throws GithubConflictError when retry also conflicts', async () => {
    octokitMocks.getRef.mockResolvedValue({ data: { object: { sha: 'h' } } });
    octokitMocks.getCommit.mockResolvedValue({ data: { tree: { sha: 't' } } });
    octokitMocks.createBlob.mockResolvedValue({ data: { sha: 'b' } });
    octokitMocks.createTree.mockResolvedValue({ data: { sha: 't' } });
    octokitMocks.createCommit.mockResolvedValue({ data: { sha: 'c' } });
    octokitMocks.updateRef.mockRejectedValue(Object.assign(new Error('conflict'), { status: 422 }));

    await expect(
      createCommitWithFiles({
        branch: 'main',
        message: 'm',
        files: [{ path: 'x.md', content: 'y' }],
      }),
    ).rejects.toThrow(GithubConflictError);
  });
});

describe('getBlobContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('decodes base64 blob content', async () => {
    octokitMocks.getBlob.mockResolvedValueOnce({
      data: {
        content: Buffer.from('hello world', 'utf8').toString('base64'),
        encoding: 'base64',
      },
    });

    expect(await getBlobContent('sha-1')).toBe('hello world');
  });
});
