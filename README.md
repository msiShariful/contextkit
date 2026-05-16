# contextkit

[![npm version](https://img.shields.io/npm/v/contextkit.svg)](https://www.npmjs.com/package/contextkit)
[![CI](https://github.com/msiShariful/contextkit/actions/workflows/ci.yml/badge.svg)](https://github.com/msiShariful/contextkit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/node/v/contextkit.svg)](package.json)

> Token-efficient AI coding agent configuration. One source of truth, optimized output for Claude Code, Cursor, Codex, and more.

Most projects have a 700-line `CLAUDE.md` (or `.cursorrules`, or `AGENTS.md`) that loads on every turn. That's expensive — every conversation pays for context the agent rarely needs.

**`contextkit` reorganizes the same content into the cheapest tier each agent supports** — slim always-loaded essentials, glob-scoped rules, agent-decided skills, on-demand commands, and pure reference docs — and renders it to every target's native format from one source.

```
            ┌──► Claude Code   (CLAUDE.md + .claude/skills + .claude/commands)
IR ─────────┼──► Cursor        (.cursor/rules/*.mdc with native globs)
            ├──► Codex         (AGENTS.md)               [roadmap]
            ├──► Windsurf      (.windsurfrules)          [roadmap]
            └──► Aider, Continue, Cline, Antigravity     [roadmap]
```

## Install

```bash
npm install -g contextkit
# or run ad-hoc:
npx contextkit migrate
```

Requires Node ≥ 20.

## Quick start: migrate an existing CLAUDE.md

```bash
cd your-project
contextkit migrate
```

This:

1. Parses your `CLAUDE.md` into heading-bound sections.
2. Classifies each section into a loading tier (always / glob / agent-decided / user-invoked / reference) with explainable reasons.
3. Scans your project for languages, frameworks, package manager, and ignorable directories.
4. Writes the **IR** (intermediate representation) under `.contextkit/`.
5. Renders to every configured target — by default, **Claude Code** + **Cursor**.

You'll see a classification summary + budget report inline:

```
Classification summary:
  agent-decided    7
  always           1
  glob             3
  reference        2
  workflow         1

Budget check:
Tokenizer: tiktoken-cl100k

Per-tier totals:
  always              347 tokens
  glob                812 tokens
  agent-decided      4180 tokens
  user-invoked          0 tokens
  reference          6204 tokens
  eager (always+glob) 1159 tokens

✓ Budget OK
```

That `eager` number is what your agent pays *every turn*. Pre-migration, it was probably 5,000+; post-migration, the same content lives in cheaper tiers.

## Commands

| Command | What it does |
| --- | --- |
| `contextkit migrate` | Refactor `CLAUDE.md` (or `--source <path>`) into the IR and render to all targets |
| `contextkit analyze` | Report token cost of the current IR by tier and per-unit (`--json` for machine output) |
| `contextkit sync` | Re-render the IR to enabled targets (after you've edited it) |
| `contextkit init` | Greenfield IR from a project scan (no content invented — author manually) |
| `contextkit list-targets` | Show which adapters are implemented vs. on the roadmap |

Useful flags:

```bash
contextkit migrate --target claude-code           # render to one target only
contextkit migrate --target claude-code,cursor    # multiple
contextkit migrate --dry-run                      # parse + classify, no writes
contextkit analyze --json | jq .perTier           # machine-readable
contextkit sync --cwd path/to/project             # work in another directory
```

## How tiers map per target

The same `KnowledgeUnit` lands in different artifacts depending on the target. The adapter picks the cheapest native loading mechanism — that's the whole point.

| Tier | Claude Code | Cursor |
| --- | --- | --- |
| `always` | `CLAUDE.md` body | `.cursor/rules/<id>.mdc` with `alwaysApply: true` |
| `glob` | `.claude/skills/<id>.md` (emulated, with file-type cue in description — warning emitted) | `.cursor/rules/<id>.mdc` with native `globs:` field — first-class |
| `agent-decided` | `.claude/skills/<id>.md` with description | `.cursor/rules/<id>.mdc` with description (Agent Requested) |
| `user-invoked` | `.claude/commands/<id>.md` slash command | demoted to `docs/commands/<id>.md` (Cursor has no slash commands) |
| `reference` | written to `indexedAs` path (read on demand) | written to `indexedAs` path (read on demand) |

Workflows render to `.claude/commands/` on Claude; skipped on Cursor with a warning. Subagents are Claude-only.

## The IR on disk

```
.contextkit/
├── contextkit.yaml             # meta, budgets, targets, ignores
├── knowledge/
│   ├── always/                 # tiny — eager-load audit at a glance
│   │   └── project-overview.md
│   ├── glob/
│   │   └── api-conventions.md
│   ├── agent-decided/
│   │   ├── db-migrations.md
│   │   └── auth-flow.md
│   ├── user-invoked/
│   └── reference/
│       └── architecture.md
├── workflows/
│   └── deploy-staging.md
└── agents/
    └── security-reviewer.md
```

Each `.md` file is a knowledge unit with YAML frontmatter describing its routing, provenance, and tags — fully diff-friendly. See [docs/ir-spec.md](docs/ir-spec.md).

## Token-budget enforcement

`contextkit` ships aggressive defaults. Exceeding `max` produces an error; exceeding `warn` produces a warning.

| Tier | Default `warn` | Default `max` |
| --- | --- | --- |
| Always-loaded | 600 | 800 |
| Per glob scope | 900 | 1200 |
| Per skill | 1100 | 1500 |
| Total eager (always + glob) | — | 3000 |

Override via `.contextkit/contextkit.yaml` → `budgets:`.

## Programmatic use

Beyond the CLI, every layer is a library:

```ts
import { readIR, writeIR } from 'contextkit/ir';
import { enforce } from 'contextkit';
import { getAdapter } from 'contextkit/adapters';

const ir = await readIR(process.cwd());
const report = enforce(ir);
if (!report.ok) throw new Error('budget violation');

const rendered = getAdapter('cursor').render(ir);
console.log(`Cursor wants ${rendered.files.length} files`);
```

## Honest limits

- **Auto-classification is a starting point, not a final answer.** The tool moves content to the right *tier*; only you know whether a rule should also be split, merged, or rewritten. Review classification notes — they explain the reasoning, including runner-up tiers.
- **`init` does not invent content.** Greenfield projects get a scaffold and a prompt to fill in the institutional knowledge by hand. No AI-generated `CLAUDE.md` filler.
- **Token counts for Anthropic models are approximate.** `tiktoken-cl100k` is OpenAI's tokenizer; we use it as a calibrated proxy. For absolute accuracy on Claude, treat numbers as ±15%.
- **Direct edits to generated files drift from the IR.** Edit `.contextkit/` and run `contextkit sync`. A `sync --import-changes` to round-trip hand-edits back into the IR is on the roadmap.

## Roadmap

- `v0.2`: Codex adapter (`AGENTS.md`), Windsurf adapter (`.windsurfrules`)
- `v0.3`: `analyze --from-transcripts` reads `~/.claude/projects/*.jsonl` to flag always-loaded sections never referenced in real conversations
- `v0.4`: Aider, Continue, Cline, Antigravity adapters
- `v0.5`: bidirectional sync (parse generated files back into IR for direct-edit workflows)

## Contributing

Issues and PRs welcome. Adding an adapter is the easiest entry point:

1. Implement the `Adapter` interface from `src/adapters/base.ts`.
2. Register it in `src/adapters/registry.ts`.
3. Add it to `TargetIdSchema` in `src/ir/schema.ts`.
4. Write adapter tests modeled on `tests/adapters/cursor.test.ts`.

```bash
git clone https://github.com/msiShariful/contextkit
cd contextkit
npm install
npm run ci   # typecheck + lint + test + build
```

## License

[MIT](./LICENSE) © msiShariful
