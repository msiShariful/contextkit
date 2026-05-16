import { resolve } from 'node:path';
import { Command } from 'commander';
import { enforce, formatReport } from '../budget/index.js';
import { isInitialized, readIR } from '../ir/io.js';
import { fail } from './util.js';

export function analyzeCommand(): Command {
  return new Command('analyze')
    .description('Report the token cost of the current contextkit IR by tier and per-unit')
    .option('--cwd <path>', 'project root directory', process.cwd())
    .option('--json', 'emit machine-readable JSON instead of a human report', false)
    .action(async (opts: { cwd: string; json: boolean }) => {
      const cwd = resolve(opts.cwd);
      if (!(await isInitialized(cwd))) {
        fail(`no contextkit IR found at ${cwd}/.contextkit/. Run \`contextkit migrate\` first.`);
      }
      const ir = await readIR(cwd);
      const report = enforce(ir);
      if (opts.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
      }
      console.log(formatReport(report));
      if (!report.ok) process.exitCode = 1;
    });
}
