import { describe, expect, it } from 'vitest';
import { createTokenizer } from '../../src/budget/tokenizer.js';

describe('createTokenizer', () => {
  it('counts zero for empty string (both tokenizers)', () => {
    expect(createTokenizer('tiktoken-cl100k').count('')).toBe(0);
    expect(createTokenizer('anthropic-approx').count('')).toBe(0);
  });

  it('cl100k counts a few common phrases sanely', () => {
    const t = createTokenizer('tiktoken-cl100k');
    expect(t.count('hello world')).toBe(2);
    expect(t.count('contextkit is a tool')).toBeGreaterThan(0);
    expect(t.count('contextkit is a tool')).toBeLessThan(15);
  });

  it('approx scales with character count', () => {
    const t = createTokenizer('anthropic-approx');
    expect(t.count('a')).toBe(1);
    const long = 'abcdefghij'.repeat(35); // 350 chars
    expect(t.count(long)).toBe(Math.ceil(350 / 3.5));
  });

  it('reports its kind', () => {
    expect(createTokenizer('tiktoken-cl100k').kind).toBe('tiktoken-cl100k');
    expect(createTokenizer('anthropic-approx').kind).toBe('anthropic-approx');
  });
});
