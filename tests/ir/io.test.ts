import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  IRError,
  __testing,
  isInitialized,
  parseFrontmatter,
  readIR,
  serializeFrontmatter,
  writeIR,
} from '../../src/ir/io.js';
import { DEFAULT_BUDGETS } from '../../src/ir/schema.js';
import type { ProjectIR } from '../../src/ir/types.js';

function fixtureIR(): ProjectIR {
  return {
    schemaVersion: '1',
    meta: {
      name: 'demo',
      oneLiner: 'a demo project',
      stack: {
        languages: ['typescript'],
        frameworks: [],
        packageManager: 'npm',
        testRunners: ['vitest'],
      },
      layout: { monorepo: false, srcRoots: ['src'], testRoots: ['tests'] },
    },
    budgets: DEFAULT_BUDGETS,
    knowledge: [
      {
        id: 'project-overview',
        topic: 'Project overview',
        summary: 'High-level description of demo',
        content: '# Demo\n\nIt does things.\n',
        routing: { tier: 'always' },
        tokenCost: 12,
        tags: ['overview'],
        provenance: { origin: 'manual', confidence: 'high' },
      },
      {
        id: 'db-migrations',
        topic: 'Database migrations',
        summary: 'Author migrations safely',
        content: '# Migrations\n\nUse drizzle.\n',
        routing: {
          tier: 'agent-decided',
          triggerKeywords: ['migration', 'schema'],
          whenToUse: 'When changing schema.',
        },
        tokenCost: 24,
        tags: ['database'],
        provenance: { origin: 'migration', confidence: 'high' },
      },
    ],
    workflows: [
      {
        id: 'deploy-staging',
        name: 'Deploy to staging',
        description: 'Ship current branch to staging.',
        trigger: { command: '/deploy-staging' },
        body: '1. Run tests\n2. Push to staging\n',
        adapterSupport: ['claude-code'],
        provenance: { origin: 'manual', confidence: 'high' },
      },
    ],
    agents: [
      {
        id: 'security-reviewer',
        name: 'Security reviewer',
        purpose: 'Audit code for vulnerabilities',
        whenToInvoke: 'Before merging auth changes',
        toolPolicy: { allow: ['Read', 'Grep'] },
        systemPrompt: 'You are a security reviewer.\n',
        provenance: { origin: 'manual', confidence: 'high' },
      },
    ],
    ignores: [
      {
        pattern: 'node_modules/**',
        reason: 'build-artifact',
        source: 'detected',
        appliesTo: 'all',
      },
    ],
    targets: [
      { target: 'claude-code', enabled: true, adapterVersion: '0.1.0' },
      { target: 'cursor', enabled: true, adapterVersion: '0.1.0' },
    ],
  };
}

describe('parseFrontmatter / serializeFrontmatter', () => {
  it('rejects missing leading delimiter', () => {
    expect(() => parseFrontmatter('no frontmatter\nbody')).toThrow(IRError);
  });

  it('rejects unclosed frontmatter', () => {
    expect(() => parseFrontmatter('---\nname: foo\nbody...')).toThrow(IRError);
  });

  it('rejects array frontmatter', () => {
    expect(() => parseFrontmatter('---\n- 1\n- 2\n---\nbody\n')).toThrow(/mapping/);
  });

  it('round-trips frontmatter and body', () => {
    const original = '---\nfoo: bar\nnums:\n  - 1\n  - 2\n---\n\nhello world\n';
    const parsed = parseFrontmatter(original);
    expect(parsed.frontmatter).toEqual({ foo: 'bar', nums: [1, 2] });
    expect(parsed.body).toBe('hello world\n');
    const reserialized = serializeFrontmatter(parsed.frontmatter, parsed.body);
    expect(parseFrontmatter(reserialized).frontmatter).toEqual(parsed.frontmatter);
    expect(parseFrontmatter(reserialized).body).toBe(parsed.body);
  });
});

describe('IR disk I/O', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'contextkit-test-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('isInitialized returns false on fresh dir', async () => {
    expect(await isInitialized(dir)).toBe(false);
  });

  it('readIR throws on uninitialized dir', async () => {
    await expect(readIR(dir)).rejects.toThrow(IRError);
  });

  it('round-trips a complete IR through write+read', async () => {
    const before = fixtureIR();
    await writeIR(dir, before);
    expect(await isInitialized(dir)).toBe(true);

    const after = await readIR(dir);
    // readIR sorts collections by id; sort `before` the same way for comparison.
    const sortById = <T extends { id: string }>(arr: T[]): T[] =>
      [...arr].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    expect({
      ...after,
      knowledge: sortById(after.knowledge),
      workflows: sortById(after.workflows),
      agents: sortById(after.agents),
    }).toEqual({
      ...before,
      knowledge: sortById(before.knowledge),
      workflows: sortById(before.workflows),
      agents: sortById(before.agents),
    });
  });

  it('places knowledge units in tier directories', async () => {
    await writeIR(dir, fixtureIR());
    const alwaysFile = join(dir, '.contextkit/knowledge/always/project-overview.md');
    const agentFile = join(dir, '.contextkit/knowledge/agent-decided/db-migrations.md');
    expect((await readFile(alwaysFile, 'utf8')).startsWith('---\n')).toBe(true);
    expect(await readFile(agentFile, 'utf8')).toMatch(/whenToUse: When changing schema\./);
  });

  it('prune removes stale knowledge files', async () => {
    const ir1 = fixtureIR();
    await writeIR(dir, ir1);

    const ir2 = { ...ir1, knowledge: ir1.knowledge.slice(0, 1) };
    await writeIR(dir, ir2);

    const reread = await readIR(dir);
    expect(reread.knowledge).toHaveLength(1);
    expect(reread.knowledge[0]?.id).toBe('project-overview');
  });

  it('rejects an index file with wrong schemaVersion', async () => {
    const ir = fixtureIR();
    await writeIR(dir, ir);
    const indexFile = join(dir, '.contextkit/contextkit.yaml');
    const text = await readFile(indexFile, 'utf8');
    const tampered = text.replace(/schemaVersion: ['"]1['"]/, 'schemaVersion: "2"');
    expect(tampered).not.toBe(text);
    await import('node:fs/promises').then((m) => m.writeFile(indexFile, tampered, 'utf8'));
    await expect(readIR(dir)).rejects.toThrow(IRError);
  });
});

describe('index parse/serialize', () => {
  it('serializes and re-parses the same payload', () => {
    const ir = fixtureIR();
    const text = __testing.serializeIndex(ir);
    const reparsed = __testing.parseIndex(text);
    expect(reparsed.meta.name).toBe('demo');
    expect(reparsed.targets).toHaveLength(2);
    expect(reparsed.budgets.alwaysLoaded.max).toBe(DEFAULT_BUDGETS.alwaysLoaded.max);
  });
});
