import type { Dirent } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import type { FileEntry, FileIndex } from './types.js';

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.turbo',
  '.cache',
  '.parcel-cache',
  '.idea',
  '.vscode',
  'target',
  '__pycache__',
  '.venv',
  'venv',
  '.pytest_cache',
  '.mypy_cache',
  '.tox',
  '.gradle',
  '.contextkit',
]);

export type WalkOptions = {
  maxDepth?: number;
  maxFiles?: number;
  skipDirs?: Iterable<string>;
};

export async function buildFileIndex(
  rootDir: string,
  options: WalkOptions = {},
): Promise<FileIndex> {
  const maxDepth = options.maxDepth ?? 5;
  const maxFiles = options.maxFiles ?? 5000;
  const skip = new Set([...SKIP_DIRS, ...(options.skipDirs ?? [])]);
  const files = new Map<string, FileEntry>();

  await walk(rootDir, rootDir, 0, maxDepth, maxFiles, skip, files);

  return { rootDir, files };
}

async function walk(
  rootDir: string,
  dir: string,
  depth: number,
  maxDepth: number,
  maxFiles: number,
  skip: Set<string>,
  files: Map<string, FileEntry>,
): Promise<void> {
  if (files.size >= maxFiles) return;
  let entries: Dirent[];
  try {
    entries = (await readdir(dir, { withFileTypes: true })) as Dirent[];
  } catch {
    return;
  }
  for (const entry of entries) {
    if (skip.has(entry.name)) continue;
    if (files.size >= maxFiles) return;
    const full = join(dir, entry.name);
    const rel = relative(rootDir, full).split(sep).join('/');
    if (entry.isDirectory()) {
      if (depth < maxDepth) {
        await walk(rootDir, full, depth + 1, maxDepth, maxFiles, skip, files);
      }
    } else if (entry.isFile()) {
      try {
        const s = await stat(full);
        files.set(rel, { path: rel, size: s.size });
      } catch {
        // ignore unreadable files
      }
    }
  }
}
