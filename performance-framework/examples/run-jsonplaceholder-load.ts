import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  PerformanceEventBus,
  ReporterOrchestrator,
  JsonReporter,
  HtmlReporter,
  AllureReporter,
  JMeterEngine,
  RunOrchestrator,
} from '../src/index.js';
import { jsonPlaceholderLoadModel } from './jsonplaceholder-load.scenario.js';

const runId = randomUUID();
const wd = join(process.cwd(), 'perf-output', runId);
await mkdir(wd, { recursive: true });

const bus = new PerformanceEventBus();
const reporters = new ReporterOrchestrator([
  new JsonReporter(wd),
  new HtmlReporter(wd),
  new AllureReporter(join(wd, 'allure-results')),
]);
reporters.subscribe(bus);

const engine = new JMeterEngine({
  jmeterHome: process.env.JMETER_HOME,
  eventBus: bus,
});
const orchestrator = new RunOrchestrator(engine);

const summary = await orchestrator.run(jsonPlaceholderLoadModel, {
  runId,
  environment: process.env.PERF_ENV ?? 'local',
  artifacts: {
    workingDirectory: wd,
    primaryArtifactPath: join(wd, 'scenario.jmx'),
    resultsPath: join(wd, 'results.jtl'),
  },
  env: process.env,
});

console.log('Run directory:', wd);
console.log('Summary:', JSON.stringify(summary, null, 2));
console.log('Open HTML report:', join(wd, 'index.html'));

if (!summary.passed) {
  process.exitCode = 1;
}
