import { z } from 'zod';

/**
 * Targets that contextkit can render to. Each one has a corresponding adapter
 * under `src/adapters/<id>/`.
 */
export const TargetIdSchema = z.enum([
  'claude-code',
  'cursor',
  'codex',
  'windsurf',
  'aider',
  'continue',
  'cline',
  'antigravity',
]);

/**
 * The loading tier determines how expensive a knowledge unit is.
 * - `always`: loaded every turn (CLAUDE.md / always-apply MDC / AGENTS.md)
 * - `glob`: loaded only when matching files are in context
 * - `agent-decided`: LLM decides via description (Claude skills, Cursor agent-requested)
 * - `user-invoked`: only loaded when a slash command is invoked
 * - `reference`: never auto-loaded; the agent can Read() the file on demand
 */
export const TierSchema = z.enum(['always', 'glob', 'agent-decided', 'user-invoked', 'reference']);

const IdSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9-]*$/u, 'must be kebab-case');

const GlobSchema = z.string().min(1);

const ArgSpecSchema = z.object({
  name: z.string().min(1),
  required: z.boolean(),
  description: z.string(),
  pattern: z.string().optional(),
});

export const RoutingSchema = z.discriminatedUnion('tier', [
  z.object({ tier: z.literal('always') }),
  z.object({
    tier: z.literal('glob'),
    globs: z.array(GlobSchema).min(1),
    antiGlobs: z.array(GlobSchema).optional(),
  }),
  z.object({
    tier: z.literal('agent-decided'),
    triggerKeywords: z.array(z.string()).default([]),
    whenToUse: z.string().min(1),
    whenNotToUse: z.string().optional(),
  }),
  z.object({
    tier: z.literal('user-invoked'),
    command: z.string().regex(/^\/[a-z0-9][a-z0-9-]*$/u, 'must look like /kebab-case'),
    argSpec: z.array(ArgSpecSchema).optional(),
  }),
  z.object({
    tier: z.literal('reference'),
    indexedAs: z.string().min(1),
  }),
]);

export const ProvenanceSchema = z.object({
  origin: z.enum(['migration', 'interview', 'detection', 'manual']),
  source: z
    .object({
      file: z.string(),
      lines: z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]).optional(),
    })
    .optional(),
  detector: z.string().optional(),
  interviewQuestion: z.string().optional(),
  confidence: z.enum(['high', 'medium', 'low']),
  lastReviewedAt: z.string().datetime({ offset: true }).optional(),
  reviewedBy: z.string().optional(),
});

export const AdapterOverrideSchema = z.object({
  tier: TierSchema.optional(),
  routing: RoutingSchema.optional(),
  content: z.string().optional(),
  skip: z.boolean().optional(),
  note: z.string().optional(),
});

export const KnowledgeUnitSchema = z.object({
  id: IdSchema,
  topic: z.string().min(1),
  summary: z.string().min(1).max(300),
  content: z.string(),
  routing: RoutingSchema,
  tokenCost: z.number().int().nonnegative(),
  tags: z.array(z.string()).default([]),
  provenance: ProvenanceSchema,
  adapterOverrides: z.record(TargetIdSchema, AdapterOverrideSchema).optional(),
});

export const WorkflowSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  trigger: z.object({
    command: z.string().regex(/^\/[a-z0-9][a-z0-9-]*$/u),
    args: z.array(ArgSpecSchema).optional(),
  }),
  body: z.string(),
  permissions: z.array(z.string()).optional(),
  adapterSupport: z.array(TargetIdSchema).default([]),
  provenance: ProvenanceSchema,
});

export const SubagentSpecSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  purpose: z.string().min(1),
  whenToInvoke: z.string().min(1),
  toolPolicy: z.object({
    allow: z.array(z.string()).optional(),
    deny: z.array(z.string()).optional(),
  }),
  systemPrompt: z.string().min(1),
  provenance: ProvenanceSchema,
});

export const IgnoreRuleSchema = z.object({
  pattern: GlobSchema,
  reason: z.enum([
    'build-artifact',
    'generated',
    'secrets',
    'lockfile',
    'binary',
    'large-data',
    'vendored',
    'manual',
  ]),
  source: z.enum(['detected', 'manual']),
  appliesTo: z.union([z.literal('all'), z.array(TargetIdSchema).min(1)]).default('all'),
});

const PackageManagerSchema = z.enum([
  'npm',
  'pnpm',
  'yarn',
  'bun',
  'deno',
  'pip',
  'uv',
  'poetry',
  'cargo',
  'go',
  'unknown',
]);

const DetectedFrameworkSchema = z.object({
  name: z.string(),
  version: z.string().optional(),
  configFile: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
});

export const ProjectMetaSchema = z.object({
  name: z.string().min(1),
  oneLiner: z.string().optional(),
  nonGoals: z.array(z.string()).optional(),
  stack: z.object({
    languages: z.array(z.string()).default([]),
    frameworks: z.array(DetectedFrameworkSchema).default([]),
    packageManager: PackageManagerSchema.default('unknown'),
    testRunners: z.array(z.string()).default([]),
    databases: z.array(z.string()).optional(),
    deployment: z.array(z.string()).optional(),
  }),
  layout: z.object({
    monorepo: z.boolean().default(false),
    workspaces: z.array(z.string()).optional(),
    srcRoots: z.array(z.string()).default(['src']),
    testRoots: z.array(z.string()).default(['tests']),
  }),
});

export const TokenBudgetsSchema = z.object({
  alwaysLoaded: z.object({ max: z.number().int().positive(), warn: z.number().int().positive() }),
  perGlobScope: z.object({ max: z.number().int().positive(), warn: z.number().int().positive() }),
  perSkill: z.object({ max: z.number().int().positive(), warn: z.number().int().positive() }),
  totalEager: z.object({ max: z.number().int().positive() }),
  tokenizer: z.enum(['tiktoken-cl100k', 'anthropic-approx']).default('tiktoken-cl100k'),
});

export const TargetConfigSchema = z.object({
  target: TargetIdSchema,
  enabled: z.boolean().default(true),
  outputRoot: z.string().optional(),
  adapterVersion: z.string(),
  targetToolVersion: z.string().optional(),
  options: z.record(z.string(), z.unknown()).optional(),
});

export const ProjectIRSchema = z.object({
  schemaVersion: z.literal('1'),
  meta: ProjectMetaSchema,
  budgets: TokenBudgetsSchema,
  knowledge: z.array(KnowledgeUnitSchema).default([]),
  workflows: z.array(WorkflowSchema).default([]),
  agents: z.array(SubagentSpecSchema).default([]),
  ignores: z.array(IgnoreRuleSchema).default([]),
  targets: z.array(TargetConfigSchema).default([]),
});

/** Default budgets, opinionated and aggressive. Tune via `agentkit.yaml`. */
export const DEFAULT_BUDGETS = {
  alwaysLoaded: { max: 800, warn: 600 },
  perGlobScope: { max: 1200, warn: 900 },
  perSkill: { max: 1500, warn: 1100 },
  totalEager: { max: 3000 },
  tokenizer: 'tiktoken-cl100k' as const,
};
