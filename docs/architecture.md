# Architecture

`contextkit` is structured as a pipeline: scanners and parsers feed an intermediate representation (IR), and adapters render the IR to target-specific files.

```
                       ┌───────────────┐
  CLAUDE.md / etc ────▶│   migrator    │──┐
                       └───────────────┘  │
                                          ▼
  filesystem  ─────────▶ scanner ───▶  ProjectIR  ─────▶ adapter(claude-code)  ─▶ files
                                          ▲                     adapter(cursor)
                                          │                     adapter(...)
                                          └── budget enforcer (errors + warnings)
```

## Modules

- `src/ir/` — schemas (zod), TypeScript types derived via `z.infer`, disk I/O (yaml index + tiered markdown).
- `src/scanner/` — filesystem walker + pluggable detectors (`package-json`, `monorepo`, `existing-configs`, `default-ignores`).
- `src/migrator/` — markdown parser (remark) + tier classifier with explainable heuristics.
- `src/budget/` — tokenizer (js-tiktoken + approx) and per-tier / per-unit / global cap enforcement.
- `src/adapters/` — pure functions from IR to a list of files. One adapter per target.
- `src/commands/` — CLI surface; each command composes the modules above.

## Design choices

### Single source of truth: zod schemas

Schemas live in `src/ir/schema.ts`. TypeScript types in `src/ir/types.ts` are derived via `z.infer<typeof Schema>` so the runtime validator and compile-time types cannot drift.

### Discriminated `Routing` union

Every knowledge unit carries a `routing: Routing` whose discriminator is the tier. Each tier variant declares only the metadata that makes sense for it:

```ts
type Routing =
  | { tier: 'always' }
  | { tier: 'glob'; globs: string[]; antiGlobs?: string[] }
  | { tier: 'agent-decided'; triggerKeywords: string[]; whenToUse: string; whenNotToUse?: string }
  | { tier: 'user-invoked'; command: string }
  | { tier: 'reference'; indexedAs: string };
```

Adapters consume `Routing` via type-guarded narrowing, which makes it impossible to forget the tier-specific fields at write time.

### Pure adapters

`adapter.render(ir)` returns an in-memory `RenderResult { files, warnings, alwaysLoadedTokens }`. Writes go through `writeRendered(rootDir, result)`. This lets the test suite assert on output without touching the filesystem.

### Explainable classification

The migrator's classifier produces a `ClassificationNote` for every section:

```ts
{
  sectionId: 'db-migrations',
  topic: 'Database migrations',
  tier: 'agent-decided',
  reason: 'topic-specific content with no clear file scope — default to agent-decided skill',
  alternatives: [{ tier: 'always', reason: 'short enough to fit always-loaded' }],
}
```

Users can audit why their content landed where it did, and the `--dry-run` flag lets them inspect before any files change.

### Hybrid on-disk layout

The IR is split between one YAML index and many per-unit markdown files. The index holds global state (meta, budgets, ignores, targets). Each knowledge unit, workflow, and subagent lives in its own markdown file with YAML frontmatter — this makes diffs reviewable in git and lets users edit individual units without conflicts.

## Adding a target

1. Create `src/adapters/<id>/index.ts` implementing the `Adapter` interface.
2. Register it in `src/adapters/registry.ts`.
3. Extend `TargetIdSchema` in `src/ir/schema.ts`.
4. Add tests under `tests/adapters/<id>.test.ts` modeled on `cursor.test.ts`.

The adapter is responsible for:

- Mapping each tier to its target-native loading mechanism (or warning if the target lacks one).
- Filtering `ir.ignores` by `rule.appliesTo`.
- Applying `unit.adapterOverrides?.[target]` (skip / content / routing).
- Reporting `alwaysLoadedTokens` honestly so users can compare configs across targets.
