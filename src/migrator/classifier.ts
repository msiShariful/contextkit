import type { KnowledgeUnit, Provenance, Routing, Tier, Workflow } from '../ir/types.js';
import type { RawSection } from './types.js';

export type ClassificationNote = {
  sectionId: string;
  topic: string;
  tier: Tier | 'workflow';
  reason: string;
  /** Other tiers that were close runners-up, with explanations. */
  alternatives: Array<{ tier: Tier | 'workflow'; reason: string }>;
};

export type ClassificationResult = {
  knowledge: KnowledgeUnit[];
  workflows: Workflow[];
  notes: ClassificationNote[];
};

export type ClassifyOptions = {
  /** Source path embedded in provenance.source.file. Defaults to 'CLAUDE.md'. */
  sourcePath?: string;
  /** Token threshold above which a section is demoted to reference. Default 600. */
  referenceThresholdTokens?: number;
  /** Token threshold above which a section can be "always". Default 200. */
  alwaysMaxTokens?: number;
};

const IMPERATIVE_VERBS = new Set([
  'deploy',
  'release',
  'run',
  'test',
  'fix',
  'migrate',
  'build',
  'generate',
  'add',
  'remove',
  'create',
  'sync',
  'push',
  'pull',
  'rebase',
  'merge',
  'install',
  'update',
  'rollback',
  'restart',
  'publish',
  'ship',
]);

const OVERVIEW_HINTS = [
  'overview',
  'introduction',
  'about',
  'project',
  'what is this',
  'what this is',
  'goals',
  'purpose',
  'summary',
  'tl;dr',
];

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'this',
  'that',
  'when',
  'where',
  'into',
  'from',
  'using',
  'use',
  'guide',
  'docs',
  'doc',
  'how',
  'why',
  'what',
  'should',
  'must',
]);

export function classify(
  sections: RawSection[],
  options: ClassifyOptions = {},
): ClassificationResult {
  const sourcePath = options.sourcePath ?? 'CLAUDE.md';
  const referenceThreshold = options.referenceThresholdTokens ?? 600;
  const alwaysMaxTokens = options.alwaysMaxTokens ?? 200;

  const knowledge: KnowledgeUnit[] = [];
  const workflows: Workflow[] = [];
  const notes: ClassificationNote[] = [];

  for (const section of sections) {
    const decision = decide(section, { referenceThreshold, alwaysMaxTokens });
    notes.push({
      sectionId: section.id,
      topic: section.heading,
      tier: decision.kind === 'workflow' ? 'workflow' : decision.routing.tier,
      reason: decision.reason,
      alternatives: decision.alternatives,
    });

    const prov: Provenance = {
      origin: 'migration',
      source: { file: sourcePath },
      confidence: decision.confidence,
    };

    if (decision.kind === 'workflow') {
      workflows.push({
        id: section.id,
        name: section.heading,
        description: summarize(section),
        trigger: { command: `/${section.id}` },
        body: section.body,
        adapterSupport: ['claude-code'],
        provenance: prov,
      });
      continue;
    }

    knowledge.push({
      id: section.id,
      topic: section.heading,
      summary: summarize(section),
      content: section.body,
      routing: decision.routing,
      tokenCost: section.tokenBudgetHint,
      tags: deriveTags(section),
      provenance: prov,
    });
  }

  return { knowledge, workflows, notes };
}

type Decision =
  | {
      kind: 'workflow';
      reason: string;
      confidence: Provenance['confidence'];
      alternatives: ClassificationNote['alternatives'];
    }
  | {
      kind: 'knowledge';
      routing: Routing;
      reason: string;
      confidence: Provenance['confidence'];
      alternatives: ClassificationNote['alternatives'];
    };

type DecideThresholds = { referenceThreshold: number; alwaysMaxTokens: number };

