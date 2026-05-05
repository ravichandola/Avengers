/**
 * Rule-based (deterministic) evaluators — no LLM required.
 *
 * Following Chrome AI Evals guide:
 *   https://developer.chrome.com/docs/ai/evals/rule-based
 *
 * Each function takes a candidate output string and returns EvalResult.
 * Compose them into eval pipelines alongside LLM judge evals.
 */

import { EvalLabel, EvalResult, RuleEvalFn } from './types';

/**
 * Check that a candidate string is valid JSON with all required keys present.
 */
export function evalJsonFormat(requiredKeys: string[]): RuleEvalFn {
  return (candidateOutput: string): EvalResult => {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(candidateOutput);
    } catch {
      return { label: EvalLabel.FAIL, rationale: 'Invalid JSON.' };
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { label: EvalLabel.FAIL, rationale: 'Expected a JSON object.' };
    }

    const missing = requiredKeys.filter((k) => !(k in parsed));
    if (missing.length > 0) {
      return { label: EvalLabel.FAIL, rationale: `Missing keys: ${missing.join(', ')}.` };
    }

    const empty = requiredKeys.filter((k) => {
      const v = parsed[k];
      return v === '' || v === null || v === undefined;
    });
    if (empty.length > 0) {
      return { label: EvalLabel.FAIL, rationale: `Empty values for: ${empty.join(', ')}.` };
    }

    return { label: EvalLabel.PASS, rationale: 'Valid JSON with all required keys present.' };
  };
}

/**
 * Check that a string value does not exceed a word count limit.
 */
export function evalMaxWords(field: string, maxWords: number): RuleEvalFn {
  return (candidateOutput: string): EvalResult => {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(candidateOutput);
    } catch {
      return { label: EvalLabel.FAIL, rationale: 'Invalid JSON.' };
    }

    const value = String(parsed[field] ?? '').trim();
    const words = value.replace(/[^\w\s]|_/g, '').trim();
    const count = words ? words.split(/\s+/).length : 0;

    if (count === 0) {
      return { label: EvalLabel.FAIL, rationale: `"${field}" is empty.` };
    }
    if (count > maxWords) {
      return { label: EvalLabel.FAIL, rationale: `"${field}" has ${count} words (max ${maxWords}).` };
    }

    return { label: EvalLabel.PASS, rationale: `"${field}" has ${count} words (within limit).` };
  };
}

/**
 * Check that a string matches a regex pattern.
 */
export function evalPattern(field: string, pattern: RegExp, description: string): RuleEvalFn {
  return (candidateOutput: string): EvalResult => {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(candidateOutput);
    } catch {
      return { label: EvalLabel.FAIL, rationale: 'Invalid JSON.' };
    }

    const value = String(parsed[field] ?? '');
    if (!pattern.test(value)) {
      return { label: EvalLabel.FAIL, rationale: `"${field}" does not match: ${description}.` };
    }

    return { label: EvalLabel.PASS, rationale: `"${field}" matches ${description}.` };
  };
}

/**
 * Check that a URL belongs to an expected domain.
 */
export function evalDomain(expectedDomain: string): RuleEvalFn {
  return (candidateOutput: string): EvalResult => {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(candidateOutput);
    } catch {
      return { label: EvalLabel.FAIL, rationale: 'Invalid JSON.' };
    }

    const url = String(parsed['url'] ?? '');
    const normalizedDomain = expectedDomain.replace(/^www\./, '');

    try {
      const hostname = new URL(url).hostname.replace(/^www\./, '');
      if (!hostname.includes(normalizedDomain)) {
        return { label: EvalLabel.FAIL, rationale: `URL "${url}" is not on ${expectedDomain}.` };
      }
    } catch {
      return { label: EvalLabel.FAIL, rationale: `"${url}" is not a valid URL.` };
    }

    return { label: EvalLabel.PASS, rationale: `URL belongs to ${expectedDomain}.` };
  };
}

/**
 * Check that a string field is non-empty.
 */
export function evalNonEmpty(field: string): RuleEvalFn {
  return (candidateOutput: string): EvalResult => {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(candidateOutput);
    } catch {
      return { label: EvalLabel.FAIL, rationale: 'Invalid JSON.' };
    }

    const value = String(parsed[field] ?? '').trim();
    if (!value) {
      return { label: EvalLabel.FAIL, rationale: `"${field}" is empty.` };
    }

    return { label: EvalLabel.PASS, rationale: `"${field}" is non-empty.` };
  };
}

/**
 * Compose multiple rule-based evals into one. Fails on first FAIL.
 */
export function composeRuleEvals(...evals: RuleEvalFn[]): RuleEvalFn {
  return (candidateOutput: string): EvalResult => {
    for (const evalFn of evals) {
      const result = evalFn(candidateOutput);
      if (result.label === EvalLabel.FAIL) return result;
    }
    return { label: EvalLabel.PASS, rationale: 'All rule-based checks passed.' };
  };
}

/**
 * Run all rule-based evals and return all results (not short-circuit).
 */
export function runAllRuleEvals(
  candidateOutput: string,
  evals: RuleEvalFn[],
): EvalResult[] {
  return evals.map((fn) => fn(candidateOutput));
}

/**
 * Calculate pass rate from an array of EvalResults.
 */
export function passRate(results: EvalResult[]): number {
  if (results.length === 0) return 0;
  const passed = results.filter((r) => r.label === EvalLabel.PASS).length;
  return (passed / results.length) * 100;
}
