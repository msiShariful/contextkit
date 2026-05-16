import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import {
  IgnoreRuleSchema,
  KnowledgeUnitSchema,
  ProjectIRSchema,
  ProjectMetaSchema,
  SubagentSpecSchema,
  TargetConfigSchema,
  TokenBudgetsSchema,
  WorkflowSchema,
} from './schema.js';
import type { KnowledgeUnit, ProjectIR, SubagentSpec, Tier, Workflow } from './types.js';

export const CONTEXTKIT_DIR = '.contextkit';
export const INDEX_FILENAME = 'contextkit.yaml';
export const KNOWLEDGE_DIR = 'knowledge';
export const WORKFLOWS_DIR = 'workflows';
export const AGENTS_DIR = 'agents';

const FRONTMATTER_DELIM = '---';
const TIER_DIRS: Record<Tier, string> = {
  always: 'always',
  glob: 'glob',
  'agent-decided': 'agent-decided',
  'user-invoked': 'user-invoked',
  reference: 'reference',
};

const YAML_OPTIONS = { lineWidth: 100, defaultStringType: 'PLAIN' } as const;

export class IRError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'IRError';
  }
}

/* ---------- frontmatter helpers ---------- */

export type ParsedDoc = { frontmatter: Record<string, unknown>; body: string };

export function parseFrontmatter(text: string): ParsedDoc {
  if (!text.startsWith(FRONTMATTER_DELIM)) {
    throw new IRError('missing leading "---" frontmatter delimiter');
  }
  const after = text.slice(FRONTMATTER_DELIM.length);
  const closeIdx = after.indexOf(`\n${FRONTMATTER_DELIM}`);
  if (closeIdx === -1) {
    throw new IRError('unclosed frontmatter (no trailing "---")');
  }
  const fmText = after.slice(0, closeIdx).trim();
  const rest = after.slice(closeIdx + FRONTMATTER_DELIM.length + 1);
  const body = rest.replace(/^\n+/, '');
  let frontmatter: unknown;
  try {
    frontmatter = parseYaml(fmText);
  } catch (cause) {
    throw new IRError('frontmatter is not valid YAML', { cause });
  }
  if (frontmatter === null || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) {
    throw new IRError('frontmatter must be a YAML mapping');
  }
  return { frontmatter: frontmatter as Record<string, unknown>, body };
}

export function serializeFrontmatter(frontmatter: object, body: string): string {
  const fmYaml = stringifyYaml(frontmatter, YAML_OPTIONS).replace(/\n$/, '');
  const trimmedBody = body.replace(/^\n+/, '');
  return `${FRONTMATTER_DELIM}\n${fmYaml}\n${FRONTMATTER_DELIM}\n\n${trimmedBody}`;
}

/* ---------- per-collection serializers ---------- */

function unitToDoc(unit: KnowledgeUnit): string {
  const { content, ...frontmatter } = unit;
  return serializeFrontmatter(frontmatter, content);
}

function docToUnit(parsed: ParsedDoc): KnowledgeUnit {
  return KnowledgeUnitSchema.parse({ ...parsed.frontmatter, content: parsed.body });
}

function workflowToDoc(wf: Workflow): string {
  const { body, ...frontmatter } = wf;
  return serializeFrontmatter(frontmatter, body);
}

function docToWorkflow(parsed: ParsedDoc): Workflow {
  return WorkflowSchema.parse({ ...parsed.frontmatter, body: parsed.body });
}

function agentToDoc(a: SubagentSpec): string {
  const { systemPrompt, ...frontmatter } = a;
  return serializeFrontmatter(frontmatter, systemPrompt);
}

function docToAgent(parsed: ParsedDoc): SubagentSpec {
  return SubagentSpecSchema.parse({ ...parsed.frontmatter, systemPrompt: parsed.body });
}

/* ---------- index file (contextkit.yaml) ---------- */

const IndexSchema = ProjectIRSchema.pick({
  schemaVersion: true,
  meta: true,
  budgets: true,
  ignores: true,
  targets: true,
});

function serializeIndex(ir: ProjectIR): string {
  const payload = {
    schemaVersion: ir.schemaVersion,
    meta: ir.meta,
    budgets: ir.budgets,
    targets: ir.targets,
    ignores: ir.ignores,
  };
  return stringifyYaml(payload, YAML_OPTIONS);
}

function parseIndex(text: string): {
  schemaVersion: '1';
  meta: ProjectIR['meta'];
  budgets: ProjectIR['budgets'];
  ignores: ProjectIR['ignores'];
  targets: ProjectIR['targets'];
} {
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (cause) {
    throw new IRError(`${INDEX_FILENAME} is not valid YAML`, { cause });
  }
  const parsed = IndexSchema.safeParse(raw);
  if (!parsed.success) {
    throw new IRError(
      `${INDEX_FILENAME} failed validation:\n${parsed.error.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n')}`,
    );
  }
  return parsed.data;
}

/* ---------- directory walking ---------- */

async function listMarkdown(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const result: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await listMarkdown(full)));
    } else if (entry.isFile() && extname(entry.name) === '.md') {
      result.push(full);
    }
  }
  return result.sort();
}

/* ---------- public API ---------- */

export type IRPaths = {
  root: string;
  ckDir: string;
  indexFile: string;
  knowledgeDir: string;
  workflowsDir: string;
  agentsDir: string;
};

