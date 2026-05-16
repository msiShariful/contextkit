import { describe, expect, it } from 'vitest';
import { parseClaudeMd } from '../../src/migrator/parsers/claude-md.js';

const SAMPLE = `# Project

A short overview.

## Architecture

This is a Next.js app on Drizzle.
We use \`src/api\` for HTTP handlers and \`src/db\` for data access.

### Migration policy

- Always run \`pnpm db:generate\` first
- Never rename columns; create + backfill + drop

## Testing

Run \`pnpm test\` for vitest unit tests.
E2E lives in \`tests/e2e/**/*.spec.ts\`.

## Conventions

\`\`\`ts
function example() {}
\`\`\`
`;

describe('parseClaudeMd', () => {
  it('parses sections with parent/child links', () => {
    const parsed = parseClaudeMd(SAMPLE);
    expect(parsed.preamble).toBe('');

    const ids = parsed.sections.map((s) => s.id);
    expect(ids).toEqual(['project', 'architecture', 'migration-policy', 'testing', 'conventions']);

    const arch = parsed.sections.find((s) => s.id === 'architecture');
    expect(arch?.depth).toBe(2);
    expect(arch?.parentId).toBe('project');
    expect(arch?.childIds).toEqual(['migration-policy']);

    const mig = parsed.sections.find((s) => s.id === 'migration-policy');
    expect(mig?.parentId).toBe('architecture');
    expect(mig?.depth).toBe(3);
  });

  it('detects signals correctly', () => {
    const parsed = parseClaudeMd(SAMPLE);
    const arch = parsed.sections.find((s) => s.id === 'architecture');
    expect(arch?.signals.mentionsFiles).toBe(false); // "src/api" is not a file ext
    expect(arch?.signals.hasGlobPatterns).toBe(true); // matches src/api

    const testing = parsed.sections.find((s) => s.id === 'testing');
    expect(testing?.signals.hasGlobPatterns).toBe(true); // tests/e2e/**
    expect(testing?.signals.fileExtensions.ts).toBeGreaterThanOrEqual(1);

    const conv = parsed.sections.find((s) => s.id === 'conventions');
    expect(conv?.signals.hasCodeFences).toBe(true);

    const mig = parsed.sections.find((s) => s.id === 'migration-policy');
    expect(mig?.signals.hasList).toBe(true);
  });

  it('computes fullBody including descendants', () => {
    const parsed = parseClaudeMd(SAMPLE);
    const arch = parsed.sections.find((s) => s.id === 'architecture');
    expect(arch?.fullBody).toContain('Migration policy');
    expect(arch?.fullBody).toContain('pnpm db:generate');
  });

  it('handles empty input', () => {
    const parsed = parseClaudeMd('');
    expect(parsed.sections).toEqual([]);
    expect(parsed.preamble).toBe('');
  });

  it('captures preamble before first heading', () => {
    const parsed = parseClaudeMd('some intro text\n\nthat has no heading\n\n# First\n\nbody');
    expect(parsed.preamble).toContain('some intro');
    expect(parsed.sections).toHaveLength(1);
    expect(parsed.sections[0]?.id).toBe('first');
  });

  it('disambiguates duplicate headings', () => {
    const parsed = parseClaudeMd('# Notes\n\nA\n\n# Notes\n\nB\n');
    const ids = parsed.sections.map((s) => s.id);
    expect(ids).toEqual(['notes', 'notes-2']);
  });

  it('produces stable kebab-case slugs from messy headings', () => {
    const parsed = parseClaudeMd('# Build & Test (Important!!)\n\nbody');
    expect(parsed.sections[0]?.id).toMatch(/^build/);
    expect(parsed.sections[0]?.id).not.toMatch(/[!&()]/);
  });

  it('marks very-long sections via signals', () => {
    const longBody = 'word '.repeat(400); // ~2000 chars
    const parsed = parseClaudeMd(`# Big\n\n${longBody}`);
    expect(parsed.sections[0]?.signals.isVeryLong).toBe(true);
  });
});
