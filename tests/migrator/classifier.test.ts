import { describe, expect, it } from 'vitest';
import { isAgentDecided, isAlways, isGlobScoped, isReference } from '../../src/ir/types.js';
import { classify } from '../../src/migrator/classifier.js';
import { parseClaudeMd } from '../../src/migrator/parsers/claude-md.js';

function classifyText(text: string) {
  const parsed = parseClaudeMd(text);
  return classify(parsed.sections);
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`expected ${label} to be defined`);
  return value;
}

describe('classifier', () => {
  it('routes imperative + numbered list to workflow', () => {
    const r = classifyText(`# Project

## Deploy to staging

1. Run \`pnpm test\`
2. Push to staging branch
3. Wait for CI
`);
    expect(r.workflows.map((w) => w.id)).toContain('deploy-to-staging');
    const wf = r.workflows.find((w) => w.id === 'deploy-to-staging');
    expect(wf?.trigger.command).toBe('/deploy-to-staging');
    expect(wf?.adapterSupport).toEqual(['claude-code']);
  });

  it('does NOT classify imperative-verb headings without step lists as workflows', () => {
    const r = classifyText(`# Deploy

We deploy via Vercel automatically on push to main.
`);
    expect(r.workflows).toHaveLength(0);
  });

  it('routes very long sections to reference', () => {
    const longBody = 'paragraph. '.repeat(400); // ~4400 chars => ~1257 approx tokens
    const r = classifyText(`# Architecture deep dive\n\n${longBody}`);
    const u = required(
      r.knowledge.find((k) => k.id === 'architecture-deep-dive'),
      'architecture-deep-dive',
    );
    expect(isReference(u.routing)).toBe(true);
  });

  it('routes sections with explicit globs to glob tier', () => {
    const r = classifyText(`# Project

## API conventions

Files under \`src/api/**\` follow REST conventions.
Handlers in \`src/api/**/*.handler.ts\` export a default function.
`);
    const u = required(
      r.knowledge.find((k) => k.id === 'api-conventions'),
      'api-conventions',
    );
    expect(isGlobScoped(u.routing)).toBe(true);
    if (isGlobScoped(u.routing)) {
      expect(u.routing.globs).toEqual(expect.arrayContaining(['src/api/**']));
    }
  });

  it('routes short top-level overview to always', () => {
    const r = classifyText(`# contextkit

## Project overview

A short tool that does X.
`);
    const u = required(
      r.knowledge.find((k) => k.id === 'project-overview'),
      'project-overview',
    );
    expect(isAlways(u.routing)).toBe(true);
  });

  it('defaults to agent-decided for topic-specific content with no globs', () => {
    const r = classifyText(`# Project

## Auth flow

OAuth via Clerk. Sessions stored as JWT in httpOnly cookies.
Never store the access token in localStorage.
`);
    const u = required(
      r.knowledge.find((k) => k.id === 'auth-flow'),
      'auth-flow',
    );
    expect(isAgentDecided(u.routing)).toBe(true);
    if (isAgentDecided(u.routing)) {
      expect(u.routing.triggerKeywords).toEqual(expect.arrayContaining(['auth']));
      expect(u.routing.whenToUse.length).toBeGreaterThan(0);
    }
  });

  it('attaches migration provenance with sourcePath', () => {
    const r = classifyText('# Project\n\n## Auth\n\nSome auth content.\n');
    const u = r.knowledge.find((k) => k.id === 'auth');
    expect(u?.provenance.origin).toBe('migration');
    expect(u?.provenance.source?.file).toBe('CLAUDE.md');
  });

  it('emits classification notes with reasons and alternatives', () => {
    const r = classifyText(`# Project

## Deploy

1. step
2. step
`);
    const note = r.notes.find((n) => n.sectionId === 'deploy');
    expect(note?.tier).toBe('workflow');
    expect(note?.reason).toMatch(/imperative|step list/u);
  });

  it('respects custom thresholds', () => {
    // Override always max so that ~30 tokens still qualifies as always.
    const text = `# contextkit

## Project overview

Short description. About 100 chars only.
`;
    const parsed = parseClaudeMd(text);
    const r1 = classify(parsed.sections, { alwaysMaxTokens: 5 });
    const u1 = required(
      r1.knowledge.find((k) => k.id === 'project-overview'),
      'tight u1',
    );
    expect(isAlways(u1.routing)).toBe(false);

    const r2 = classify(parsed.sections, { alwaysMaxTokens: 500 });
    const u2 = required(
      r2.knowledge.find((k) => k.id === 'project-overview'),
      'loose u2',
    );
    expect(isAlways(u2.routing)).toBe(true);
  });
});