export function paths(rootDir: string): IRPaths {
  const ckDir = join(rootDir, CONTEXTKIT_DIR);
  return {
    root: rootDir,
    ckDir,
    indexFile: join(ckDir, INDEX_FILENAME),
    knowledgeDir: join(ckDir, KNOWLEDGE_DIR),
    workflowsDir: join(ckDir, WORKFLOWS_DIR),
    agentsDir: join(ckDir, AGENTS_DIR),
  };
}

export async function isInitialized(rootDir: string): Promise<boolean> {
  return existsSync(paths(rootDir).indexFile);
}

export async function readIR(rootDir: string): Promise<ProjectIR> {
  const p = paths(rootDir);
  if (!existsSync(p.indexFile)) {
    throw new IRError(
      `no contextkit project at ${rootDir} (expected ${CONTEXTKIT_DIR}/${INDEX_FILENAME})`,
    );
  }
  const indexText = await readFile(p.indexFile, 'utf8');
  const index = parseIndex(indexText);

  const [knowledge, workflows, agents] = await Promise.all([
    readKnowledge(p.knowledgeDir),
    readWorkflows(p.workflowsDir),
    readAgents(p.agentsDir),
  ]);

  return ProjectIRSchema.parse({
    schemaVersion: index.schemaVersion,
    meta: index.meta,
    budgets: index.budgets,
    ignores: index.ignores,
    targets: index.targets,
    knowledge,
    workflows,
    agents,
  });
}

const byId = <T extends { id: string }>(a: T, b: T): number =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

async function readKnowledge(dir: string): Promise<KnowledgeUnit[]> {
  const files = await listMarkdown(dir);
  const units = await Promise.all(
    files.map(async (file) => {
      const text = await readFile(file, 'utf8');
      try {
        return docToUnit(parseFrontmatter(text));
      } catch (cause) {
        throw new IRError(`failed to parse knowledge unit ${file}`, { cause });
      }
    }),
  );
  return units.sort(byId);
}

async function readWorkflows(dir: string): Promise<Workflow[]> {
  const files = await listMarkdown(dir);
  const items = await Promise.all(
    files.map(async (file) => {
      const text = await readFile(file, 'utf8');
      try {
        return docToWorkflow(parseFrontmatter(text));
      } catch (cause) {
        throw new IRError(`failed to parse workflow ${file}`, { cause });
      }
    }),
  );
  return items.sort(byId);
}

async function readAgents(dir: string): Promise<SubagentSpec[]> {
  const files = await listMarkdown(dir);
  const items = await Promise.all(
    files.map(async (file) => {
      const text = await readFile(file, 'utf8');
      try {
        return docToAgent(parseFrontmatter(text));
      } catch (cause) {
        throw new IRError(`failed to parse agent spec ${file}`, { cause });
      }
    }),
  );
  return items.sort(byId);
}

export type WriteOptions = {
  /** If true, delete files in the target directories not represented in the IR. Default: true. */
  prune?: boolean;
};

export async function writeIR(
  rootDir: string,
  ir: ProjectIR,
  options: WriteOptions = {},
): Promise<void> {
  const { prune = true } = options;
  const p = paths(rootDir);

  await mkdir(p.ckDir, { recursive: true });
  await writeFile(p.indexFile, serializeIndex(ir), 'utf8');

  if (prune) {
    await Promise.all([
      rm(p.knowledgeDir, { recursive: true, force: true }),
      rm(p.workflowsDir, { recursive: true, force: true }),
      rm(p.agentsDir, { recursive: true, force: true }),
    ]);
  }

  await Promise.all([
    writeKnowledge(p.knowledgeDir, ir.knowledge),
    writeCollection(p.workflowsDir, ir.workflows, (w) => w.id, workflowToDoc),
    writeCollection(p.agentsDir, ir.agents, (a) => a.id, agentToDoc),
  ]);
}

async function writeKnowledge(dir: string, units: KnowledgeUnit[]): Promise<void> {
  await mkdir(dir, { recursive: true });
  await Promise.all(
    units.map(async (unit) => {
      const tierDir = join(dir, TIER_DIRS[unit.routing.tier]);
      const file = join(tierDir, `${unit.id}.md`);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, unitToDoc(unit), 'utf8');
    }),
  );
}

async function writeCollection<T>(
  dir: string,
  items: T[],
  getId: (t: T) => string,
  serialize: (t: T) => string,
): Promise<void> {
  if (items.length === 0) return;
  await mkdir(dir, { recursive: true });
  await Promise.all(
    items.map(async (item) => {
      const file = join(dir, `${getId(item)}.md`);
      await writeFile(file, serialize(item), 'utf8');
    }),
  );
}

/* ---------- exported building blocks for adapters & tests ---------- */

export const __testing = {
  IndexSchema,
  parseIndex,
  serializeIndex,
  unitToDoc,
  docToUnit,
  workflowToDoc,
  docToWorkflow,
  agentToDoc,
  docToAgent,
};

// Re-export schemas used in this module so callers don't have to dual-import.
export {
  IgnoreRuleSchema,
  KnowledgeUnitSchema,
  ProjectMetaSchema,
  SubagentSpecSchema,
  TargetConfigSchema,
  TokenBudgetsSchema,
  WorkflowSchema,
};
