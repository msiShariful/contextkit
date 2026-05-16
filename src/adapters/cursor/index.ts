import { stringify as stringifyYaml } from 'yaml';
import { createTokenizer } from '../../budget/tokenizer.js';
import {
  isAgentDecided,
  isAlways,
  isGlobScoped,
  isReference,
  isUserInvoked,
} from '../../ir/types.js';
import type { KnowledgeUnit, ProjectIR } from '../../ir/types.js';
import {
  type Adapter,
  type RenderOptions,
  type RenderResult,
  type RenderedFile,
  applyOverride,
  ignoreLinesFor,
} from '../base.js';

const ADAPTER_VERSION = '0.1.0';
const TARGET = 'cursor' as const;

export const cursorAdapter: Adapter = {
  target: TARGET,
  version: ADAPTER_VERSION,
  render(ir: ProjectIR, _options: RenderOptions = {}): RenderResult {
    const tokenizer = createTokenizer(ir.budgets.tokenizer);
    const files: RenderedFile[] = [];
    const warnings: string[] = [];

    const knowledge = ir.knowledge
      .map((u) => applyOverride(u, TARGET))
      .filter((u): u is KnowledgeUnit => u !== null);

    let alwaysLoadedTokens = 0;

    for (const unit of knowledge) {
      if (isReference(unit.routing)) {
        files.push({ path: unit.routing.indexedAs, content: unit.content, tokenCost: 0 });
        continue;
      }
      if (isUserInvoked(unit.routing)) {
        // Cursor has no native slash commands; demote to a reference doc.
        files.push({
          path: `docs/commands/${unit.id}.md`,
          content: `# ${unit.topic}\n\n${unit.content}\n`,
          tokenCost: 0,
        });
        warnings.push(
          `user-invoked unit "${unit.id}" demoted to docs/commands/${unit.id}.md — Cursor has no native slash commands.`,
        );
        continue;
      }

      const mdcContent = renderMdc(unit);
      files.push({
        path: `.cursor/rules/${unit.id}.mdc`,
        content: mdcContent,
        tokenCost: tokenizer.count(unit.content),
      });
      if (isAlways(unit.routing) || isGlobScoped(unit.routing)) {
        alwaysLoadedTokens += isAlways(unit.routing) ? tokenizer.count(unit.content) : 0;
      }
    }

    if (ir.workflows.length > 0) {
      warnings.push(
        `${ir.workflows.length} workflow(s) skipped — Cursor has no native slash-command support. Consider emitting reference docs.`,
      );
    }
    if (ir.agents.length > 0) {
      warnings.push(
        `${ir.agents.length} subagent spec(s) skipped — Cursor has no native subagent equivalent.`,
      );
    }

    const ignoreLines = ignoreLinesFor(ir, TARGET);
    if (ignoreLines.length > 0) {
      files.push({
        path: '.cursorignore',
        content: `${ignoreLines.join('\n')}\n`,
        tokenCost: 0,
      });
    }

    return {
      target: TARGET,
      adapterVersion: ADAPTER_VERSION,
      files,
      warnings,
      alwaysLoadedTokens,
    };
  },
};

function renderMdc(unit: KnowledgeUnit): string {
  const fm: Record<string, unknown> = {};

  if (isAlways(unit.routing)) {
    fm.description = unit.summary;
    fm.alwaysApply = true;
  } else if (isGlobScoped(unit.routing)) {
    fm.description = unit.summary;
    fm.globs = unit.routing.globs.join(',');
    fm.alwaysApply = false;
  } else if (isAgentDecided(unit.routing)) {
    fm.description = describeAgentDecided(unit);
    fm.alwaysApply = false;
  }

  const frontmatter = stringifyYaml(fm).trim();
  return `---\n${frontmatter}\n---\n\n${unit.content.trim()}\n`;
}

function describeAgentDecided(unit: KnowledgeUnit): string {
  if (!isAgentDecided(unit.routing)) return unit.summary;
  const triggers = unit.routing.triggerKeywords.length
    ? ` Triggers: ${unit.routing.triggerKeywords.join(', ')}.`
    : '';
  const not = unit.routing.whenNotToUse ? ` Do NOT use: ${unit.routing.whenNotToUse}` : '';
  return `${unit.routing.whenToUse}${triggers}${not}`.trim();
}
