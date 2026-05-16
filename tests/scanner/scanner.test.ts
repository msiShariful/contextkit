import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scanProject } from '../../src/scanner/index.js';

async function makeFile(root: string, rel: string, content: string): Promise<void> {
  const full = join(root, rel);
  await mkdir(join(full, '..'), { recursive: true });
  await writeFile(full, content, 'utf8');
}

describe('scanProject', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'contextkit-scan-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('detects a Node.js project with Next, React, and Drizzle', async () => {
    await makeFile(
      dir,
      'package.json',
      JSON.stringify({
        name: 'demo',
        dependencies: { next: '15.0.3', react: '19.0.0', 'drizzle-orm': '0.35.0' },
        devDependencies: { typescript: '5.7.2', vitest: '2.1.8' },
      }),
    );
    await makeFile(dir, 'tsconfig.json', '{}');
    await makeFile(dir, 'pnpm-lock.yaml', 'lockfileVersion: 9');

    const r = await scanProject(dir);
    expect(r.meta.name).toBe('demo');
    expect(r.meta.stack.languages).toEqual(expect.arrayContaining(['typescript', 'javascript']));
    expect(r.meta.stack.packageManager).toBe('pnpm');
    expect(r.meta.stack.testRunners).toEqual(['vitest']);
    expect(r.meta.stack.databases).toEqual(['drizzle']);
    expect(r.meta.stack.frameworks.map((f) => f.name)).toEqual(
      expect.arrayContaining(['next', 'react']),
    );
  });

  it('detects a pnpm monorepo', async () => {
    await makeFile(dir, 'package.json', JSON.stringify({ name: 'mono' }));
    await makeFile(dir, 'pnpm-workspace.yaml', 'packages:\n  - apps/*\n  - packages/*\n');

    const r = await scanProject(dir);
    expect(r.meta.layout.monorepo).toBe(true);
    expect(r.meta.layout.workspaces).toEqual(['apps/*', 'packages/*']);
  });

  it('detects an npm workspaces monorepo', async () => {
    await makeFile(dir, 'package.json', JSON.stringify({ name: 'mono', workspaces: ['apps/*'] }));
    const r = await scanProject(dir);
    expect(r.meta.layout.monorepo).toBe(true);
    expect(r.meta.layout.workspaces).toEqual(['apps/*']);
  });

  it('discovers existing CLAUDE.md and .cursorrules and .cursor/rules/*.mdc', async () => {
    await makeFile(dir, 'CLAUDE.md', '# CLAUDE.md\nrules here');
    await makeFile(dir, '.cursorrules', 'old format');
    await makeFile(dir, '.cursor/rules/api.mdc', 'mdc');
    await makeFile(dir, '.cursor/rules/db.mdc', 'mdc');

    const r = await scanProject(dir);
    const kinds = r.existingConfigs.map((c) => c.kind);
    expect(kinds).toEqual(expect.arrayContaining(['claude-md', 'cursorrules', 'cursor-mdc']));
    const mdc = r.existingConfigs.find((c) => c.kind === 'cursor-mdc');
    expect(mdc?.paths).toEqual(['.cursor/rules/api.mdc', '.cursor/rules/db.mdc']);
  });

  it('emits default ignores plus conditional lockfile ignores', async () => {
    await makeFile(dir, 'package.json', '{}');
    await makeFile(dir, 'pnpm-lock.yaml', '');
    const r = await scanProject(dir);
    const patterns = r.ignores.map((i) => i.pattern);
    expect(patterns).toEqual(expect.arrayContaining(['node_modules/**', '.env', '.env.*']));
    expect(patterns).toEqual(expect.arrayContaining(['pnpm-lock.yaml']));
    // No npm lockfile in this fixture, so no package-lock entry
    expect(patterns).not.toContain('package-lock.json');
  });

  it('skips node_modules and .git when walking', async () => {
    await makeFile(dir, 'package.json', JSON.stringify({ name: 'x' }));
    await makeFile(dir, 'node_modules/some-dep/index.js', '// should not be scanned');
    await makeFile(dir, '.git/objects/abc', 'blob');
    // these would otherwise trigger weird ignore detection if discovered

    const r = await scanProject(dir);
    expect(r.meta.name).toBe('x');
  });

  it('gracefully handles non-Node projects (no package.json)', async () => {
    await makeFile(dir, 'README.md', '# Plain repo');
    const r = await scanProject(dir);
    expect(r.meta.stack.packageManager).toBe('unknown');
    expect(r.meta.stack.frameworks).toEqual([]);
  });
});
