import { resolve } from 'node:path';
import { Command } from 'commander';
import { writeIR } from '../ir/io.js';
import { DEFAULT_BUDGETS } from '../ir/schema.js';
import type { ProjectIR } from '../ir/types.js';
import { scanProject } from '../scanner/index.js';
import { fail, parseTargets } from './util.js';

export function initCommand(): Command {
  return new Command('init')
    .description('Initialize a fresh contextkit IR by scanning the project (no migration)')
    .option('--cwd <path>', 'project root directory', process.cwd())
    .option('-t, --target <ids>', 'comma-separated targets to enable', 'claude-code,cursor')
    .option('--name <name>', 'override project name')
    .action(async (opts: { cwd: string; target: string; name?: string }) => {
      const cwd = resolve(opts.cwd);
      let targets: ReturnType<typeof parseTargets>;
      try {
        targets = parseTargets(opts.target);
      } catch (e) {
        fail((e as Error).message);
      }

      console.log('Scanning project...');
      const scan = await scanProject(cwd);
      const meta = opts.name ? { ...scan.meta, name: opts.name } : scan.meta;

      const ir: ProjectIR = {
        schemaVersion: '1',
        meta,
        budgets: DEFAULT_BUDGETS,
        knowledge: [],
        workflows: [],
        agents: [],
        ignores: scan.ignores,
        targets: targets.map((target) => ({
          target,
          enabled: true,
          adapterVersion: '0.1.0',
        })),
      };

      await writeIR(cwd, ir);
      console.log(`Initialized contextkit IR at ${cwd}/.contextkit/`);
      console.log(`Detected: ${meta.stack.languages.join(', ') || 'no languages'}`);
      if (meta.stack.frameworks.length > 0) {
        console.log(`Frameworks: ${meta.stack.frameworks.map((f) => f.name).join(', ')}`);
      }
      console.log(`Targets enabled: ${targets.join(', ')}`);
      console.log(
        '\nNext: author knowledge units under .contextkit/knowledge/, then run `contextkit sync`.',
      );
    });
}
