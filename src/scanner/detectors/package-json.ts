import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ProjectMeta } from '../../ir/types.js';
import type { Detector, DetectorResult } from '../types.js';

type PkgFrameworkSpec = {
  name: string;
  matches: (deps: Set<string>) => boolean;
  language?: string;
};

// Order matters: more specific frameworks first so we attribute correctly.
const FRAMEWORKS: PkgFrameworkSpec[] = [
  { name: 'next', matches: (d) => d.has('next'), language: 'typescript' },
  { name: 'nuxt', matches: (d) => d.has('nuxt') || d.has('nuxt3'), language: 'typescript' },
  { name: 'remix', matches: (d) => d.has('@remix-run/react'), language: 'typescript' },
  { name: 'astro', matches: (d) => d.has('astro'), language: 'typescript' },
  { name: 'sveltekit', matches: (d) => d.has('@sveltejs/kit'), language: 'typescript' },
  { name: 'solid-start', matches: (d) => d.has('solid-start') || d.has('@solidjs/start') },
  { name: 'vite', matches: (d) => d.has('vite') },
  { name: 'webpack', matches: (d) => d.has('webpack') },
  { name: 'tsup', matches: (d) => d.has('tsup') },
  { name: 'react', matches: (d) => d.has('react') },
  { name: 'vue', matches: (d) => d.has('vue') },
  { name: 'svelte', matches: (d) => d.has('svelte') },
  { name: 'solid-js', matches: (d) => d.has('solid-js') },
  { name: 'nestjs', matches: (d) => d.has('@nestjs/core'), language: 'typescript' },
  { name: 'express', matches: (d) => d.has('express') },
  { name: 'fastify', matches: (d) => d.has('fastify') },
  { name: 'hono', matches: (d) => d.has('hono') },
];

const TEST_RUNNERS = ['vitest', 'jest', 'mocha', 'ava', 'tap', 'playwright', '@playwright/test'];
const ORM_DBS: Array<{ dep: string; tag: string }> = [
  { dep: 'prisma', tag: 'prisma' },
  { dep: '@prisma/client', tag: 'prisma' },
  { dep: 'drizzle-orm', tag: 'drizzle' },
  { dep: 'kysely', tag: 'kysely' },
  { dep: 'mongoose', tag: 'mongodb' },
  { dep: 'pg', tag: 'postgres' },
  { dep: 'mysql2', tag: 'mysql' },
  { dep: 'better-sqlite3', tag: 'sqlite' },
];

export const packageJsonDetector: Detector = {
  name: 'package-json',
  async detect(index): Promise<DetectorResult> {
    if (!index.files.has('package.json')) return {};

    const pkgPath = join(index.rootDir, 'package.json');
    let pkg: Record<string, unknown>;
    try {
      const raw = await readFile(pkgPath, 'utf8');
      pkg = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {
        evidence: [{ detector: 'package-json', file: 'package.json', reason: 'unparseable' }],
      };
    }

    const deps = new Set<string>([
      ...Object.keys((pkg.dependencies as Record<string, string>) ?? {}),
      ...Object.keys((pkg.devDependencies as Record<string, string>) ?? {}),
      ...Object.keys((pkg.peerDependencies as Record<string, string>) ?? {}),
    ]);

    const detectedLanguages = new Set<string>(['javascript']);
    if (index.files.has('tsconfig.json') || deps.has('typescript')) {
      detectedLanguages.add('typescript');
    }

    const frameworks: NonNullable<ProjectMeta['stack']['frameworks']> = [];
    for (const spec of FRAMEWORKS) {
      if (spec.matches(deps)) {
        frameworks.push({
          name: spec.name,
          version: lookupVersion(pkg, spec.name),
          configFile: 'package.json',
          confidence: 'high',
        });
        if (spec.language) detectedLanguages.add(spec.language);
      }
    }

    const testRunners = TEST_RUNNERS.filter((r) => deps.has(r));

    const databases: string[] = [];
    for (const { dep, tag } of ORM_DBS) {
      if (deps.has(dep) && !databases.includes(tag)) databases.push(tag);
    }

    const meta: Partial<ProjectMeta> = {
      stack: {
        languages: [...detectedLanguages],
        frameworks,
        packageManager: detectPackageManager(index, pkg),
        testRunners,
        ...(databases.length > 0 ? { databases } : {}),
      },
    };
    if (typeof pkg.name === 'string') {
      meta.name = pkg.name;
    }

    return {
      meta,
      evidence: [{ detector: 'package-json', file: 'package.json', reason: 'parsed' }],
    };
  },
};

function detectPackageManager(
  index: { files: Map<string, unknown> },
  pkg: Record<string, unknown>,
): ProjectMeta['stack']['packageManager'] {
  if (index.files.has('pnpm-lock.yaml')) return 'pnpm';
  if (index.files.has('yarn.lock')) return 'yarn';
  if (index.files.has('bun.lockb') || index.files.has('bun.lock')) return 'bun';
  if (index.files.has('package-lock.json')) return 'npm';
  if (index.files.has('deno.json') || index.files.has('deno.jsonc')) return 'deno';
  if (typeof pkg.packageManager === 'string') {
    const head = pkg.packageManager.split('@')[0];
    switch (head) {
      case 'pnpm':
      case 'yarn':
      case 'npm':
      case 'bun':
        return head;
      default:
        return 'unknown';
    }
  }
  return 'unknown';
}

function lookupVersion(pkg: Record<string, unknown>, name: string): string | undefined {
  for (const group of ['dependencies', 'devDependencies', 'peerDependencies'] as const) {
    const map = pkg[group] as Record<string, string> | undefined;
    if (map && typeof map[name] === 'string') return map[name];
  }
  return undefined;
}
