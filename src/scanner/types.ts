import type { IgnoreRule, ProjectMeta, TargetId } from '../ir/types.js';

export type FileEntry = {
  /** Path relative to the scan root, using POSIX separators. */
  path: string;
  size: number;
};

export type FileIndex = {
  rootDir: string;
  files: Map<string, FileEntry>;
};

export type Evidence = {
  detector: string;
  file?: string;
  reason: string;
};

export type ExistingConfigKind =
  | 'claude-md'
  | 'claude-skill'
  | 'claude-command'
  | 'cursorrules'
  | 'cursor-mdc'
  | 'agents-md'
  | 'windsurfrules'
  | 'aider-conf'
  | 'continuerules'
  | 'clinerules';

export type ExistingConfig = {
  kind: ExistingConfigKind;
  /** Probable owning target, or 'unknown' if a config is shared/ambiguous. */
  target: TargetId | 'unknown';
  paths: string[];
};

export type DetectorResult = {
  meta?: Partial<ProjectMeta>;
  ignores?: IgnoreRule[];
  existingConfigs?: ExistingConfig[];
  evidence?: Evidence[];
};

export interface Detector {
  readonly name: string;
  detect(index: FileIndex): Promise<DetectorResult> | DetectorResult;
}

export type ScanResult = {
  rootDir: string;
  meta: ProjectMeta;
  ignores: IgnoreRule[];
  existingConfigs: ExistingConfig[];
  evidence: Evidence[];
};
