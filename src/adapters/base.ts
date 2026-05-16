import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { AdapterOverride, KnowledgeUnit, ProjectIR, TargetId } from '../ir/types.js';

export type RenderOptions = {
  /** Override outputRoot from the target config. Defaults to current working dir. */
  outputRoot?: string;
};

export type RenderedFile = {
  path: string;
  content: string;
  tokenCost: number;
};

export type RenderResult = {
  target: TargetId;
  adapterVersion: string;
  files: RenderedFile[];
  warnings: string[];
  /** Tokens that load eagerly on every turn (CLAUDE.md / always-apply MDC / etc.). */
  alwaysLoadedTokens: number;
};

export interface Adapter {
  readonly target: TargetId;
  readonly version: string;
  render(ir: ProjectIR, options?: RenderOptions): RenderResult;
}

export async function writeRendered(rootDir: string, result: RenderResult): Promise<void> {
  for (const file of result.files) {
    const full = join(rootDir, file.path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, file.content, 'utf8');
  }
}

/** Apply per-target override to a KnowledgeUnit, returning null if skipped. */
export function applyOverride(unit: KnowledgeUnit, target: TargetId): KnowledgeUnit | null {
  const override: AdapterOverride | undefined = unit.adapterOverrides?.[target];
  if (!override) return unit;
  if (override.skip) return null;
  return {
    ...unit,
    routing: override.routing ?? unit.routing,
    content: override.content ?? unit.content,
  };
}

export function ignoreLinesFor(ir: ProjectIR, target: TargetId): string[] {
  const out: string[] = [];
  for (const rule of ir.ignores) {
    if (
      rule.appliesTo === 'all' ||
      (Array.isArray(rule.appliesTo) && rule.appliesTo.includes(target))
    ) {
      out.push(rule.pattern);
    }
  }
  return out;
}
