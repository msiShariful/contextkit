import { TargetIdSchema } from '../ir/schema.js';
import type { TargetId } from '../ir/types.js';

export function parseTargets(input: string): TargetId[] {
  const items = input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const out: TargetId[] = [];
  for (const item of items) {
    const parsed = TargetIdSchema.safeParse(item);
    if (!parsed.success) {
      throw new Error(`unknown target "${item}". Available: ${TargetIdSchema.options.join(', ')}`);
    }
    out.push(parsed.data);
  }
  return out;
}

export function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}
