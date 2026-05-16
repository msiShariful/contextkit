import { Command } from 'commander';
import { ADAPTERS } from '../adapters/registry.js';
import { TargetIdSchema } from '../ir/schema.js';

export function listTargetsCommand(): Command {
  return new Command('list-targets')
    .description('List adapter targets, marking which ones are implemented in this version')
    .action(() => {
      const all = TargetIdSchema.options;
      for (const target of all) {
        const adapter = ADAPTERS[target];
        const status = adapter ? `v${adapter.version}` : 'roadmap';
        console.log(`  ${target.padEnd(14)} ${status}`);
      }
    });
}
