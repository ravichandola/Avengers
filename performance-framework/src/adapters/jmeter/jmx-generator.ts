import { create } from 'xmlbuilder2';
import type { RequestDefinition, ScenarioModel, StepDefinition } from '../../ast/scenario-model.js';
import { durationToSeconds } from './duration-parse.js';

type XmlRoot = ReturnType<typeof create>;

function flattenRequests(steps: StepDefinition[], acc: RequestDefinition[] = []): RequestDefinition[] {
  for (const s of steps) {
    if (s.type === 'request') acc.push(s.request);
    else if (s.type === 'parallel' || s.type === 'sequence') flattenRequests(s.steps, acc);
    else if (s.type === 'transaction') flattenRequests(s.steps, acc);
    else if (s.type === 'websocket') {
      /* WebSocket requires JMeter plugin; skipped in portable JMX */
    }
  }
  return acc;
}

function strProp(parent: XmlRoot, name: string, value: string | number): void {
  parent.ele('stringProp', { name }).txt(String(value)).up();
}

function boolProp(parent: XmlRoot, name: string, value: boolean): void {
  parent.ele('boolProp', { name }).txt(value ? 'true' : 'false').up();
}

function addHttpSampler(parent: XmlRoot, r: RequestDefinition): void {
  const u = new URL(r.url);
  const pathWithQuery = `${u.pathname}${u.search}` || '/';
  const body =
    r.body?.graphql != null
      ? JSON.stringify({ query: r.body.graphql.query, variables: r.body.graphql.variables ?? {} })
      : r.body?.json != null
        ? JSON.stringify(r.body.json)
        : r.body?.raw;

  const sampler = parent.ele('HTTPSamplerProxy', {
    guiclass: 'HttpTestSampleGui',
    testclass: 'HTTPSamplerProxy',
    testname: r.name,
    enabled: 'true',
  });

  strProp(sampler, 'HTTPSampler.domain', u.hostname);
  strProp(sampler, 'HTTPSampler.port', u.port || (u.protocol === 'https:' ? '443' : '80'));
  strProp(sampler, 'HTTPSampler.protocol', u.protocol.replace(':', ''));
  strProp(sampler, 'HTTPSampler.path', pathWithQuery);
  strProp(sampler, 'HTTPSampler.method', r.method);
  boolProp(sampler, 'HTTPSampler.use_keepalive', true);

  if (body) {
    sampler.ele('boolProp', { name: 'HTTPSampler.postBodyRaw' }).txt('true').up();
    const args = sampler
      .ele('elementProp', { name: 'HTTPsampler.Arguments', elementType: 'Arguments' })
      .ele('collectionProp', { name: 'Arguments.arguments' })
      .ele('elementProp', { name: 'body', elementType: 'HTTPArgument' });
    strProp(args, 'Argument.value', body);
    strProp(args, 'Argument.metadata', '=');
    args.up().up().up();
  }

  sampler.up();
}

function addHeaderManager(parent: XmlRoot, r: RequestDefinition): void {
  const entries = Object.entries(r.headers);
  if (entries.length === 0) return;

  const mgr = parent.ele('HeaderManager', {
    guiclass: 'HeaderPanel',
    testclass: 'HeaderManager',
    testname: `Headers ${r.name}`,
    enabled: 'true',
  });
  const coll = mgr.ele('collectionProp', { name: 'HeaderManager.headers' });
  let i = 0;
  for (const [name, value] of entries) {
    const h = coll.ele('elementProp', { name: String(i++), elementType: 'Header' });
    strProp(h, 'Header.name', name);
    strProp(h, 'Header.value', value);
    h.up();
  }
  coll.up();
  mgr.up();
}

function addThinkTimer(parent: XmlRoot, r: RequestDefinition): void {
  const ms = r.thinkTime?.ms;
  if (ms == null || ms <= 0) return;

  const t = parent.ele('ConstantTimer', {
    guiclass: 'ConstantTimerGui',
    testclass: 'ConstantTimer',
    testname: `Think ${r.name}`,
    enabled: 'true',
  });
  strProp(t, 'ConstantTimer.delay', ms);
  t.up();
}

/** Builds JMeter 5.x compatible JMX. Only the JMeter adapter uses this. */
export function buildJmx(scenario: ScenarioModel): string {
  const requests = flattenRequests(scenario.steps);
  const users = scenario.load.users;
  const rampSec = durationToSeconds(scenario.load.rampUp, 1);
  const durationSec = scenario.load.duration
    ? durationToSeconds(scenario.load.duration, 60)
    : Math.max(30, rampSec + 10);

  const doc = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('jmeterTestPlan', { version: '1.2', properties: '5.0' })
    .ele('hashTree');

  const plan = doc.ele('TestPlan', {
    guiclass: 'TestPlanGui',
    testclass: 'TestPlan',
    testname: scenario.name,
    enabled: 'true',
  });
  boolProp(plan, 'TestPlan.functional_mode', false);
  boolProp(plan, 'TestPlan.tearDown_on_shutdown', true);
  boolProp(plan, 'TestPlan.serialize_threadgroups', false);
  plan.up();

  const planTree = doc.ele('hashTree');

  const tg = planTree.ele('ThreadGroup', {
    guiclass: 'ThreadGroupGui',
    testclass: 'ThreadGroup',
    testname: 'Scenario Thread Group',
    enabled: 'true',
  });
  strProp(tg, 'ThreadGroup.num_threads', users);
  strProp(tg, 'ThreadGroup.ramp_time', Math.max(1, Math.floor(rampSec)));
  boolProp(tg, 'ThreadGroup.scheduler', true);
  strProp(tg, 'ThreadGroup.duration', Math.max(1, Math.floor(durationSec)));
  tg.ele('stringProp', { name: 'ThreadGroup.on_sample_error' }).txt('continue').up();
  const loop = tg.ele('elementProp', { name: 'ThreadGroup.main_controller', elementType: 'LoopController' });
  boolProp(loop, 'LoopController.continue_forever', false);
  strProp(loop, 'LoopController.loops', '-1');
  loop.up();
  tg.up();

  const tgTree = planTree.ele('hashTree');

  /* JMeter expects ThreadGroup → hashTree → (element, hashTree)* — not a leading nested hashTree. */
  for (const r of requests) {
    if (Object.keys(r.headers).length > 0) {
      addHeaderManager(tgTree, r);
      tgTree.ele('hashTree').up();
    }
    if (r.thinkTime?.ms != null && r.thinkTime.ms > 0) {
      addThinkTimer(tgTree, r);
      tgTree.ele('hashTree').up();
    }
    addHttpSampler(tgTree, r);
    tgTree.ele('hashTree').up();
  }

  tgTree.up();
  planTree.up();
  doc.up();

  return doc.end({ prettyPrint: true });
}
