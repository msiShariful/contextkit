import { stringify as stringifyYaml } from 'yaml';
import { createTokenizer } from '../../budget/tokenizer.js';
import {
  isAgentDecided,
  isAlways,
  isGlobScoped,
  isReference,
  isUserInvoked,
} from '../../ir/types.js';
import type { KnowledgeUnit, ProjectIR, SubagentSpec, Workflow } from '../../ir/types.js';
import {
  type Adapter,
  type RenderOptions,
  type RenderResult,
  type RenderedFile,
  applyOverride,
  ignoreLinesFor,
} from '../base.js';

const ADAPTER_VERSION = '0.1.0';
const TARGET = 'claude-code' as const;

export const claudeCodeAdapter: Adapter = {
  target: TARGET,
  version: ADAPTER_VERSION,
  render(ir: ProjectIR, _options: RenderOptions = {}): RenderResult {
    const tokenizer = createTokenizer(ir.budgets.tokenizer);
    const files: RenderedFile[] = [];
    const warnings: string[] = [];

    const knowledge = ir.knowledge
      .map((u) => applyOverride(u, TARGET))
      .filter((u): u is KnowledgeUnit => u !== null);

    const alwaysUnits = knowledge.filter((u) => isAlways(u.routing));
    const claudeMdContent = renderClaudeMd(ir, alwaysUnits);
    const claudeMdTokens = tokenizer.count(claudeMdContent);
    files.push({ path: 'CLAUDE.md', content: claudeMdContent, tokenCost: claudeMdTokens });

    const skillUnits = knowledge.filter(
      (u) => isAgentDecided(u.routing) || isGlobScoped(u.routing),
    );
    if (knowledge.some((u) => isGlobScoped(u.routing))) {
      warnings.push(
        'Claude Code has no native glob scoping; glob-tier knowledge rendered as skills with file-type cues in the description.',
      );
    }
    for (const unit of skillUnits) {
      const content = renderSkill(unit);
      files.push({
        path: `.claude/skills/${unit.id}.md`,
        content,
        tokenCost: tokenizer.count(unit.content),
      });
    }

    for (const wf of ir.workflows) {
      if (!wf.adapterSupport.includes(TARGET)) continue;
      files.push({
        path: `.claude/commands/${wf.id}.md`,
        content: renderCommand(wf),
        tokenCost: 0,
      });
    }
    for (const unit of knowledge) {
      if (!isUserInvoked(unit.routing)) continue;
      files.push({
        path: `.claude/commands/${unit.id}.md`,
        content: renderUserInvokedKnowledge(unit),
        tokenCost: 0,
      });
    }

    for (const a of ir.agents) {
      files.push({
        path: `.claude/agents/${a.id}.md`,
        content: renderAgent(a),
        tokenCost: 0,
      });
    }

    for (const unit of knowledge) {
      if (!isReference(unit.routing)) continue;
      files.push({
        path: unit.routing.indexedAs,
        content: unit.content,
        tokenCost: 0,
      });
    }

    const ignoreLines = ignoreLinesFor(ir, TARGET);
    if (ignoreLines.length > 0) {
      files.push({
        path: '.claudeignore',
        content: `${ignoreLines.join('\n')}\n`,
        tokenCost: 0,
      });
    }

    return {
      target: TARGET,
      adapterVersion: ADAPTER_VERSION,
      files,
      warnings,
      alwaysLoadedTokens: claudeMdTokens,
    };
  },
};

function renderClaudeMd(ir: ProjectIR, alwaysUnits: KnowledgeUnit[]): string {
  const lines: string[] = [];
  lines.push(`# ${ir.meta.name}`);
  if (ir.meta.oneLiner) {
    lines.push('', `> ${ir.meta.oneLiner}`);
  }
  for (const unit of alwaysUnits) {
    lines.push('', `## ${unit.topic}`, '', unit.content.trim());
  }
  return `${lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()}\n`;
}

function renderSkill(unit: KnowledgeUnit): string {
  const description = skillDescription(unit);
  const frontmatter = stringifyYaml({
    name: unit.topic,
    description,
  }).trim();
  return `---\n${frontmatter}\n---\n\n${unit.content.trim()}\n`;
}

function skillDescription(unit: KnowledgeUnit): string {
  if (isAgentDecided(unit.routing)) {
    const triggers = unit.routing.triggerKeywords.length
      ? ` Triggers: ${unit.routing.triggerKeywords.join(', ')}.`
      : '';
    const not = unit.routing.whenNotToUse ? ` Do NOT use: ${unit.routing.whenNotToUse}` : '';
    return `${unit.routing.whenToUse}${triggers}${not}`.trim();
  }
  if (isGlobScoped(unit.routing)) {
    return `Use when working on files matching: ${unit.routing.globs.join(', ')}. ${unit.summary}`.trim();
  }
  return unit.summary;
}

function renderCommand(wf: Workflow): string {
  const frontmatter = stringifyYaml({ description: wf.description }).trim();
  return `---\n${frontmatter}\n---\n\n# ${wf.name}\n\n${wf.body.trim()}\n`;
}

function renderUserInvokedKnowledge(unit: KnowledgeUnit): string {
  const frontmatter = stringifyYaml({ description: unit.summary }).trim();
  return `---\n${frontmatter}\n---\n\n# ${unit.topic}\n\n${unit.content.trim()}\n`;
}

function renderAgent(a: SubagentSpec): string {
  const fm: Record<string, unknown> = {
    name: a.name,
    description: a.purpose,
  };
  if (a.toolPolicy.allow?.length) fm.tools = a.toolPolicy.allow.join(', ');
  const frontmatter = stringifyYaml(fm).trim();
  return `---\n${frontmatter}\n---\n\n${a.systemPrompt.trim()}\n`;
}
