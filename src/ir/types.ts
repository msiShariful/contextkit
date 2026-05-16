import type { z } from 'zod';
import type {
  AdapterOverrideSchema,
  IgnoreRuleSchema,
  KnowledgeUnitSchema,
  ProjectIRSchema,
  ProjectMetaSchema,
  ProvenanceSchema,
  RoutingSchema,
  SubagentSpecSchema,
  TargetConfigSchema,
  TargetIdSchema,
  TierSchema,
  TokenBudgetsSchema,
  WorkflowSchema,
} from './schema.js';

export type TargetId = z.infer<typeof TargetIdSchema>;
export type Tier = z.infer<typeof TierSchema>;
export type Routing = z.infer<typeof RoutingSchema>;
export type Provenance = z.infer<typeof ProvenanceSchema>;
export type AdapterOverride = z.infer<typeof AdapterOverrideSchema>;
export type KnowledgeUnit = z.infer<typeof KnowledgeUnitSchema>;
export type Workflow = z.infer<typeof WorkflowSchema>;
export type SubagentSpec = z.infer<typeof SubagentSpecSchema>;
export type IgnoreRule = z.infer<typeof IgnoreRuleSchema>;
export type ProjectMeta = z.infer<typeof ProjectMetaSchema>;
export type TokenBudgets = z.infer<typeof TokenBudgetsSchema>;
export type TargetConfig = z.infer<typeof TargetConfigSchema>;
export type ProjectIR = z.infer<typeof ProjectIRSchema>;

/** Convenience: tier is the discriminant on routing. */
export const tierOf = (unit: KnowledgeUnit): Tier => unit.routing.tier;

/** Type guard helpers — `unit.routing` narrows on `tier`. */
export const isAlways = (r: Routing): r is Extract<Routing, { tier: 'always' }> =>
  r.tier === 'always';
export const isGlobScoped = (r: Routing): r is Extract<Routing, { tier: 'glob' }> =>
  r.tier === 'glob';
export const isAgentDecided = (r: Routing): r is Extract<Routing, { tier: 'agent-decided' }> =>
  r.tier === 'agent-decided';
export const isUserInvoked = (r: Routing): r is Extract<Routing, { tier: 'user-invoked' }> =>
  r.tier === 'user-invoked';
export const isReference = (r: Routing): r is Extract<Routing, { tier: 'reference' }> =>
  r.tier === 'reference';
