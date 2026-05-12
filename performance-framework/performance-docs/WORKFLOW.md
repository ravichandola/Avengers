# Performance framework — full workflow guide

> **Location:** This file lives in [`performance-docs/`](./). Run all commands from the package root ([`..`](../)) unless noted.

This document is a **practical, end-to-end path** from zero to running load and performance tests with the `performance-framework` package. After setup, you can write TypeScript scenarios, execute them with **Apache JMeter** (the default engine), and collect **HTML, JSON, and Allure** artifacts. **New to performance testing?** Read [Performance testing for engineers](./beginner/performance-testing-for-engineers.md) first. For design boundaries and module layout, see [ARCHITECTURE.md](./ARCHITECTURE.md). For a **short summary** (first/second/third, scripting, commands), see [QUICKSTART.md](./QUICKSTART.md).

---

## 1. What you are building

| Layer | Your responsibility |
|--------|---------------------|
| **Scenario** | TypeScript using the DSL (`scenario`, `get` / `post`, `load`, `slaRule`, …) |
| **Execution** | Framework compiles to `.jmx`, runs `jmeter -n`, parses `.jtl`, evaluates SLAs |
| **Outputs** | Under `perf-output/<run-id>/` (reports, JMX, JTL) |
| **Automation** | Optional: GitHub Actions / Jenkins / GitLab templates in [`ci/`](../ci/), Docker in [`docker/`](../docker/), samples in [`k8s/`](../k8s/) |

The functional Playwright stack is **not** required. Optional shared auth shapes live in [`contracts/`](../contracts/).

---

## 2. Prerequisites

1. **Node.js** 20 or newer (`package.json` `engines`).
2. **Java** — required on the machine (or in the image) that launches JMeter.
3. **Apache JMeter** — either:
   - Installed locally with `jmeter` on `PATH`, or
   - Unpacked archive with **`JMETER_HOME`** set to that directory (see CLI `--jmeter-home`).

Sanity check:

```bash
java -version
jmeter -v
# If jmeter is not on PATH:
echo "$JMETER_HOME"
ls "$JMETER_HOME/bin/jmeter"
```

---

## 3. Install and build the framework

From the repository root (or anywhere you vendor this package):

```bash
cd performance-framework
npm ci
npm run build
```

- **Library entry:** `dist/index.js` / TypeScript types in `dist/*.d.ts`.
- **CLI binary:** `dist/cli/perf.js` (npm script name `perf-fw` when the package is linked/installed).

---

## 4. First run — built-in smoke test

The CLI ships **`run:smoke`**: a tiny scenario (HTTP POST to httpbin) to prove JMeter + reporters work.

```bash
cd performance-framework

# If JMeter is only reachable via JMETER_HOME:
export JMETER_HOME=/path/to/apache-jmeter-5.x.x

node dist/cli/perf.js run:smoke --env local
# Optional explicit home:
# node dist/cli/perf.js run:smoke --env local --jmeter-home "$JMETER_HOME"
```

**Expect:** exit code `0` if SLAs/assertions pass; non-zero if they fail. Artifacts land under:

`performance-framework/perf-output/<uuid>/`

Typical files:

- `report.json` — machine-readable summary (JSON reporter)
- `index.html` — HTML report: pass/fail, summary cards (samples, error %, throughput, global p95/p99), per-request latency table (mean/min/max/p50/p95/p99, HTTP code mix), violations, and a scrollable **recent samples** section
- `allure-results/` — Allure-compatible files
- `scenario.jmx` — generated plan
- `results.jtl` — raw JMeter samples

---

## 5. Mental model (one pass through the system)

1. You author a **`ScenarioModel`** using the **DSL** (fluent builders).
2. **`RunOrchestrator`** delegates to a **`PerformanceEngine`** (default: **`JMeterEngine`**).
3. The engine **compiles** the model → **JMX**, **runs** JMeter non-GUI, **reads** the JTL, **evaluates** assertions and SLA rules, and emits events on the **event bus**.
4. **Reporters** subscribe to events and write artifacts (HTML / JSON / Allure).

You do **not** edit JMX by hand for normal work; you extend or change the scenario in TypeScript.

---

## 6. Step-by-step: write a scenario file

### Step 6.1 — Create a folder for your tests

Example:

```
performance-framework/
  examples/
    my-api.scenario.ts
```

Use a **`.ts`** file that imports from the **built** package path **or** from `src` during development (the repo uses `tsx` for this).

### Step 6.2 — Import the DSL

Minimal imports:

```ts
import { scenario, get, post } from '../src/index.js';
// After `npm run build`, from another package you might use:
// import { scenario, get, post } from 'enterprise-performance-framework';
```

### Step 6.3 — Name the scenario and set load

