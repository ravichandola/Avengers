import { z } from 'zod';

export const slaRuleSchema = z.object({
  name: z.string(),
  /** Max p95 latency in ms for scenario or transaction */
  p95Ms: z.number().positive().optional(),
  p99Ms: z.number().positive().optional(),
  maxErrorRatePercent: z.number().min(0).max(100).optional(),
});

export type SlaRule = z.infer<typeof slaRuleSchema>;
