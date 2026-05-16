import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Detector, DetectorResult } from '../types.js';

export const monorepoDetector: Detector = {
  name: 'monorepo',
  async detect(index): Promise<DetectorResult> {
    const workspaces: string[] = [];

    // pnpm workspace
    if (index.files.has('pnpm-workspace.yaml')) {
      try {
        const text = await readFile(join(index.rootDir, 'pnpm-workspace.yaml'), 'utf8');
        for (const line of text.split('\n')) {
          const m = line.match(/^\s*-\s*['"]?([^'"\s]+)['"]?/u);
          if (m?.[1]) workspaces.push(m[1]);
        }
      } catch {
        // ignore
      }
    }

    // npm/yarn workspaces from package.json
    if (workspaces.length === 0 && index.files.has('package.json')) {
      try {
        const pkg = JSON.parse(
          await readFile(join(index.rootDir, 'package.json'), 'utf8'),
        ) as Record<string, unknown>;
        const ws = pkg.workspaces;
        if (Array.isArray(ws)) {
          workspaces.push(...ws.filter((w): w is string => typeof w === 'string'));
        } else if (
          ws &&
          typeof ws === 'object' &&
          Array.isArray((ws as { packages?: unknown }).packages)
        ) {
          workspaces.push(
            ...(ws as { packages: unknown[] }).packages.filter(
              (w): w is string => typeof w === 'string',
            ),
          );
        }
      } catch {
        // ignore
      }
    }

    const monorepoMarkers = ['nx.json', 'turbo.json', 'lerna.json', 'rush.json'].filter((f) =>
      index.files.has(f),
    );
    const isMonorepo = workspaces.length > 0 || monorepoMarkers.length > 0;

    if (!isMonorepo) return {};

    return {
      meta: {
        layout: {
          monorepo: true,
          workspaces: workspaces.length > 0 ? workspaces : undefined,
          srcRoots: ['src'],
          testRoots: ['tests'],
        },
      },
      evidence: monorepoMarkers.map((file) => ({
        detector: 'monorepo',
        file,
        reason: 'monorepo marker present',
      })),
    };
  },
};
