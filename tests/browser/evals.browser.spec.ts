/**
 * Full LLM-as-judge eval pipeline for browser automation.
 *
 * Demonstrates the Chrome AI Evals pattern:
 *   1. Rule-based eval (deterministic)
 *   2. LLM judge single verdict (PASS/FAIL)
 *   3. Alignment dataset test
 *   4. Self-consistency check
 *
 * References:
 *   https://developer.chrome.com/docs/ai/evals/judge-basic
 *   https://developer.chrome.com/docs/ai/evals/judge-basic-2
 *   https://developer.chrome.com/docs/ai/evals/rule-based
 */

import { test, expect } from '../../src/fixtures';
import { NetflixPage } from '../pom';
import {
  EvalLabel,
  LlmJudge,
  EvalRunner,
  evalDomain,
  evalNonEmpty,
  composeRuleEvals,
} from '../../src/eval';
import type { AlignmentEntry } from '../../src/eval';

import * as fs from 'fs';
import * as path from 'path';

const DATASET_PATH = path.resolve(__dirname, '../../scripts/examples/alignment-dataset.sample.json');

test.describe('Eval Pipeline — Browser Landing Page', () => {

  // ─── 1. Rule-based eval ─────────────────────────────────────────────

  test('rule-based: validates URL domain and title are present', async ({ app }) => {
    const netflix = new NetflixPage(app);
    await netflix.openHome();

    const url = await netflix.getURL();
    const title = await netflix.getTitle();
    const candidate = JSON.stringify({ url, title });

    const ruleEval = composeRuleEvals(
      evalDomain('netflix.com'),
      evalNonEmpty('title'),
    );

    const result = ruleEval(candidate);
    expect(result.rationale.length).toBeGreaterThan(0);
    expect(result.label).toBe(EvalLabel.PASS);
  });

  // ─── 2. LLM judge single verdict ───────────────────────────────────

  test('llm judge: validates landing page quality (PASS/FAIL)', async ({ app }) => {
    test.skip(
      !process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY,
      'LLM judge key not configured',
    );

    const netflix = new NetflixPage(app);
    await netflix.openHome();

    const verdict = await netflix.judgeLandingQuality();
    expect(verdict.rationale.length).toBeGreaterThan(0);
    expect(typeof verdict.passed).toBe('boolean');
  });

  // ─── 3. Alignment dataset test ──────────────────────────────────────

  test('alignment: judge matches human labels on sample dataset', async () => {
    test.skip(
      !process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY,
      'LLM judge key not configured',
    );
    test.skip(!fs.existsSync(DATASET_PATH), 'alignment dataset not found');
    test.setTimeout(120_000);

    const raw = JSON.parse(fs.readFileSync(DATASET_PATH, 'utf8')) as AlignmentEntry[];
    const judge = new LlmJudge();
    const runner = new EvalRunner(judge);

    const { results, metrics } = await runner.runAlignment(raw);

    for (const r of results) {
      console.log(
        `[${r.id}] human=${r.humanLabel} judge=${r.judgeLabel} aligned=${r.aligned}`,
      );
    }

    console.log(`Alignment score: ${metrics.alignmentScore!.toFixed(1)}%`);
    expect(metrics.alignmentScore!).toBeGreaterThanOrEqual(80);
  });

  // ─── 4. Self-consistency ────────────────────────────────────────────

  test('consistency: judge returns same label for same input across runs', async () => {
    test.skip(
      !process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY,
      'LLM judge key not configured',
    );
    test.skip(!fs.existsSync(DATASET_PATH), 'alignment dataset not found');
    test.setTimeout(120_000);

    const raw = JSON.parse(fs.readFileSync(DATASET_PATH, 'utf8')) as AlignmentEntry[];
    const subset = raw.slice(0, 3);
    const judge = new LlmJudge();
    const runner = new EvalRunner(judge);

    const { results, allConsistent } = await runner.runSelfConsistency(subset, 3);

    for (const r of results) {
      console.log(
        `[${r.id}] runs=${r.runs.join(',')} consistent=${r.consistent}`,
      );
    }

    expect(allConsistent).toBe(true);
  });
});
