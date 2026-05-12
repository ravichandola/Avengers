#!/usr/bin/env node
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Command } from 'commander';
import { scenario } from '../dsl/scenario-builder.js';
import { post } from '../dsl/request-builders.js';
import { PerformanceEventBus } from '../events/event-bus.js';
import { ReporterOrchestrator } from '../reporting/reporter-orchestrator.js';
import { JsonReporter } from '../reporting/json-reporter.js';
import { HtmlReporter } from '../reporting/html-reporter.js';
import { AllureReporter } from '../reporting/allure-reporter.js';
import { JMeterEngine } from '../adapters/jmeter/jmeter-engine.js';
import { RunOrchestrator } from '../orchestration/run-orchestrator.js';
import { handlePerformanceReportCli } from '../reporting/report-cli.js';

const program = new Command()
  .name('perf-fw')
  .description(
    'Enterprise performance runner — TypeScript DSL over pluggable execution engines (default: JMeter runtime).',
  );

program
  .command('run:smoke')
  .description(
    'Run a built-in smoke scenario. JMeter is auto-detected (JMETER_HOME, PATH, Homebrew libexec). Optional: --jmeter-home.',
  )
  .option('--env <name>', 'Logical environment', 'local')
  .option('--jmeter-home <path>', 'JMETER_HOME')
  .option('--ci', 'CI / automation: on failure, print report path only (no local server, no hang)', false)
  .action(
    async (opts: { env: string; jmeterHome?: string; ci?: boolean }) => {
      const model = scenario('CLI smoke')
        .tag('smoke', 'cli')
        .load({ users: 1, rampUp: '1s', duration: '5s' })
        .request(post('https://httpbin.org/post').body({ hello: 'perf' }).assertStatus(200))
        .build();

      const runId = randomUUID();
      const wd = resolve(process.cwd(), 'perf-output', runId);
      await mkdir(wd, { recursive: true });

      const bus = new PerformanceEventBus();
      const reporters = new ReporterOrchestrator([
        new JsonReporter(wd),
        new HtmlReporter(wd),
        new AllureReporter(join(wd, 'allure-results')),
      ]);
      reporters.subscribe(bus);

      const engine = new JMeterEngine({ jmeterHome: opts.jmeterHome, eventBus: bus });
      const orchestrator = new RunOrchestrator(engine);

      const summary = await orchestrator.run(model, {
        runId,
        environment: opts.env,
        artifacts: {
          workingDirectory: wd,
          primaryArtifactPath: join(wd, 'scenario.jmx'),
          resultsPath: join(wd, 'results.jtl'),
        },
        env: process.env,
      });

      await handlePerformanceReportCli(wd, summary.passed, { forceNonInteractive: opts.ci === true });
      if (!summary.passed) process.exit(1);
    },
  );

await program.parseAsync(process.argv);