**Load** describes how many virtual users, ramp, and duration. **`load()`** merges your fields with defaults (`kind` defaults to `constant` if you only pass `users` and timing).

```ts
const model = scenario('My API load test')
  .load({
    kind: 'constant',        // or stress, spike, soak, ramp_up, …
    users: 20,
    rampUp: '30s',
    duration: '5m',
  })
```

Supported **`kind`** values (see [`src/domain/load-profile.ts`](../src/domain/load-profile.ts)):  
`constant`, `ramp_up`, `ramp_down`, `spike`, `stress`, `step`, `burst`, `soak`, `breakpoint`, `volume`.

**Duration strings:** suffix with `s`, `m`, or `h` (e.g. `30s`, `5m`, `1h`).

**Optional advanced fields:** `rampDown`, `spikePeakUsers`, `spikeInterval`, `stepUsers`, `stepInterval`, `infiniteSoak` (soak), `dataSource` (CSV path + column names for data-driven volume-style tests).

Map your **business term** to **`kind`** roughly as:

| Goal | Typical `kind` / pattern |
|------|---------------------------|
| Baseline load | `constant` or `ramp_up` + `duration` |
| Stress | `stress`, higher `users`, longer `duration` |
| Spike | `spike` + peak/spike interval fields |
| Soak / endurance | `soak` + long `duration` or `infiniteSoak` (until you stop the run) |
| Volume | `volume` + large payloads / `dataSource` |

### Step 6.4 — Add HTTP steps

Use **`get`**, **`post`**, **`put`**, **`patch`**, **`del`** from the DSL.

```ts
  .request(
    post('https://api.example.com/v1/orders', 'create-order')
      .header('Content-Type', 'application/json')
      .body({ sku: 'demo', qty: 1 })
      .think({ type: 'fixed', ms: 250 })
      .assertStatus(201)
      .assertP95Below(800),
  )
```

Useful **`RequestBuilder`** methods:

- **`.header(name, value)`**, **`.cookie(name, value)`**, **`.bearerToken(token)`**
- **`.body(object)`** — JSON body  
- **`.rawBody(string)`** — non-JSON body  
- **`.graphql(query, variables?)`** — GraphQL JSON body
- **`.think({ type: 'fixed' \| 'uniform' \| 'gaussian', ms?, minMs?, maxMs? })`**
- **Assertions:** `.assertStatus`, `.assertP95Below`, `.assertP99Below`
- **`.captureJson(name, jsonPath)`** — declare capture metadata (engine support evolves)

### Step 6.5 — Group steps: transactions and parallel

**Transaction** (named block of steps):

```ts
  .transaction('Checkout', (tx) => {
    tx.request(get('https://api.example.com/cart').assertStatus(200));
    tx.request(post('https://api.example.com/checkout').assertStatus(200));
  })
```

**Parallel** requests (same level as a single `request`):

```ts
  .parallel(
    get('https://api.example.com/a'),
    get('https://api.example.com/b'),
  )
```

### Step 6.6 — Tags (optional)

```ts
  .tag('service', 'orders', 'nightly')
```

### Step 6.7 — SLA rules (scenario-level gates)

```ts
  .slaRule({
    name: 'orders-sla',
    p95Ms: 500,
    p99Ms: 1200,
    maxErrorRatePercent: 1,
  })
```

SLA rules contribute to the same assertion pipeline as per-request assertions. Failures surface as **`violations`** on the execution summary and fail the process exit code when wired like the CLI smoke command.

### Step 6.8 — Build the model

```ts
  .build();
```

`build()` returns a **`ScenarioModel`** (JSON-serializable AST). You can **`JSON.stringify`** it for inspection, caching, or future worker shipping — see [`examples/checkout.scenario.ts`](../examples/checkout.scenario.ts) which logs the model (`npm run start:example` only prints AST; it does **not** run JMeter unless you add a runner — see section 7).

---

## 7. Step-by-step: run *your* scenario (not just smoke)

The published CLI currently implements **`run:smoke`** only. To execute a **custom** `ScenarioModel`, use the same **composition** as the CLI: event bus → reporters → `JMeterEngine` → `RunOrchestrator`.

### Step 7.1 — Add a small runner script

Create e.g. `examples/run-my-load.ts`:

```ts
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
import { model } from './my-api.scenario.js'; // export `model` from your scenario file

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

const engine = new JMeterEngine({ jmeterHome: process.env.JMETER_HOME, eventBus: bus });
const orchestrator = new RunOrchestrator(engine);

const summary = await orchestrator.run(model, {
  runId,
  environment: process.env.PERF_ENV ?? 'local',
  artifacts: {
    workingDirectory: wd,
    primaryArtifactPath: join(wd, 'scenario.jmx'),
    resultsPath: join(wd, 'results.jtl'),
  },
  env: process.env,
});

if (!summary.passed) {
  console.error('Violations:', summary.violations);
  process.exitCode = 1;
}
```

