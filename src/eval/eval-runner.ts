/**
 * EvalRunner — alignment testing, bootstrap stress tests, self-consistency.
 *
 * Implements the full pipeline from Chrome AI Evals guide (parts 1 & 2):
 *   https://developer.chrome.com/docs/ai/evals/judge-basic
 *   https://developer.chrome.com/docs/ai/evals/judge-basic-2
 *
 * Usage from any POM (DriverPage subclass) or standalone:
 *
 *   const runner = new EvalRunner(judge);
 *   const metrics = await runner.runAlignment(dataset);
 *   const bootstrap = await runner.runBootstrap(dataset, { iterations: 10, sampleSize: 30 });
 *   const consistency = await runner.runSelfConsistency(entries, 5);
 */

import { LlmJudge, JudgeOutcome } from './judge';
import {
  EvalLabel,
  EvalResult,
  EvalMetrics,
  AlignmentEntry,
  AlignmentResult,
  BootstrapResult,
  ConsistencyResult,
  RuleEvalFn,
} from './types';

export class EvalRunner {
  constructor(private readonly judge: LlmJudge) {}

  // ─── Alignment test ──────────────────────────────────────────────────

  /**
   * Run the judge against a human-labeled alignment dataset.
   * Returns per-entry results and aggregate alignment score.
   */
  async runAlignment(dataset: AlignmentEntry[]): Promise<{
    results: AlignmentResult[];
    metrics: EvalMetrics;
  }> {
    const results: AlignmentResult[] = [];

    for (const entry of dataset) {
      const outcome = await this.judge.evaluate({
        criteria: entry.criteria,
        candidateOutput: entry.candidateOutput,
        context: entry.context,
        examples: entry.examples,
      });

      if ('unavailable' in outcome) {
        throw new Error(`Judge unavailable for entry "${entry.id}": ${outcome.unavailable}`);
      }

      const judgeLabel = 'data' in outcome ? outcome.data.label : EvalLabel.FAIL;
      const judgeRationale = 'data' in outcome
        ? outcome.data.rationale
        : outcome.parseError;

      results.push({
        id: entry.id,
        humanLabel: entry.humanLabel,
        judgeLabel,
        judgeRationale,
        aligned: judgeLabel === entry.humanLabel,
      });
    }

    const aligned = results.filter((r) => r.aligned).length;
    const passed = results.filter((r) => r.judgeLabel === EvalLabel.PASS).length;

    return {
      results,
      metrics: {
        total: results.length,
        passed,
        failed: results.length - passed,
        passRate: results.length > 0 ? (passed / results.length) * 100 : 0,
        aligned,
        alignmentScore: results.length > 0 ? (aligned / results.length) * 100 : 0,
      },
    };
  }

  // ─── Bootstrap stress test ───────────────────────────────────────────

  /**
   * Resample the alignment dataset with replacement N times.
   * Compute alignment score for each iteration, then mean + variance.
   *
   * Stable = variance < threshold (default 5%).
   */
  async runBootstrap(
    dataset: AlignmentEntry[],
    opts: { iterations?: number; sampleSize?: number; varianceThreshold?: number } = {},
  ): Promise<BootstrapResult> {
    const iterations = opts.iterations ?? 10;
    const sampleSize = Math.min(opts.sampleSize ?? 30, dataset.length);
    const varianceThreshold = opts.varianceThreshold ?? 5;
    const scores: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const sample = this.resampleWithReplacement(dataset, sampleSize);
      const { metrics } = await this.runAlignment(sample);
      scores.push(metrics.alignmentScore!);
    }

    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance =
      scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length;

    return {
      iterations,
      sampleSize,
      scores,
      mean,
      variance,
      stable: variance < varianceThreshold,
    };
  }

  // ─── Self-consistency test ───────────────────────────────────────────

  /**
   * Run the same entries through the judge multiple times.
   * With temperature 0, all runs should produce identical labels.
   *
   * Returns per-entry consistency and overall pass/fail.
   */
  async runSelfConsistency(
    entries: AlignmentEntry[],
    runs: number = 3,
  ): Promise<{ results: ConsistencyResult[]; allConsistent: boolean }> {
    const results: ConsistencyResult[] = [];

    for (const entry of entries) {
      const labels: EvalLabel[] = [];

      for (let r = 0; r < runs; r++) {
        const outcome = await this.judge.evaluate({
          criteria: entry.criteria,
          candidateOutput: entry.candidateOutput,
          context: entry.context,
          examples: entry.examples,
        });
        if ('unavailable' in outcome) {
          throw new Error(`Judge unavailable for entry "${entry.id}": ${outcome.unavailable}`);
        }
        labels.push('data' in outcome ? outcome.data.label : EvalLabel.FAIL);
      }

      const allSame = labels.every((l) => l === labels[0]);
      results.push({ id: entry.id, runs: labels, consistent: allSame });
    }

    return {
      results,
      allConsistent: results.every((r) => r.consistent),
    };
  }

  // ─── Rule-based eval aggregation ─────────────────────────────────────

  /**
   * Run rule-based evals across a batch of candidate outputs.
   * Returns aggregate metrics (pass rate).
   */
  static runRuleBatch(
    candidates: string[],
    evalFn: RuleEvalFn,
  ): { results: EvalResult[]; metrics: EvalMetrics } {
    const results = candidates.map((c) => evalFn(c));
    const passed = results.filter((r) => r.label === EvalLabel.PASS).length;

    return {
      results,
      metrics: {
        total: results.length,
        passed,
        failed: results.length - passed,
        passRate: results.length > 0 ? (passed / results.length) * 100 : 0,
      },
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────

  private resampleWithReplacement<T>(arr: T[], size: number): T[] {
    const out: T[] = [];
    for (let i = 0; i < size; i++) {
      out.push(arr[Math.floor(Math.random() * arr.length)]);
    }
    return out;
  }
}
