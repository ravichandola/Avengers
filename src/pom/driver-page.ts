import { IDriver } from '../core/base-driver';
import { WaitOptions } from '../core/types';
import { ElementRef } from './element-ref';
import { LlmJudge, JudgeOutcome } from '../eval/judge';
import { EvalRunner } from '../eval/eval-runner';
import {
  EvalLabel,
  EvalResult,
  JudgeRequest,
  JudgeFewShotExample,
  AlignmentEntry,
  AlignmentResult,
  EvalMetrics,
  BootstrapResult,
  ConsistencyResult,
  RuleEvalFn,
} from '../eval/types';

export type { JudgeRequest, JudgeFewShotExample, EvalResult, AlignmentEntry };
export { EvalLabel };

/**
 * POM base for any IDriver — browser, desktop, mobile.
 *
 * Provides:
 *   - element() factory for lazy locators
 *   - Navigation / screenshot helpers
 *   - Full LLM-as-judge eval pipeline (Chrome AI Evals pattern):
 *       judgePassFail()    — single binary verdict
 *       runAlignment()     — dataset alignment scoring
 *       runBootstrap()     — bootstrap stress test
 *       runConsistency()   — self-consistency check
 *       runRuleBatch()     — deterministic eval aggregation
 *
 * Every POM subclass (browser, desktop, mobile) inherits the complete eval
 * toolkit. Page-specific POMs only need to provide criteria + candidate data.
 *
 * References:
 *   https://developer.chrome.com/docs/ai/evals/judge-basic
 *   https://developer.chrome.com/docs/ai/evals/judge-basic-2
 *   https://developer.chrome.com/docs/ai/evals/rule-based
 */
export abstract class DriverPage {
  private _judge: LlmJudge | null = null;
  private _runner: EvalRunner | null = null;

  constructor(protected readonly driver: IDriver) {}

  // ─── Element / navigation ────────────────────────────────────────────

  element(selector: string): ElementRef {
    return new ElementRef(this.driver, selector);
  }

  protected waitFor(selector: string, opts?: WaitOptions): Promise<void> {
    return this.driver.waitFor(selector, opts);
  }

  navigate(url: string): Promise<void> {
    return this.driver.navigate(url);
  }

  getTitle(): Promise<string> {
    return this.driver.getTitle();
  }

  getURL(): Promise<string> {
    return this.driver.getURL();
  }

  screenshot(): Promise<Buffer> {
    return this.driver.screenshot();
  }

  // ─── Judge access ────────────────────────────────────────────────────

  protected get judge(): LlmJudge {
    if (!this._judge) this._judge = new LlmJudge();
    return this._judge;
  }

  protected get evalRunner(): EvalRunner {
    if (!this._runner) this._runner = new EvalRunner(this.judge);
    return this._runner;
  }

  isLLMJudgeConfigured(): boolean {
    return this.judge.isConfigured();
  }

  // ─── Single verdict (PASS / FAIL) ───────────────────────────────────

  /**
   * Ask the LLM judge for a binary PASS/FAIL verdict.
   * Provide criteria (rubric), candidate output, optional context + few-shot examples.
   */
  protected async judgePassFail(request: JudgeRequest): Promise<JudgeOutcome> {
    return this.judge.evaluate(request);
  }

  // ─── Alignment testing ──────────────────────────────────────────────

  /**
   * Run the judge against a human-labeled alignment dataset.
   * Returns per-entry results and aggregate alignment score.
   */
  protected async runAlignment(dataset: AlignmentEntry[]): Promise<{
    results: AlignmentResult[];
    metrics: EvalMetrics;
  }> {
    return this.evalRunner.runAlignment(dataset);
  }

  // ─── Bootstrap stress test ──────────────────────────────────────────

  /**
   * Resample alignment dataset with replacement N times.
   * Reports mean alignment, variance, and stability flag.
   */
  protected async runBootstrap(
    dataset: AlignmentEntry[],
    opts?: { iterations?: number; sampleSize?: number; varianceThreshold?: number },
  ): Promise<BootstrapResult> {
    return this.evalRunner.runBootstrap(dataset, opts);
  }

  // ─── Self-consistency ───────────────────────────────────────────────

  /**
   * Run same inputs through judge multiple times to verify determinism.
   * With temperature 0, all labels should be identical.
   */
  protected async runConsistency(
    entries: AlignmentEntry[],
    runs?: number,
  ): Promise<{ results: ConsistencyResult[]; allConsistent: boolean }> {
    return this.evalRunner.runSelfConsistency(entries, runs);
  }

  // ─── Rule-based eval batch ──────────────────────────────────────────

  /**
   * Run a deterministic rule-based eval against multiple candidates.
   * Returns per-candidate results and aggregate pass rate.
   */
  protected runRuleBatch(
    candidates: string[],
    evalFn: RuleEvalFn,
  ): { results: EvalResult[]; metrics: EvalMetrics } {
    return EvalRunner.runRuleBatch(candidates, evalFn);
  }
}
