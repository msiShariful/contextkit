import type { Heading, Root, RootContent } from 'mdast';
import { toString as mdastToString } from 'mdast-util-to-string';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';
import type { ParsedSourceConfig, RawSection, SectionSignals } from '../types.js';

const parser = unified().use(remarkParse);
const stringifier = unified().use(remarkStringify, {
  bullet: '-',
  emphasis: '_',
  fences: true,
  rule: '-',
});

export function parseClaudeMd(text: string, sourcePath = 'CLAUDE.md'): ParsedSourceConfig {
  const tree = parser.parse(text) as Root;
  const children = tree.children;

  let firstHeadingIdx = -1;
  for (let i = 0; i < children.length; i++) {
    if (children[i]?.type === 'heading') {
      firstHeadingIdx = i;
      break;
    }
  }

  const preambleNodes = firstHeadingIdx === -1 ? children : children.slice(0, firstHeadingIdx);
  const preamble = stringifyNodes(preambleNodes).trim();

  if (firstHeadingIdx === -1) {
    return { sourcePath, preamble, sections: [] };
  }

  type Chunk = { heading: Heading; bodyNodes: RootContent[] };
  const chunks: Chunk[] = [];
  let current: Chunk | null = null;
  for (let i = firstHeadingIdx; i < children.length; i++) {
    const node = children[i];
    if (!node) continue;
    if (node.type === 'heading') {
      if (current) chunks.push(current);
      current = { heading: node, bodyNodes: [] };
    } else if (current) {
      current.bodyNodes.push(node);
    }
  }
  if (current) chunks.push(current);

  const slugger = new Slugger();
  const stack: { id: string; depth: number }[] = [];
  const sections: RawSection[] = [];

  for (const chunk of chunks) {
    const headingText = mdastToString(chunk.heading);
    const id = slugger.slug(headingText);

    while (stack.length > 0) {
      const last = stack.at(-1);
      if (!last || last.depth < chunk.heading.depth) break;
      stack.pop();
    }
    const parentId = stack.at(-1)?.id;

    const body = stringifyNodes(chunk.bodyNodes).trim();
    sections.push({
      id,
      heading: headingText,
      depth: chunk.heading.depth,
      body,
      fullBody: '',
      parentId,
      childIds: [],
      tokenBudgetHint: approxTokens(body),
      signals: computeSignals(body),
    });

    stack.push({ id, depth: chunk.heading.depth });
  }

  const byId = new Map(sections.map((s) => [s.id, s]));
  for (const s of sections) {
    if (s.parentId) byId.get(s.parentId)?.childIds.push(s.id);
  }

  for (const s of sections) {
    s.fullBody = computeFullBody(s, byId);
  }

  return { sourcePath, preamble, sections };
}

function computeFullBody(section: RawSection, byId: Map<string, RawSection>): string {
  const parts: string[] = [];
  if (section.body) parts.push(section.body);
  for (const cid of section.childIds) {
    const child = byId.get(cid);
    if (!child) continue;
    const hashes = '#'.repeat(Math.min(6, child.depth));
    parts.push(`${hashes} ${child.heading}`);
    const childFull = computeFullBody(child, byId);
    if (childFull) parts.push(childFull);
  }
  return parts.join('\n\n');
}

function stringifyNodes(nodes: RootContent[]): string {
  const tree: Root = { type: 'root', children: nodes };
  return stringifier.stringify(tree);
}

function approxTokens(text: string): number {
  if (text.length === 0) return 0;
  return Math.max(1, Math.ceil(text.length / 3.5));
}

// Matches lowercase-prefixed filenames so framework names like "Next.js" or
// "Node.js" don't false-trigger. Allows path components via the [\w-]* tail.
// Lowercase-first prefix rejects framework names like "Next.js" / "Node.js"
// while still matching real file references such as "*.spec.ts" or "src/api.ts".
const FILE_EXT_RE =
  /\b[a-z][\w-]*\.(ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|kt|rb|php|md|json|ya?ml|toml|sh|html|css|scss|sql|prisma)\b/gu;
const GLOB_RE = /(\*\*\/|\*\.[a-z0-9]+|\bsrc\/[\w/*]+|\bapp\/[\w/*]+|\btests?\/[\w/*]+)/iu;
const LIST_RE = /^\s*([*\-+]|\d+\.)\s+/mu;

function computeSignals(body: string): SectionSignals {
  const fileExtensions: Record<string, number> = {};
  let mentionsFiles = false;
  for (const match of body.matchAll(FILE_EXT_RE)) {
    const ext = match[1]?.toLowerCase();
    if (!ext) continue;
    fileExtensions[ext] = (fileExtensions[ext] ?? 0) + 1;
    mentionsFiles = true;
  }

  return {
    hasCodeFences: body.includes('```'),
    hasList: LIST_RE.test(body),
    hasGlobPatterns: GLOB_RE.test(body),
    mentionsFiles,
    isVeryShort: body.length < 80,
    isVeryLong: body.length > 1500,
    fileExtensions,
  };
}

class Slugger {
  private counts = new Map<string, number>();
  slug(text: string): string {
    const base = baseSlug(text) || 'section';
    const count = this.counts.get(base) ?? 0;
    this.counts.set(base, count + 1);
    return count === 0 ? base : `${base}-${count + 1}`;
  }
}

function baseSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/giu, '')
    .trim()
    .replace(/\s+/gu, '-')
    .replace(/-+/gu, '-')
    .slice(0, 50)
    .replace(/^-+|-+$/gu, '');
}