function decide(section: RawSection, t: DecideThresholds): Decision {
  const alternatives: ClassificationNote['alternatives'] = [];

  if (looksLikeWorkflow(section)) {
    return {
      kind: 'workflow',
      reason: 'heading starts with imperative verb and body has a numbered step list',
      confidence: 'high',
      alternatives,
    };
  }

  if (section.tokenBudgetHint > t.referenceThreshold) {
    alternatives.push({
      tier: 'agent-decided',
      reason: 'could be split into smaller skills',
    });
    return {
      kind: 'knowledge',
      routing: { tier: 'reference', indexedAs: `docs/${section.id}.md` },
      reason: `body exceeds reference threshold (~${section.tokenBudgetHint} > ${t.referenceThreshold} tokens)`,
      confidence: 'medium',
      alternatives,
    };
  }

  const globs = extractGlobs(section);
  if (globs.length > 0) {
    alternatives.push({
      tier: 'agent-decided',
      reason: 'could load via skill description instead',
    });
    return {
      kind: 'knowledge',
      routing: { tier: 'glob', globs },
      reason: `body contains explicit path/glob patterns: ${globs.join(', ')}`,
      confidence: 'high',
      alternatives,
    };
  }

  if (looksLikeOverview(section, t.alwaysMaxTokens)) {
    alternatives.push({ tier: 'agent-decided', reason: 'could be deferred to when needed' });
    return {
      kind: 'knowledge',
      routing: { tier: 'always' },
      reason: 'short top-level overview/setup content',
      confidence: 'medium',
      alternatives,
    };
  }

  const triggerKeywords = deriveTriggerKeywords(section);
  return {
    kind: 'knowledge',
    routing: {
      tier: 'agent-decided',
      triggerKeywords,
      whenToUse: summarize(section),
    },
    reason: 'topic-specific content with no clear file scope — default to agent-decided skill',
    confidence: 'medium',
    alternatives,
  };
}

function looksLikeWorkflow(section: RawSection): boolean {
  const firstWord = section.heading.trim().split(/\s+/u)[0]?.toLowerCase();
  if (!firstWord || !IMPERATIVE_VERBS.has(firstWord.replace(/[^a-z]/gu, ''))) return false;
  return /^\s*\d+\.\s+/mu.test(section.body);
}

function looksLikeOverview(section: RawSection, maxTokens: number): boolean {
  if (section.depth > 2) return false;
  if (section.tokenBudgetHint > maxTokens) return false;
  const lower = section.heading.toLowerCase();
  return OVERVIEW_HINTS.some((h) => lower.includes(h));
}

function summarize(section: RawSection): string {
  const firstLine =
    section.body
      .split('\n')
      .find((l) => l.trim().length > 0)
      ?.trim() ?? '';
  const trimmed = firstLine.replace(/^[#>*\-+\s]+/u, '').slice(0, 240);
  return trimmed.length > 0 ? trimmed : section.heading;
}

function deriveTriggerKeywords(section: RawSection): string[] {
  const head = section.heading
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  return [...new Set(head)].slice(0, 6);
}

function deriveTags(section: RawSection): string[] {
  const tags = new Set<string>();
  for (const ext of Object.keys(section.signals.fileExtensions)) tags.add(ext);
  if (section.signals.hasCodeFences) tags.add('has-code');
  if (section.depth <= 2) tags.add('top-level');
  return [...tags];
}

const PATH_GLOB_RE = /(\*\*\/[\w*./{},-]+|[a-z][\w-]+(?:\/[\w*./{},-]+)+)/gu;

function extractGlobs(section: RawSection): string[] {
  const globs = new Set<string>();
  for (const match of section.body.matchAll(PATH_GLOB_RE)) {
    let pattern = match[1];
    if (!pattern) continue;
    // Bare path like `src/api` → glob the directory.
    if (!pattern.includes('*') && !pattern.includes('.')) {
      pattern = `${pattern.replace(/\/$/u, '')}/**`;
    }
    // Skip patterns that are too generic to be useful (single-segment without **/*).
    if (pattern.split('/').length < 2) continue;
    globs.add(pattern);
  }
  return [...globs].sort();
}
