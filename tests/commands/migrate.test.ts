import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrateCommand } from '../../src/commands/migrate.js';

const SAMPLE = `# demo

## Overview

A short demo.

## Deploy to staging

1. Run tests
2. Push to staging

## API conventions

Files under \`src/api/**\` follow REST conventions.
`;

describe('migrate command', () => {
  let dir: string;
  const originalExit = process.exit;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'contextkit-cmd-'));
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'demo' }), 'utf8');
    await writeFile(join(dir, 'CLAUDE.md'), SAMPLE, 'utf8');
    // Swallow process.exit so failures throw instead of nuking the test runner.
    (process as unknown as { exit: (code?: number) => void }).exit = ((code?: number) => {
      throw new Error(`process.exit called with ${code ?? 0}`);
    }) as typeof process.exit;
  });

  afterEach(async () => {
    process.exit = originalExit;
    await rm(dir, { recursive: true, force: true });
  });

  it('migrates a CLAUDE.md to IR + Claude + Cursor outputs', async () => {
    const cmd = migrateCommand();
    await cmd.parseAsync(['node', 'contextkit', '--cwd', dir, '--target', 'claude-code,cursor']);

    expect(existsSync(join(dir, '.contextkit/contextkit.yaml'))).toBe(true);
    expect(existsSync(join(dir, 'CLAUDE.md'))).toBe(true);
    expect(existsSync(join(dir, '.claude/commands/deploy-to-staging.md'))).toBe(true);
    expect(existsSync(join(dir, '.cursor/rules/api-conventions.mdc'))).toBe(true);

    const claudeMd = await readFile(join(dir, 'CLAUDE.md'), 'utf8');
    expect(claudeMd).toContain('# demo');
    expect(claudeMd).toContain('## Overview');
    expect(claudeMd).not.toContain('## API conventions');

    const mdc = await readFile(join(dir, '.cursor/rules/api-conventions.mdc'), 'utf8');
    expect(mdc).toContain('globs: src/api/**');
  });

  it('--dry-run does not write any files', async () => {
    const cmd = migrateCommand();
    await cmd.parseAsync([
      'node',
      'contextkit',
      '--cwd',
      dir,
      '--target',
      'claude-code',
      '--dry-run',
    ]);
    expect(existsSync(join(dir, '.contextkit/contextkit.yaml'))).toBe(false);
    // CLAUDE.md existed before, but the Claude adapter would have overwritten it; with dry-run it should still match SAMPLE.
    const claudeMd = await readFile(join(dir, 'CLAUDE.md'), 'utf8');
    expect(claudeMd).toBe(SAMPLE);
  });
});
