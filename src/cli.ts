import { Command } from 'commander';
import { analyzeCommand } from './commands/analyze.js';
import { initCommand } from './commands/init.js';
import { listTargetsCommand } from './commands/list-targets.js';
import { migrateCommand } from './commands/migrate.js';
import { syncCommand } from './commands/sync.js';
import { VERSION } from './index.js';

const program = new Command();
program
  .name('contextkit')
  .description('Token-efficient AI coding agent configuration')
  .version(VERSION);

program.addCommand(migrateCommand());
program.addCommand(analyzeCommand());
program.addCommand(syncCommand());
program.addCommand(initCommand());
program.addCommand(listTargetsCommand());

program.parseAsync(process.argv).catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
