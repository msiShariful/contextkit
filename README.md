# contextkit

> Token-efficient AI coding agent configuration. One source of truth → optimized configs for Claude Code, Cursor, Codex, and more.

**Status:** Pre-release (`v0.1.0` in development). Full README arrives with the first working CLI.

## Why

Most teams cram every rule, convention, and bit of project lore into a single 700+ line `CLAUDE.md` (or `.cursorrules`, or `AGENTS.md`) that loads on every turn. That's expensive.

`contextkit` reorganizes the same content into the *cheapest tier each agent supports* — slim always-loaded essentials, glob-scoped rules, agent-decided skills, on-demand commands, and pure reference docs — and renders it to every target's native format from one source.

## Coming in v0.1.0

- `contextkit migrate` — refactor an existing bloated `CLAUDE.md` into a tiered structure with measurable token savings.
- `contextkit analyze` — report the eager-load cost of your current setup.
- Adapters: **Claude Code**, **Cursor**.
- Roadmap: Codex, Windsurf, Aider, Continue, Cline, Antigravity.

## License

[MIT](./LICENSE) © msiShariful
