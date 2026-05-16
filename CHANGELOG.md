# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial project scaffolding (TypeScript, tsup, vitest, biome).
- IR schemas and types (zod-first, discriminated routing union).
- IR disk I/O (yaml index + tiered markdown layout).
- Tokenizer (tiktoken-cl100k + anthropic-approx) and budget enforcer.
- Project scanner with detectors (package-json, monorepo, existing-configs, default-ignores).
- CLAUDE.md migrator parser using remark.
- Tier classifier with explainable heuristics.
- Adapters for Claude Code and Cursor.
- CLI: `migrate`, `analyze`, `sync`, `init`, `list-targets`.
- README, architecture doc, IR spec.
