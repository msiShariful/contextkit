import { describe, expect, it } from 'vitest';
import { claudeCodeAdapter } from '../../src/adapters/claude-code/index.js';
import { DEFAULT_BUDGETS } from '../../src/ir/schema.js';
import type { ProjectIR } from '../../src/ir/types.js';

const provenance = { origin: 'manual' as const, confidence: 'high' as const };

function fixtureIR(): ProjectIR {
  return {
    schemaVersion: '1',
    meta: {
      name: 'demo',
      oneLiner: 'A demo project',
      stack: {
        languages: ['typescript'],
        frameworks: [],
        packageManager: 'npm',
        testRunners: [],
      },
      layout: { monorepo: false, srcRoots: ['src'], testRoots: ['tests'] },
    },
    budgets: DEFAULT_BUDGETS,
    knowledge: [
      {
        id: 'overview',
        topic: 'Overview',
        summary: 'High-level',
        content: 'This is a demo.',
        routing: { tier: 'always' },
        tokenCost: 5,
        tags: [],
        provenance,
      },
      {
        id: 'db-migrations',
        topic: 'Database migrations',
        summary: 'Author migrations safely.',
        content: '# Migrations\n\nUse drizzle.',
        routing: {
          tier: 'agent-decided',
          triggerKeywords: ['migration', 'drizzle'],
          whenToUse: 'When changing schema.',
        },
        tokenCost: 10,
        tags: [],
        provenance,
      },
      {
        id: 'api-conventions',
        topic: 'API conventions',
        summary: 'How API handlers should look.',
        content: 'Files under src/api/**.',
        routing: { tier: 'glob', globs: ['src/api/**'] },
        tokenCost: 5,
        tags: [],
        provenance,
      },
      {
        id: 'arch-deep-dive',
        topic: 'Architecture',
        summary: 'long ref',
        content: 'detailed arch...',
        routing: { tier: 'reference', indexedAs: 'docs/architecture.md' },
        tokenCost: 100,
        tags: [],
        provenance,
      },
    ],
    workflows: [
      {
        id: 'deploy-staging',
        name: 'Deploy to staging',
        description: 'Push to staging branch.',
        trigger: { command: '/deploy-staging' },
        body: '1. Run tests\n2. Push',
        adapterSupport: ['claude-code'],
        provenance,
      },
    ],
    agents: [
      {
        id: 'security-reviewer',
        name: 'Security reviewer',
        purpose: 'Audit for vulnerabilities',
        whenToInvoke: 'Before merging auth changes',
        toolPolicy: { allow: ['Read', 'Grep'] },
        systemPrompt: 'You are a security reviewer.',
        provenance,
      },
    ],
    ignores: [
      {
        pattern: 'node_modules/**',
        reason: 'build-artifact',
        source: 'detected',
        appliesTo: 'all',
      },
      {
        pattern: 'cursor-only.md',
        reason: 'manual',
        source: 'manual',
        appliesTo: ['cursor'],
      },
    ],
    targets: [],
  };
}

describe('claudeCodeAdapter', () => {
  it('renders a CLAUDE.md from always-loaded units only', () => {
    const r = claudeCodeAdapter.render(fixtureIR());
    const claudeMd = r.files.find((f) => f.path === 'CLAUDE.md');
    expect(claudeMd?.content).toContain('# demo');
    expect(claudeMd?.content).toContain('> A demo project');
    expect(claudeMd?.content).toContain('## Overview');
    expect(claudeMd?.content).not.toContain('## Database migrations');
    expect(r.alwaysLoadedTokens).toBeGreaterThan(0);
  });

  it('renders skills with description frontmatter', () => {
    const r = claudeCodeAdapter.render(fixtureIR());
    const skill = r.files.find((f) => f.path === '.claude/skills/db-migrations.md');
    expect(skill?.content).toContain('name: Database migrations');
    // description may be YAML-quoted due to colon in body; just check the value text.
    expect(skill?.content).toContain('When changing schema.');
    expect(skill?.content).toContain('Triggers: migration, drizzle');
  });

  it('emulates glob units as skills with file-type cues + emits a warning', () => {
    const r = claudeCodeAdapter.render(fixtureIR());
    const skill = r.files.find((f) => f.path === '.claude/skills/api-conventions.md');
    expect(skill?.content).toContain('Use when working on files matching: src/api/**');
    expect(r.warnings.some((w) => w.includes('glob'))).toBe(true);
  });

  it('renders supported workflows to .claude/commands/', () => {
    const r = claudeCodeAdapter.render(fixtureIR());
    const cmd = r.files.find((f) => f.path === '.claude/commands/deploy-staging.md');
    expect(cmd?.content).toContain('description: Push to staging branch');
    expect(cmd?.content).toContain('# Deploy to staging');
  });

  it('renders subagents to .claude/agents/', () => {
    const r = claudeCodeAdapter.render(fixtureIR());
    const agent = r.files.find((f) => f.path === '.claude/agents/security-reviewer.md');
    expect(agent?.content).toContain('name: Security reviewer');
    expect(agent?.content).toContain('tools: Read, Grep');
  });

  it('writes reference units to their indexedAs path', () => {
    const r = claudeCodeAdapter.render(fixtureIR());
    expect(r.files.some((f) => f.path === 'docs/architecture.md')).toBe(true);
  });

  it('filters ignores by appliesTo', () => {
    const r = claudeCodeAdapter.render(fixtureIR());
    const ignore = r.files.find((f) => f.path === '.claudeignore');
    expect(ignore?.content).toContain('node_modules/**');
    expect(ignore?.content).not.toContain('cursor-only.md');
  });

  it('respects per-target skip overrides', () => {
    const ir = fixtureIR();
    const overview = ir.knowledge.find((k) => k.id === 'overview');
    if (overview) {
      overview.adapterOverrides = { 'claude-code': { skip: true } };
    }
    const r = claudeCodeAdapter.render(ir);
    const claudeMd = r.files.find((f) => f.path === 'CLAUDE.md');
    expect(claudeMd?.content).not.toContain('## Overview');
  });
});
