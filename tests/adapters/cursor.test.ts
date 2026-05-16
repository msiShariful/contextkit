import { describe, expect, it } from 'vitest';
import { cursorAdapter } from '../../src/adapters/cursor/index.js';
import { DEFAULT_BUDGETS } from '../../src/ir/schema.js';
import type { ProjectIR } from '../../src/ir/types.js';

const provenance = { origin: 'manual' as const, confidence: 'high' as const };

function fixtureIR(): ProjectIR {
  return {
    schemaVersion: '1',
    meta: {
      name: 'demo',
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
        summary: 'project overview',
        content: 'This is demo.',
        routing: { tier: 'always' },
        tokenCost: 5,
        tags: [],
        provenance,
      },
      {
        id: 'api-conventions',
        topic: 'API conventions',
        summary: 'API handler conventions',
        content: 'Handlers under src/api/** export default function.',
        routing: { tier: 'glob', globs: ['src/api/**/*.ts'] },
        tokenCost: 10,
        tags: [],
        provenance,
      },
      {
        id: 'auth-flow',
        topic: 'Auth flow',
        summary: 'How auth works',
        content: 'OAuth via Clerk.',
        routing: {
          tier: 'agent-decided',
          triggerKeywords: ['auth', 'oauth'],
          whenToUse: 'When touching auth code.',
        },
        tokenCost: 5,
        tags: [],
        provenance,
      },
      {
        id: 'arch-deep',
        topic: 'Arch deep',
        summary: 'long arch',
        content: 'detailed...',
        routing: { tier: 'reference', indexedAs: 'docs/architecture.md' },
        tokenCost: 50,
        tags: [],
        provenance,
      },
      {
        id: 'history',
        topic: 'History',
        summary: 'history doc',
        content: 'historical context',
        routing: { tier: 'user-invoked', command: '/history' },
        tokenCost: 10,
        tags: [],
        provenance,
      },
    ],
    workflows: [
      {
        id: 'deploy',
        name: 'Deploy',
        description: 'deploy steps',
        trigger: { command: '/deploy' },
        body: '1. test\n2. ship',
        adapterSupport: ['claude-code'],
        provenance,
      },
    ],
    agents: [
      {
        id: 'sec',
        name: 'Security reviewer',
        purpose: 'audit',
        whenToInvoke: 'before merge',
        toolPolicy: {},
        systemPrompt: 'You audit code.',
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
    ],
    targets: [],
  };
}

describe('cursorAdapter', () => {
  it('renders always-tier as MDC with alwaysApply: true', () => {
    const r = cursorAdapter.render(fixtureIR());
    const mdc = r.files.find((f) => f.path === '.cursor/rules/overview.mdc');
    expect(mdc?.content).toContain('alwaysApply: true');
    expect(mdc?.content).toContain('description: project overview');
  });

  it('renders glob-tier with native globs (no emulation warning)', () => {
    const r = cursorAdapter.render(fixtureIR());
    const mdc = r.files.find((f) => f.path === '.cursor/rules/api-conventions.mdc');
    expect(mdc?.content).toContain('globs: src/api/**/*.ts');
    expect(mdc?.content).toContain('alwaysApply: false');
    // Cursor's native globs are first-class — no warning about emulation
    expect(r.warnings.join('\n')).not.toMatch(/glob/iu);
  });

  it('renders agent-decided with description + alwaysApply: false', () => {
    const r = cursorAdapter.render(fixtureIR());
    const mdc = r.files.find((f) => f.path === '.cursor/rules/auth-flow.mdc');
    expect(mdc?.content).toContain('alwaysApply: false');
    expect(mdc?.content).toContain('When touching auth code.');
    expect(mdc?.content).toContain('Triggers: auth, oauth');
  });

  it('writes reference units to indexedAs path', () => {
    const r = cursorAdapter.render(fixtureIR());
    expect(r.files.some((f) => f.path === 'docs/architecture.md')).toBe(true);
  });

  it('demotes user-invoked knowledge and emits a warning', () => {
    const r = cursorAdapter.render(fixtureIR());
    expect(r.files.some((f) => f.path === 'docs/commands/history.md')).toBe(true);
    expect(r.warnings.some((w) => w.includes('user-invoked'))).toBe(true);
  });

  it('warns when skipping workflows and subagent specs', () => {
    const r = cursorAdapter.render(fixtureIR());
    expect(r.warnings.some((w) => w.includes('workflow'))).toBe(true);
    expect(r.warnings.some((w) => w.includes('subagent'))).toBe(true);
  });

  it('emits .cursorignore', () => {
    const r = cursorAdapter.render(fixtureIR());
    const ig = r.files.find((f) => f.path === '.cursorignore');
    expect(ig?.content).toContain('node_modules/**');
  });

  it('reports alwaysLoadedTokens reflecting alwaysApply units only', () => {
    const r = cursorAdapter.render(fixtureIR());
    expect(r.alwaysLoadedTokens).toBeGreaterThan(0);
  });
});
