export type SectionSignals = {
  hasCodeFences: boolean;
  hasList: boolean;
  hasGlobPatterns: boolean;
  mentionsFiles: boolean;
  isVeryShort: boolean;
  isVeryLong: boolean;
  /** Counts of file-extension references (e.g., ".ts": 3) for clustering. */
  fileExtensions: Record<string, number>;
};

export type RawSection = {
  id: string;
  heading: string;
  depth: number;
  /** Markdown body of this section, not including subsections. */
  body: string;
  /** Body plus all descendant bodies (used when promoting nested headings). */
  fullBody: string;
  parentId: string | undefined;
  childIds: string[];
  /** Approximate token count (chars / 3.5) — for triage only. */
  tokenBudgetHint: number;
  signals: SectionSignals;
};

export type ParsedSourceConfig = {
  sourcePath: string;
  preamble: string;
  sections: RawSection[];
};
