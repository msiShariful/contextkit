import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BUDGETS,
  KnowledgeUnitSchema,
  ProjectIRSchema,
  RoutingSchema,
} from '../../src/ir/schema.js';
import { isAgentDecided, isGlobScoped, tierOf } from '../../src/ir/types.js';

const baseProvenance = {
  origin: 'manual' as const,
  confidence: 'high' as const,
};

describe('RoutingSchema', () => {
  it('accepts always tier with no extra fields', () => {
    expect(RoutingSchema.parse({ tier: 'always' })).toEqual({ tier: 'always' });
  });

  it('requires at least one glob for glob tier', () => {
    expect(() => RoutingSchema.parse({ tier: 'glob', globs: [] })).toThrow();
    expect(RoutingSchema.parse({ tier: 'glob', globs: ['src/**'] })).toMatchObject({
      tier: 'glob',
      globs: ['src/**'],
    });
  });

  it('requires whenToUse for agent-decided tier', () => {
    expect(() => RoutingSchema.parse({ tier: 'agent-decided', triggerKeywords: ['x'] })).toThrow();
    expect(
      RoutingSchema.parse({
        tier: 'agent-decided',
        triggerKeywords: ['migration'],
        whenToUse: 'Use when editing schema files.',
      }),
    ).toMatchObject({ tier: 'agent-decided' });
  });

  it('validates user-invoked command format', () => {
    expect(() => RoutingSchema.parse({ tier: 'user-invoked', command: 'no-slash' })).toThrow();
    expect(() => RoutingSchema.parse({ tier: 'user-invoked', command: '/Bad_Name' })).toThrow();
    expect(RoutingSchema.parse({ tier: 'user-invoked', command: '/deploy-staging' })).toMatchObject(
      { tier: 'user-invoked' },
    );
  });

  it('rejects unknown tiers', () => {
    expect(() => RoutingSchema.parse({ tier: 'bogus' })).toThrow();
  });
});

describe('KnowledgeUnitSchema', () => {
  it('rejects non-kebab-case ids', () => {
    expect(() =>
      KnowledgeUnitSchema.parse({
        id: 'Bad_Id',
        topic: 't',
        summary: 's',
        content: '',
        routing: { tier: 'always' },
        tokenCost: 0,
        tags: [],
        provenance: baseProvenance,
      }),
    ).toThrow();
  });

  it('rejects negative token costs', () => {
    expect(() =>
      KnowledgeUnitSchema.parse({
        id: 'ok',
        topic: 't',
        summary: 's',
        content: '',
        routing: { tier: 'always' },
        tokenCost: -1,
        tags: [],
        provenance: baseProvenance,
      }),
    ).toThrow();
  });

  it('round-trips a valid unit', () => {
    const unit = {
      id: 'db-migrations',
      topic: 'Database migrations',
      summary: 'How to author migrations safely.',
      content: '# Body',
      routing: {
        tier: 'agent-decided' as const,
        triggerKeywords: ['migration', 'schema'],
        whenToUse: 'When changing the database schema.',
      },
      tokenCost: 412,
      tags: ['database'],
      provenance: { origin: 'migration' as const, confidence: 'high' as const },
    };
    const parsed = KnowledgeUnitSchema.parse(unit);
    expect(tierOf(parsed)).toBe('agent-decided');
    expect(isAgentDecided(parsed.routing)).toBe(true);
    expect(isGlobScoped(parsed.routing)).toBe(false);
  });
});

describe('ProjectIRSchema', () => {
  it('parses a minimal IR with defaults', () => {
    const parsed = ProjectIRSchema.parse({
      schemaVersion: '1',
      meta: {
        name: 'demo',
        stack: {},
        layout: {},
      },
      budgets: DEFAULT_BUDGETS,
    });
    expect(parsed.knowledge).toEqual([]);
    expect(parsed.meta.stack.packageManager).toBe('unknown');
    expect(parsed.meta.layout.srcRoots).toEqual(['src']);
  });

  it('rejects schemaVersion other than "1"', () => {
    expect(() =>
      ProjectIRSchema.parse({
        schemaVersion: '2',
        meta: { name: 'demo', stack: {}, layout: {} },
        budgets: DEFAULT_BUDGETS,
      }),
    ).toThrow();
  });
});
