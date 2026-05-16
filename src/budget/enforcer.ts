import { isAgentDecided, isAlways, isGlobScoped } from '../ir/types.js';
import type { KnowledgeUnit, ProjectIR, Tier, TokenBudgets } from '../ir/types.js';
import { type Tokenizer, createTokenizer } from './tokenizer.js';

export type BudgetRule = 'always-loaded-cap' | 'glob-scope-cap' | 'skill-cap' | 'total-eager-cap';

export type BudgetIssue = {
  level: 'error' | 'warning';
  rule: BudgetRule;
  unitId?: string;
  scope?: string;
  actual: number;
  threshold: number;
  message: string;
};

export type BudgetReport = {
  tokenizer: Tokenizer['kind'];
  perUnit: Record<string, number>;
  perTier: Record<Tier, number>;
  /** Sum of always + glob — what loads before the agent does any work. */
  eager: number;
  issues: BudgetIssue[];
  errors: BudgetIssue[];
  warnings: BudgetIssue[];
  ok: boolean;
};

export type EnforceOptions = {
  tokenizer?: Tokenizer;
  /** Re-tokenize content from scratch instead of trusting unit.tokenCost. */
  recompute?: boolean;
};

export function tokenizeUnit(unit: KnowledgeUnit, tokenizer: Tokenizer): number {
  return tokenizer.count(unit.content);
}

export function enforce(ir: ProjectIR, options: EnforceOptions = {}): BudgetReport {
  const tokenizer = options.tokenizer ?? createTokenizer(ir.budgets.tokenizer);
  const recompute = options.recompute ?? true;

  const perUnit: Record<string, number> = {};
  const perTier: Record<Tier, number> = {
    always: 0,
    glob: 0,
    'agent-decided': 0,
    'user-invoked': 0,
    reference: 0,
  };
  const issues: BudgetIssue[] = [];

  for (const unit of ir.knowledge) {
    const cost = recompute ? tokenizeUnit(unit, tokenizer) : unit.tokenCost;
    perUnit[unit.id] = cost;
    perTier[unit.routing.tier] += cost;
    checkPerUnit(unit, cost, ir.budgets, issues);
  }

  for (const [scope, total] of computeGlobScopeTotals(ir.knowledge, perUnit)) {
    appendCap(issues, total, ir.budgets.perGlobScope, 'glob-scope-cap', { scope });
  }

  const eager = perTier.always + perTier.glob;
  if (eager > ir.budgets.totalEager.max) {
    issues.push({
      level: 'error',
      rule: 'total-eager-cap',
      actual: eager,
      threshold: ir.budgets.totalEager.max,
      message: `total eager-load tokens exceed max (${eager} > ${ir.budgets.totalEager.max})`,
    });
  }

  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');
  return {
    tokenizer: tokenizer.kind,
    perUnit,
    perTier,
    eager,
    issues,
    errors,
    warnings,
    ok: errors.length === 0,
  };
}

function checkPerUnit(
  unit: KnowledgeUnit,
  cost: number,
  budgets: TokenBudgets,
  issues: BudgetIssue[],
): void {
  if (isAlways(unit.routing)) {
    appendCap(issues, cost, budgets.alwaysLoaded, 'always-loaded-cap', { unitId: unit.id });
  } else if (isAgentDecided(unit.routing)) {
    appendCap(issues, cost, budgets.perSkill, 'skill-cap', { unitId: unit.id });
  }
  // glob-scope budget is cross-unit; user-invoked and reference have no per-unit cap.
}

type CapContext = { unitId?: string; scope?: string };

function appendCap(
  issues: BudgetIssue[],
  actual: number,
  cap: { max: number; warn: number },
  rule: BudgetRule,
  ctx: CapContext,
): void {
  if (actual > cap.max) {
    issues.push({
      level: 'error',
      rule,
      ...ctx,
      actual,
      threshold: cap.max,
      message: format(rule, 'max', actual, cap.max, ctx),
    });
  } else if (actual > cap.warn) {
    issues.push({
      level: 'warning',
      rule,
      ...ctx,
      actual,
      threshold: cap.warn,
      message: format(rule, 'warn', actual, cap.warn, ctx),
    });
  }
}

function format(
  rule: BudgetRule,
  bound: 'max' | 'warn',
  actual: number,
  threshold: number,
  ctx: CapContext,
): string {
  const target = ctx.unitId ? `unit "${ctx.unitId}"` : `scope "${ctx.scope}"`;
  return `${target} exceeds ${rule} ${bound} (${actual} > ${threshold})`;
}

function computeGlobScopeTotals(
  units: KnowledgeUnit[],
  perUnit: Record<string, number>,
): Map<string, number> {
  // Each individual glob pattern is its own loading scope. When the agent has
  // a file matching glob G open, every unit that lists G in its globs loads.
  // So we attribute each unit's cost to *each* of its globs independently.
  const totals = new Map<string, number>();
  for (const unit of units) {
    if (!isGlobScoped(unit.routing)) continue;
    const cost = perUnit[unit.id] ?? 0;
    for (const glob of unit.routing.globs) {
      totals.set(glob, (totals.get(glob) ?? 0) + cost);
    }
  }
  return totals;
}

/** Format a report as a human-readable string for CLI output. */
export function formatReport(report: BudgetReport): string {
  const lines: string[] = [];
  lines.push(`Tokenizer: ${report.tokenizer}`);
  lines.push('');
  lines.push('Per-tier totals:');
  for (const [tier, total] of Object.entries(report.perTier)) {
    lines.push(`  ${tier.padEnd(16)} ${total.toString().padStart(6)} tokens`);
  }
  lines.push(`  ${'eager (always+glob)'.padEnd(16)} ${report.eager.toString().padStart(6)} tokens`);
  lines.push('');
  if (report.errors.length > 0) {
    lines.push(`Errors (${report.errors.length}):`);
    for (const e of report.errors) lines.push(`  ✗ ${e.message}`);
    lines.push('');
  }
  if (report.warnings.length > 0) {
    lines.push(`Warnings (${report.warnings.length}):`);
    for (const w of report.warnings) lines.push(`  ⚠ ${w.message}`);
    lines.push('');
  }
  lines.push(report.ok ? '✓ Budget OK' : '✗ Budget violations present');
  return lines.join('\n');
}
