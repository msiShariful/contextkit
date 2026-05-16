import { type Tiktoken, getEncoding } from 'js-tiktoken';

export type TokenizerKind = 'tiktoken-cl100k' | 'anthropic-approx';

export interface Tokenizer {
  readonly kind: TokenizerKind;
  count(text: string): number;
}

let cl100kCache: Tiktoken | null = null;

function loadCl100k(): Tiktoken {
  if (cl100kCache === null) {
    cl100kCache = getEncoding('cl100k_base');
  }
  return cl100kCache;
}

const tiktokenCl100k = (): Tokenizer => ({
  kind: 'tiktoken-cl100k',
  count(text: string): number {
    if (text.length === 0) return 0;
    return loadCl100k().encode(text).length;
  },
});

/**
 * Cheap heuristic for Anthropic-style estimates. ~3.5 chars/token for
 * English prose. Never quoted as exact — adapters that report numbers should
 * call out the tokenizer kind.
 */
const anthropicApprox = (): Tokenizer => ({
  kind: 'anthropic-approx',
  count(text: string): number {
    if (text.length === 0) return 0;
    return Math.max(1, Math.ceil(text.length / 3.5));
  },
});

export function createTokenizer(kind: TokenizerKind = 'tiktoken-cl100k'): Tokenizer {
  switch (kind) {
    case 'tiktoken-cl100k':
      return tiktokenCl100k();
    case 'anthropic-approx':
      return anthropicApprox();
    default: {
      const exhaustive: never = kind;
      throw new Error(`unknown tokenizer kind: ${String(exhaustive)}`);
    }
  }
}
