import type { IgnoreRule } from '../../ir/types.js';
import type { Detector, DetectorResult } from '../types.js';

type RuleSpec = {
  pattern: string;
  reason: IgnoreRule['reason'];
  ifFile?: string;
};

const ALWAYS: RuleSpec[] = [
  { pattern: 'node_modules/**', reason: 'build-artifact' },
  { pattern: 'dist/**', reason: 'build-artifact' },
  { pattern: 'build/**', reason: 'build-artifact' },
  { pattern: 'coverage/**', reason: 'build-artifact' },
  { pattern: '*.log', reason: 'build-artifact' },
  { pattern: '.DS_Store', reason: 'build-artifact' },
  { pattern: '.env', reason: 'secrets' },
  { pattern: '.env.*', reason: 'secrets' },
];

const CONDITIONAL: RuleSpec[] = [
  { pattern: 'package-lock.json', reason: 'lockfile', ifFile: 'package-lock.json' },
  { pattern: 'pnpm-lock.yaml', reason: 'lockfile', ifFile: 'pnpm-lock.yaml' },
  { pattern: 'yarn.lock', reason: 'lockfile', ifFile: 'yarn.lock' },
  { pattern: 'bun.lockb', reason: 'lockfile', ifFile: 'bun.lockb' },
  { pattern: '.next/**', reason: 'build-artifact', ifFile: 'next.config.js' },
  { pattern: '.nuxt/**', reason: 'build-artifact', ifFile: 'nuxt.config.ts' },
  { pattern: 'target/**', reason: 'build-artifact', ifFile: 'Cargo.toml' },
];

export const defaultIgnoresDetector: Detector = {
  name: 'default-ignores',
  detect(index): DetectorResult {
    const ignores: IgnoreRule[] = ALWAYS.map((r) => ({
      pattern: r.pattern,
      reason: r.reason,
      source: 'detected' as const,
      appliesTo: 'all' as const,
    }));

    for (const r of CONDITIONAL) {
      if (r.ifFile && (index.files.has(r.ifFile) || globExists(index, r.ifFile))) {
        ignores.push({
          pattern: r.pattern,
          reason: r.reason,
          source: 'detected',
          appliesTo: 'all',
        });
      }
    }

    return { ignores };
  },
};

function globExists(index: { files: Map<string, unknown> }, simpleName: string): boolean {
  // Cheap check: look for variants like `next.config.{js,ts,mjs}` etc.
  if (simpleName.startsWith('next.config')) {
    return (
      index.files.has('next.config.js') ||
      index.files.has('next.config.ts') ||
      index.files.has('next.config.mjs')
    );
  }
  if (simpleName.startsWith('nuxt.config')) {
    return index.files.has('nuxt.config.ts') || index.files.has('nuxt.config.js');
  }
  return false;
}
