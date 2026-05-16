import { describe, expect, it } from 'vitest';
import { enforce, formatReport } from '../../src/budget/enforcer.js';
import { DEFAULT_BUDGETS } from '../../src/ir/schema.js';
import type { ProjectIR } from '../../src/ir/types.js';

const baseMeta = {
  name: 'demo',
  stack: {
    languages: [],
    frameworks: [],
    packageManager: 'unknown' as const,
    testRunners: [],
  },
  layout: { monorepo: false, srcRoots: ['src'], testRoots: ['tests'] },
};

function ir(overrides: Partial<ProjectIR> = {}): ProjectIR {
  return {
    schemaVersion: '1',
    meta: baseMeta,
    budgets: DEFAULT_BUDGETS,
    knowledge: [],
    workflows: [],
    agents: [],
    ignores: [],
    targets: [],
    ...overrides,
  };
}

const provenance = { origin: 'manual' as const, confidence: 'high' as const };

describe('enforce', () => {
  it('returns ok for an empty IR', () => {
    const report = enforce(ir());
    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.eager).toBe(0);
  });

  it('flags an oversized always-loaded unit (deterministic via approx tokenizer)', () => {
    // approx: chars / 3.5 → 350 chars ≈ 100 tokens
    const content = 'x'.repeat(350);
    const report = enforce(
      ir({
        budgets: {
          alwaysLoaded: { max: 50, warn: 25 },
          perGlobScope: { max: 1000, warn: 500 },
          perSkill: { max: 1000, warn: 500 },
          totalEager: { max: 60 },
          tokenizer: 'anthropic-approx',
        },
        knowledge: [
          {
            id: 'huge',
            topic: 't',
            summary: 's',
            content,
            routing: { tier: 'always' },
            tokenCost: 0,
            tags: [],
            provenance,
          },
        ],
      }),
    );
    expect(report.errors.some((e) => e.rule === 'always-loaded-cap')).toBe(true);
    expect(report.errors.some((e) => e.rule === 'total-eager-cap')).toBe(true);
    expect(report.ok).toBe(false);
  });

  it('warns when between warn and max', () => {
    // approx tokens for 35-char content = 10. Budgets: warn=5, max=20.
    const content = 'x'.repeat(35);
    const report = enforce(
      ir({
        budgets: {
          alwaysLoaded: { max: 20, warn: 5 },
          perGlobScope: { max: 1000, warn: 500 },
          perSkill: { max: 1000, warn: 500 },
          totalEager: { max: 1000 },
          tokenizer: 'anthropic-approx',
        },
        knowledge: [
          {
            id: 'warnme',
            topic: 't',
            summary: 's',
            content,
            routing: { tier: 'always' },
            tokenCost: 0,
            tags: [],
            provenance,
          },
        ],
      }),
    );
    expect(report.warnings.some((w) => w.rule === 'always-loaded-cap')).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('attributes glob-scope cost per individual glob', () => {
    const cheapContent = 'short content';
    const report = enforce(
      ir({
        budgets: {
          ...DEFAULT_BUDGETS,
          perGlobScope: { max: 1, warn: 1 }, // tiny cap to force a violation
        },
        knowledge: [
          {
            id: 'one',
            topic: 't',
            summary: 's',
            content: cheapContent,
            routing: { tier: 'glob', globs: ['src/api/**', 'src/db/**'] },
            tokenCost: 0,
            tags: [],
            provenance,
          },
        ],
      }),
    );
    const errorScopes = report.errors
      .filter((e) => e.rule === 'glob-scope-cap')
      .map((e) => e.scope);
    expect(errorScopes).toEqual(expect.arrayContaining(['src/api/**', 'src/db/**']));
  });

  it('separates eager (always+glob) from reference', () => {
    const content = 'small'.repeat(10);
    const report = enforce(
      ir({
        knowledge: [
          {
            id: 'eager',
            topic: 't',
            summary: 's',
            content,
            routing: { tier: 'always' },
            tokenCost: 0,
            tags: [],
            provenance,
          },
          {
            id: 'lazy',
            topic: 't',
            summary: 's',
            content: 'a much longer body that should not count as eager at all'.repeat(10),
            routing: { tier: 'reference', indexedAs: 'docs/x.md' },
            tokenCost: 0,
            tags: [],
            provenance,
          },
        ],
      }),
    );
    expect(report.perTier.always).toBeGreaterThan(0);
    expect(report.perTier.reference).toBeGreaterThan(0);
    expect(report.eager).toBe(report.perTier.always + report.perTier.glob);
    expect(report.eager).toBeLessThan(report.perTier.reference);
  });

  it('respects the approx tokenizer when configured on the IR', () => {
    const report = enforce(
      ir({
        budgets: { ...DEFAULT_BUDGETS, tokenizer: 'anthropic-approx' },
      }),
    );
    expect(report.tokenizer).toBe('anthropic-approx');
  });
});

describe('formatReport', () => {
  it('renders an OK summary cleanly', () => {
    const out = formatReport(enforce(ir()));
    expect(out).toContain('Tokenizer:');
    expect(out).toContain('Per-tier totals:');
    expect(out).toContain('Budget OK');
  });
});
