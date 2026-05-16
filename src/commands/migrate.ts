import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Command } from 'commander';
import { getAdapter, writeRendered } from '../adapters/index.js';
import { enforce, formatReport } from '../budget/index.js';
import { writeIR } from '../ir/io.js';
import { DEFAULT_BUDGETS } from '../ir/schema.js';
import type { ProjectIR } from '../ir/types.js';
import { classify } from '../migrator/classifier.js';
import { parseClaudeMd } from '../migrator/parsers/claude-md.js';
import { scanProject } from '../scanner/index.js';
import { fail, parseTargets } from './util.js';

export function migrateCommand(): Command {
  return new Command('migrate')
    .description('Refactor an existing CLAUDE.md into the contextkit IR and render to targets')
    .option('-s, --source <path>', 'source file to migrate from', 'CLAUDE.md')
    .option('-t, --target <ids>', 'comma-separated targets to render to', 'claude-code,cursor')
    .option('--dry-run', 'parse and classify but do not write files', false)
    .option('--cwd <path>', 'project root directory', process.cwd())
    .action(async (opts: { source: string; target: string; dryRun: boolean; cwd: string }) => {
      const cwd = resolve(opts.cwd);
      const sourcePath = resolve(cwd, opts.source);
      if (!existsSync(sourcePath)) fail(`source not found: ${sourcePath}`);

      let targets: ReturnType<typeof parseTargets>;
      try {
        targets = parseTargets(opts.target);
      } catch (e) {
        fail((e as Error).message);
      }

      console.log(`Reading ${opts.source}...`);
      const text = await readFile(sourcePath, 'utf8');

      console.log('Parsing sections...');
      const parsed = parseClaudeMd(text, opts.source);
      console.log(`  ${parsed.sections.length} section(s) found`);

      console.log('Classifying...');
      const result = classify(parsed.sections, { sourcePath: opts.source });

      console.log('Scanning project for meta and ignores...');
      const scan = await scanProject(cwd);

      const ir: ProjectIR = {
        schemaVersion: '1',
        meta: scan.meta,
        budgets: DEFAULT_BUDGETS,
        knowledge: result.knowledge,
        workflows: result.workflows,
        agents: [],
        ignores: scan.ignores,
        targets: targets.map((target) => ({
          target,
          enabled: true,
          adapterVersion: '0.1.0',
        })),
      };

      console.log('\nClassification summary:');
      const counts: Record<string, number> = {};
      for (const note of result.notes) {
        counts[note.tier] = (counts[note.tier] ?? 0) + 1;
      }
      for (const [tier, n] of Object.entries(counts).sort()) {
        console.log(`  ${tier.padEnd(16)} ${String(n).padStart(3)}`);
      }

      console.log('\nBudget check:');
      const report = enforce(ir);
      console.log(formatReport(report));

      if (opts.dryRun) {
        console.log('\n(dry-run — no files written)');
        return;
      }

      console.log('\nWriting IR to .contextkit/...');
      await writeIR(cwd, ir);

      for (const target of targets) {
        try {
          const adapter = getAdapter(target);
          const rendered = adapter.render(ir);
          await writeRendered(cwd, rendered);
          console.log(
            `  ${target}: ${rendered.files.length} files, ${rendered.alwaysLoadedTokens} eager tokens`,
          );
          for (const warning of rendered.warnings) {
            console.log(`    ! ${warning}`);
          }
        } catch (e) {
          console.error(`  ${target}: ${(e as Error).message}`);
        }
      }

      console.log('\nMigration complete.');
    });
}
