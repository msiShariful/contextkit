import type { TargetId } from '../ir/types.js';
import type { Adapter } from './base.js';
import { claudeCodeAdapter } from './claude-code/index.js';
import { cursorAdapter } from './cursor/index.js';

export const ADAPTERS: Record<string, Adapter> = {
  'claude-code': claudeCodeAdapter,
  cursor: cursorAdapter,
};

export function getAdapter(target: TargetId): Adapter {
  const adapter = ADAPTERS[target];
  if (!adapter) {
    throw new Error(
      `no adapter registered for target "${target}" (available: ${Object.keys(ADAPTERS).join(', ')})`,
    );
  }
  return adapter;
}

export function registerAdapter(adapter: Adapter): void {
  ADAPTERS[adapter.target] = adapter;
}
