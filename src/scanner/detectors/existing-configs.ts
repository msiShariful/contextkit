import type { TargetId } from '../../ir/types.js';
import type { Detector, DetectorResult, ExistingConfig, ExistingConfigKind } from '../types.js';

type ConfigSpec = {
  kind: ExistingConfigKind;
  target: TargetId | 'unknown';
  match: (path: string) => boolean;
};

const SPECS: ConfigSpec[] = [
  { kind: 'claude-md', target: 'claude-code', match: (p) => p === 'CLAUDE.md' },
  {
    kind: 'claude-skill',
    target: 'claude-code',
    match: (p) => p.startsWith('.claude/skills/') && p.endsWith('.md'),
  },
  {
    kind: 'claude-command',
    target: 'claude-code',
    match: (p) => p.startsWith('.claude/commands/') && p.endsWith('.md'),
  },
  { kind: 'cursorrules', target: 'cursor', match: (p) => p === '.cursorrules' },
  {
    kind: 'cursor-mdc',
    target: 'cursor',
    match: (p) => p.startsWith('.cursor/rules/') && p.endsWith('.mdc'),
  },
  { kind: 'agents-md', target: 'codex', match: (p) => p === 'AGENTS.md' },
  { kind: 'windsurfrules', target: 'windsurf', match: (p) => p === '.windsurfrules' },
  { kind: 'aider-conf', target: 'aider', match: (p) => p === '.aider.conf.yml' },
  { kind: 'continuerules', target: 'continue', match: (p) => p === '.continuerules' },
  { kind: 'clinerules', target: 'cline', match: (p) => p === '.clinerules' },
];

export const existingConfigsDetector: Detector = {
  name: 'existing-configs',
  detect(index): DetectorResult {
    const buckets = new Map<string, ExistingConfig>();
    for (const path of index.files.keys()) {
      for (const spec of SPECS) {
        if (!spec.match(path)) continue;
        const key = `${spec.target}:${spec.kind}`;
        const existing = buckets.get(key);
        if (existing) {
          existing.paths.push(path);
        } else {
          buckets.set(key, { kind: spec.kind, target: spec.target, paths: [path] });
        }
      }
    }
    const existingConfigs = [...buckets.values()].map((cfg) => ({
      ...cfg,
      paths: [...cfg.paths].sort(),
    }));
    return { existingConfigs };
  },
};
