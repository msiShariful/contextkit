import { basename } from 'node:path';
import type { IgnoreRule, ProjectMeta } from '../ir/types.js';
import { DEFAULT_DETECTORS } from './detectors/index.js';
import type { Detector, Evidence, ExistingConfig, ScanResult } from './types.js';
import { type WalkOptions, buildFileIndex } from './walk.js';

export type ScanOptions = WalkOptions & {
  detectors?: Detector[];
};

export async function scanProject(rootDir: string, options: ScanOptions = {}): Promise<ScanResult> {
  const index = await buildFileIndex(rootDir, options);
  const detectors = options.detectors ?? DEFAULT_DETECTORS;

  const results = await Promise.all(detectors.map((d) => Promise.resolve(d.detect(index))));

  const partials: Partial<ProjectMeta>[] = [];
  const ignores: IgnoreRule[] = [];
  const existingConfigs: ExistingConfig[] = [];
  const evidence: Evidence[] = [];

  for (const r of results) {
    if (r.meta) partials.push(r.meta);
    if (r.ignores) ignores.push(...r.ignores);
    if (r.existingConfigs) existingConfigs.push(...r.existingConfigs);
    if (r.evidence) evidence.push(...r.evidence);
  }

  const meta = mergeMeta(rootDir, partials);
  return {
    rootDir,
    meta,
    ignores: dedupeIgnores(ignores),
    existingConfigs,
    evidence,
  };
}

function mergeMeta(rootDir: string, partials: Partial<ProjectMeta>[]): ProjectMeta {
  const meta: ProjectMeta = {
    name: basename(rootDir),
    stack: {
      languages: [],
      frameworks: [],
      packageManager: 'unknown',
      testRunners: [],
    },
    layout: {
      monorepo: false,
      srcRoots: ['src'],
      testRoots: ['tests'],
    },
  };

  const languages = new Set<string>();
  const frameworks = new Map<string, ProjectMeta['stack']['frameworks'][number]>();
  const testRunners = new Set<string>();
  const databases = new Set<string>();
  const deployment = new Set<string>();
  const workspaces = new Set<string>();

  for (const p of partials) {
    if (p.name) meta.name = p.name;
    if (p.oneLiner) meta.oneLiner = p.oneLiner;
    if (p.nonGoals) meta.nonGoals = p.nonGoals;
    if (p.stack) {
      for (const l of p.stack.languages ?? []) languages.add(l);
      for (const f of p.stack.frameworks ?? []) frameworks.set(f.name, f);
      for (const t of p.stack.testRunners ?? []) testRunners.add(t);
      for (const d of p.stack.databases ?? []) databases.add(d);
      for (const d of p.stack.deployment ?? []) deployment.add(d);
      if (p.stack.packageManager && p.stack.packageManager !== 'unknown') {
        meta.stack.packageManager = p.stack.packageManager;
      }
    }
    if (p.layout) {
      if (p.layout.monorepo) meta.layout.monorepo = true;
      for (const w of p.layout.workspaces ?? []) workspaces.add(w);
      if (p.layout.srcRoots?.length) meta.layout.srcRoots = p.layout.srcRoots;
      if (p.layout.testRoots?.length) meta.layout.testRoots = p.layout.testRoots;
    }
  }

  meta.stack.languages = [...languages];
  meta.stack.frameworks = [...frameworks.values()];
  meta.stack.testRunners = [...testRunners];
  if (databases.size > 0) meta.stack.databases = [...databases];
  if (deployment.size > 0) meta.stack.deployment = [...deployment];
  if (workspaces.size > 0) meta.layout.workspaces = [...workspaces];

  return meta;
}

function dedupeIgnores(rules: IgnoreRule[]): IgnoreRule[] {
  const seen = new Map<string, IgnoreRule>();
  for (const r of rules) {
    const key = `${r.pattern}::${Array.isArray(r.appliesTo) ? r.appliesTo.join(',') : r.appliesTo}`;
    if (!seen.has(key)) seen.set(key, r);
  }
  return [...seen.values()];
}

export * from './types.js';
export * from './detectors/index.js';
export { buildFileIndex } from './walk.js';