Run with:

```bash
cd performance-framework
node --import tsx examples/run-my-load.ts
```

After **`npm run build`**, you can point `node` at compiled `.js` instead of `tsx`.

### Step 7.2 — Environment and secrets

- Pass tokens via **`process.env`** and build headers in TypeScript (**`.bearerToken(process.env.API_TOKEN!)`**), or implement an **`AuthProvider`** (see [`contracts/auth-provider.ts`](../contracts/auth-provider.ts)) in your runner before constructing requests.
- **Do not** commit secrets; use CI secret stores and `env:` in workflows.

### Step 7.3 — Pass/fail policy

Treat **`summary.passed`** and **`summary.violations`** as the **performance gate**. In CI, fail the job when the process exits non-zero (same pattern as [`ci/github-actions.example.yml`](../ci/github-actions.example.yml)).

---

## 8. Inspect results and debug

1. **Open HTML report** under `perf-output/<run-id>/`.
2. **Read `report.json`** for programmatic checks or trend storage.
3. **Inspect `scenario.jmx`** if a sampler is wrong (URL, method, body).
4. **Inspect `results.jtl`** for per-sample failures (JMeter-native debugging).
5. **Re-run with lower `users` / shorter `duration`** to isolate instability.

Common issues:

- **`jmeter: command not found`** — add JMeter `bin` to `PATH` or set **`JMETER_HOME`** / `--jmeter-home`.
- **Java errors** — verify **Java version** matches your JMeter distribution requirements.

---

## 9. Automation: CI

Templates are **examples** — copy into your org’s repo and adjust paths.

| Platform | File |
|----------|------|
| GitHub Actions | [`github-actions.example.yml`](../ci/github-actions.example.yml) |
| Jenkins | [`Jenkinsfile`](../ci/Jenkinsfile) |
| GitLab CI | [`gitlab-ci.example.yml`](../ci/gitlab-ci.example.yml) |

Typical stages: checkout → setup Node + Java → install JMeter → `npm ci` → `npm run build` → `node dist/cli/perf.js run:smoke` (or your custom runner) → upload `perf-output/**` → optional SLA gate step.

Keep **performance** workflows **separate** from functional Playwright pipelines (clear ownership and credentials).

---

## 10. Docker and Kubernetes (optional)

- **[`docker/docker-compose.yml`](../docker/docker-compose.yml)** — controller image + scalable **jmeter-worker** (local fan-out experiments); optional **InfluxDB + Grafana** profile for observability spikes.
- **[`docker/Dockerfile`](../docker/Dockerfile)** / **[`jmeter-worker.Dockerfile`](../docker/jmeter-worker.Dockerfile)** — build context is the **parent** of `docker/` (see compose `context: ..`).
- **[`k8s/`](../k8s/)** — sample namespace, deployments, HPA, ingress, secrets; treat as **starting points**, not production-ready without your policies (network policy, PDBs, quotas — described in ARCHITECTURE).

---

## 11. Live dashboard (optional)

The **[`dashboard/`](../dashboard/)** package is a **separate** Vite + React app. The framework can expose realtime events via **`attachDashboardBridge`** ([`src/realtime/dashboard-bridge.ts`](../src/realtime/dashboard-bridge.ts)) on the event bus. For day-one load testing you can ignore it; add it when you need live charts during a long run.

```bash
cd dashboard
npm ci
npm run dev
```

Wire-up details depend on your deployment; see [ARCHITECTURE.md](./ARCHITECTURE.md) §8.

---

## 12. Checklist — “I’m ready to work”

- [ ] Node 20+, Java, JMeter installed or available in CI image  
- [ ] `npm ci && npm run build` succeeds at the package root  
- [ ] `node dist/cli/perf.js run:smoke` passes locally  
- [ ] You have a **scenario file** using `scenario` + `load` + requests + optional `slaRule`  
- [ ] You have a **runner script** (or CI job) that wires `RunOrchestrator` + `JMeterEngine` + reporters  
- [ ] Artifacts and exit codes are understood by your pipeline  

---

## 13. Where to go next

- **Deep design:** [ARCHITECTURE.md](./ARCHITECTURE.md) — hexagonal layout, event bus, plugins, observability.  
- **Example AST:** [`examples/checkout.scenario.ts`](../examples/checkout.scenario.ts)  
- **Extending engines:** implement **`PerformanceEngine`** and register it in your composition root instead of `JMeterEngine`.  
- **Custom reporters:** implement **`Reporter`** and add instances to **`ReporterOrchestrator`**.

If you add new CLI subcommands (e.g. `perf run --scenario path.ts`), keep them as thin wrappers around the same orchestration block used above so CI and local runs stay consistent.
