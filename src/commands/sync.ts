import { resolve } from 'node:path';
import { Command } from 'commander';
import { getAdapter, writeRendered } from '../adapters/index.js';
import { isInitialized, readIR } from '../ir/io.js';
import type { TargetId } from '../ir/types.js';
import { fail, parseTargets } from './util.js';

export function syncCommand(): Command {
  return new Command('sync')
    .description('Re-render the IR to all enabled targets (or a subset via --target)')
    .option('--cwd <path>', 'project root directory', process.cwd())
    .option('-t, --target <ids>', 'comma-separated subset of targets to sync', '')
    .action(async (opts: { cwd: string; target: string }) => {
      const cwd = resolve(opts.cwd);
      if (!(await isInitialized(cwd))) {
        fail(`no contextkit IR found at ${cwd}/.contextkit/`);
      }
      const ir = await readIR(cwd);
      const configured = new Set(ir.targets.filter((t) => t.enabled).map((t) => t.target));
      let targets: TargetId[] = [...configured];

      if (opts.target.trim().length > 0) {
        let requested: ReturnType<typeof parseTargets>;
        try {
          requested = parseTargets(opts.target);
        } catch (e) {
          fail((e as Error).message);
        }
        targets = requested.filter((t) => configured.has(t));
        const skipped = requested.filter((t) => !configured.has(t));
        for (const s of skipped) {
          console.log(`(skipping ${s}: not in this project's targets)`);
        }
      }

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
    });
}
