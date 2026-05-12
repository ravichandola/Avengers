import { mkdir, writeFile } from 'node:fs/promises';
import type { ScenarioModel } from '../../ast/scenario-model.js';
import type { ExecutionSummary, PerformanceEngine, RunContext } from '../../engine/performance-engine.js';
import type { Assertion } from '../../domain/load-profile.js';
import { PerformanceEventBus, evaluateAssertions } from '../../events/event-bus.js';
import { buildJmx } from './jmx-generator.js';
import { parseJtlCsv } from './jtl-parser.js';
import { readJtlFile, runJmeterNonGui } from './jmeter-cli-runner.js';

export interface JMeterEngineOptions {
  jmeterHome?: string;
  jmeterBin?: string;
  eventBus: PerformanceEventBus;
}

function collectAssertions(model: ScenarioModel): Assertion[] {
  const assertions: Assertion[] = [];
  for (const s of model.sla) {
    if (s.p95Ms != null) assertions.push({ kind: 'duration_p95', maxMs: s.p95Ms });
    if (s.p99Ms != null) assertions.push({ kind: 'duration_p99', maxMs: s.p99Ms });
    if (s.maxErrorRatePercent != null)
      assertions.push({ kind: 'error_rate', maxPercent: s.maxErrorRatePercent });
  }
  function walk(steps: typeof model.steps): void {
    for (const step of steps) {
      if (step.type === 'request') assertions.push(...step.request.assertions);
      else if (step.type === 'parallel' || step.type === 'sequence') walk(step.steps);
      else if (step.type === 'transaction') walk(step.steps);
    }
  }
  walk(model.steps);
  return assertions;
}

/** JMeter is only the execution runtime — orchestration lives here and above. */
export class JMeterEngine implements PerformanceEngine {
  readonly id = 'jmeter';

  constructor(private readonly options: JMeterEngineOptions) {}

  async compile(model: ScenarioModel, context: RunContext): Promise<void> {
    await mkdir(context.artifacts.workingDirectory, { recursive: true });
    const jmx = buildJmx(model);
    await writeFile(context.artifacts.primaryArtifactPath, jmx, 'utf8');
  }

  async execute(model: ScenarioModel, context: RunContext): Promise<ExecutionSummary> {
    const bus = this.options.eventBus;
    bus.emitTyped('run:begin', { runId: context.runId, scenarioName: model.name });
    bus.emitTyped('scenario:begin', { runId: context.runId, scenarioId: model.id });

    await this.compile(model, context);

    const { exitCode, log } = await runJmeterNonGui({
      jmeterHome: this.options.jmeterHome,
      jmeterBin: this.options.jmeterBin,
      jmxPath: context.artifacts.primaryArtifactPath,
      jtlPath: context.artifacts.resultsPath,
      env: context.env,
    });

    if (exitCode !== 0) {
      bus.emitTyped('log', { level: 'error', message: 'JMeter exited non-zero', data: log });
    }

    const jtlText = await readJtlFile(context.artifacts.resultsPath).catch(() => '');
    const samples = jtlText ? parseJtlCsv(jtlText) : [];

    for (const s of samples) {
      bus.emitTyped('metric:sample', {
        runId: context.runId,
        label: s.label,
        elapsedMs: s.elapsedMs,
        success: s.success,
        responseCode: s.responseCode,
        threadName: s.threadName,
      });
    }

    const scenarioAssertions = collectAssertions(model);
    const violations = [
      ...(exitCode !== 0 ? [`JMeter exit code ${exitCode}`] : []),
      ...evaluateAssertions(
        scenarioAssertions,
        samples.map((s) => ({
          elapsedMs: s.elapsedMs,
          success: s.success,
          responseCode: s.responseCode,
        })),
      ),
    ];

    const passed = violations.length === 0;

    for (const v of violations) {
      bus.emitTyped('sla:violation', { runId: context.runId, rule: 'aggregate', detail: v });
    }

    bus.emitTyped('scenario:end', { runId: context.runId, scenarioId: model.id });
    bus.emitTyped('run:end', { runId: context.runId, passed, violations });

    return {
      runId: context.runId,
      scenarioId: model.id,
      scenarioName: model.name,
      passed,
      violations,
    };
  }
}
