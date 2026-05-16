# IR specification (v1)

The `contextkit` intermediate representation is a tree of typed objects, persisted as a YAML index plus per-document markdown files.

Authoritative definitions: [`src/ir/schema.ts`](../src/ir/schema.ts). This document describes the same shapes in prose.

## Top-level shape

```ts
type ProjectIR = {
  schemaVersion: '1';
  meta: ProjectMeta;
  budgets: TokenBudgets;
  knowledge: KnowledgeUnit[];
  workflows: Workflow[];
  agents: SubagentSpec[];
  ignores: IgnoreRule[];
  targets: TargetConfig[];
};
```

## Tiers

Every `KnowledgeUnit` has a `routing` whose tier determines how expensively it loads.

| Tier | Loads when… | Cost |
| --- | --- | --- |
| `always` | every turn | 💸💸💸 |
| `glob` | a matching file is in context | 💸💸 |
| `agent-decided` | the LLM matches the description | 💸 (one-shot) |
| `user-invoked` | a slash command fires | 💸 (one-shot) |
| `reference` | the agent explicitly `Read`s the file | 0 (only the read) |

The classifier defaults to `agent-decided` when no stronger signal is present. The tool prefers to demote rather than promote.

## KnowledgeUnit fields

```ts
type KnowledgeUnit = {
  id: string;                              // stable, kebab-case
  topic: string;
  summary: string;                          // ≤ 300 chars
  content: string;                          // markdown body
  routing: Routing;                         // discriminated by tier
  tokenCost: number;
  tags: string[];
  provenance: Provenance;
  adapterOverrides?: Partial<Record<TargetId, AdapterOverride>>;
};
```

`adapterOverrides` lets a single unit render differently across targets — e.g., demoted to a reference doc on Cursor when it's a slash command on Claude.

## Routing variants

```ts
type Routing =
  | { tier: 'always' }
  | { tier: 'glob'; globs: string[]; antiGlobs?: string[] }
  | { tier: 'agent-decided'; triggerKeywords: string[]; whenToUse: string; whenNotToUse?: string }
  | { tier: 'user-invoked'; command: string }
  | { tier: 'reference'; indexedAs: string };
```

- `glob.globs`: at least one pattern. Each pattern is its own loading scope for budget purposes (a unit listing N globs contributes its cost to N scopes).
- `agent-decided.whenToUse`: 1–2 sentences. **This is the description the LLM reads** when deciding to load — quality here is the difference between a skill that gets used and one that's invisible.
- `user-invoked.command`: must look like `/kebab-case`.
- `reference.indexedAs`: relative path under the project root.

## Provenance

```ts
type Provenance = {
  origin: 'migration' | 'interview' | 'detection' | 'manual';
  source?: { file: string; lines?: [number, number] };
  detector?: string;
  interviewQuestion?: string;
  confidence: 'high' | 'medium' | 'low';
  lastReviewedAt?: string;   // ISO datetime
  reviewedBy?: string;
};
```

Provenance enables idempotent re-migration: re-running `contextkit migrate` should produce the same output for an unchanged source.

## TokenBudgets

```ts
type TokenBudgets = {
  alwaysLoaded:  { max: number; warn: number };
  perGlobScope:  { max: number; warn: number };
  perSkill:      { max: number; warn: number };
  totalEager:    { max: number };
  tokenizer: 'tiktoken-cl100k' | 'anthropic-approx';
};
```

Defaults: 800 / 1200 / 1500 / 3000 tokens respectively.

## On-disk layout

```
.contextkit/
├── contextkit.yaml             # meta + budgets + ignores + targets
├── knowledge/
│   ├── always/<id>.md
│   ├── glob/<id>.md
│   ├── agent-decided/<id>.md
│   ├── user-invoked/<id>.md
│   └── reference/<id>.md
├── workflows/<id>.md
└── agents/<id>.md
```

Each `.md` file has YAML frontmatter that mirrors all `KnowledgeUnit` (or `Workflow` / `SubagentSpec`) fields except `content` (which is the body) and `body` / `systemPrompt` (which are the body for workflows and agents respectively).

Example knowledge unit on disk:

```markdown
---
id: db-migrations
topic: Database migrations
summary: How to author, review, and run schema migrations safely
routing:
  tier: agent-decided
  triggerKeywords: [migration, schema, drizzle]
  whenToUse: Use when changing the database schema.
tags: [database]
tokenCost: 412
provenance:
  origin: migration
  source: { file: CLAUDE.md }
  confidence: high
---

# Database migrations

Always run `drizzle-kit generate` first. Never rename columns in place.
```

## Schema evolution

`schemaVersion: '1'` is a literal type. Future versions will bump this and provide a migration script (`contextkit upgrade-schema`). The current loader rejects any other value with a clear error.
