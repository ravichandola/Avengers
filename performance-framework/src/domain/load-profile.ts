import { z } from 'zod';

/** Scenario-facing duration strings; normalized in adapter layer. */
export const durationStringSchema = z.string().describe('e.g. 30s, 5m, 1h');
export type DurationString = z.infer<typeof durationStringSchema>;

export const loadKindSchema = z.enum([
  'constant',
  'ramp_up',
  'ramp_down',
  'spike',
  'stress',
  'step',
  'burst',
  'soak',
  'breakpoint',
  'volume',
]);
export type LoadKind = z.infer<typeof loadKindSchema>;

/**
 * Load profile inputs map to strategy + Thread Group scheduling in engine adapters.
 * Performance engineers interact only with this shape — never JMeter thread groups.
 */
export const loadProfileSchema = z.object({
  kind: loadKindSchema.default('constant'),
  /** Target concurrent virtual users (logical; adapter maps to threads + ramp). */
  users: z.number().int().positive(),
  rampUp: durationStringSchema.optional(),
  rampDown: durationStringSchema.optional(),
  duration: durationStringSchema.optional(),
  /** Spike / burst: short intervals at elevated load. */
  spikePeakUsers: z.number().int().positive().optional(),
  spikeInterval: durationStringSchema.optional(),
  /** Step load: increase users per step. */
  stepUsers: z.number().int().positive().optional(),
  stepInterval: durationStringSchema.optional(),
  /** Soak: indefinite until external abort (or max duration if provided). */
  infiniteSoak: z.boolean().optional(),
  /** CSV / data file path (adapter injects JMeter config — hidden from DSL ergonomics). */
  dataSource: z
    .object({
      path: z.string(),
      variableNames: z.array(z.string()),
      delimiter: z.string().optional(),
    })
    .optional(),
});

export type LoadProfile = z.infer<typeof loadProfileSchema>;

export const httpMethodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
export type HttpMethod = z.infer<typeof httpMethodSchema>;

export const assertionKindSchema = z.enum([
  'status',
  'body_contains',
  'duration_p95',
  'duration_p99',
  'error_rate',
  'custom',
]);
export type AssertionKind = z.infer<typeof assertionKindSchema>;

export const assertionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('status'), value: z.number().int() }),
  z.object({ kind: z.literal('body_contains'), value: z.string() }),
  z.object({ kind: z.literal('duration_p95'), maxMs: z.number().positive() }),
  z.object({ kind: z.literal('duration_p99'), maxMs: z.number().positive() }),
  z.object({ kind: z.literal('error_rate'), maxPercent: z.number().min(0).max(100) }),
  z.object({ kind: z.literal('custom'), name: z.string(), expression: z.string() }),
]);

export type Assertion = z.infer<typeof assertionSchema>;

export const thinkTimeSchema = z.object({
  type: z.enum(['fixed', 'uniform', 'gaussian']),
  ms: z.number().nonnegative().optional(),
  minMs: z.number().nonnegative().optional(),
  maxMs: z.number().nonnegative().optional(),
});
export type ThinkTime = z.infer<typeof thinkTimeSchema>;
