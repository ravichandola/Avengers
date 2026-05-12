# Performance framework — what we built, how to script, how to run

> **Location:** This file lives in [`performance-docs/`](./). Framework package root is the parent directory ([`..`](../)).

A short companion to [WORKFLOW.md](./WORKFLOW.md) (full detail) and [ARCHITECTURE.md](./ARCHITECTURE.md) (design). **New to performance testing?** Start with the [beginner track](./beginner/README.md). **Why no Playwright `*.spec.ts` here?** See the table in [Performance testing for engineers §8](./beginner/performance-testing-for-engineers.md).

---

## First, second, third — what is in place

1. **First — Core flow**  
   You describe load in **TypeScript** (the DSL). The framework generates **JMeter** (`.jmx`), runs it, reads **`.jtl`**, checks **SLAs and assertions**, and writes reports under **`perf-output/<run-id>/`** (HTML, JSON, Allure results).

2. **Second — Example you can copy**  
   **[`examples/jsonplaceholder-load.scenario.ts`](../examples/jsonplaceholder-load.scenario.ts)** — real public API (`GET` + `POST` to jsonplaceholder.typicode.com), tags, load profile, SLA, and per-request assertions.  
   **[`examples/run-jsonplaceholder-load.ts`](../examples/run-jsonplaceholder-load.ts)** — wires the engine and reporters and runs that scenario.  
   **`npm run example:jsonplaceholder`** (from the **package root**: `cd` to the parent of `performance-docs/`) — one command to execute that example (JMeter must be on `PATH` or **`JMETER_HOME`** set).

3. **Third — Reliability fixes (already in the code)**  
   - **JMX** structure matches what JMeter expects (no extra wrapper `hashTree`), so tests do not crash at startup.  
   - **`assertStatus`** / latency assertions on each request apply only to **that request’s samples** (matched by JMeter **label** = the name you pass to `get()` / `post()`, etc.). Scenario-level **SLA** rules still use **all** samples together.

**Also:** [WORKFLOW.md](./WORKFLOW.md) is the full step-by-step guide. The **dashboard** ([`dashboard/`](../dashboard/)) is optional; run **`npm install`** there before `npm run dev` or `npm run build`.

---

## How to write your script (two small files)

### A) Scenario file — *what* to run

- Import **`scenario`**, **`get`**, **`post`** (and other verbs) from **`../src/index.js`** when working inside this repo (or from the published package name once you publish).
- Chain **`.load({ users, rampUp, duration, kind, ... })`**, optional **`.tag(...)`**, **`.slaRule({ ... })`**, then **`.request(...)`** or **`.transaction('Name', (tx) => { ... })`**.
- Finish with **`.build()`** and **export** the model so a runner can import it.

Minimal pattern:

```ts
import { scenario, get } from '../src/index.js';

export const myModel = scenario('My test')
  .load({ users: 5, rampUp: '10s', duration: '1m' })
  .slaRule({ name: 'api', p95Ms: 2000, maxErrorRatePercent: 5 })
  .request(get('https://your-api.example/health', 'health').assertStatus(200))
  .build();
```

Use a **distinct second argument** to `get`/`post` (e.g. `'health'`) as the **label**; it is used in reports and for scoping assertions.

### B) Runner file — *how* to execute

Copy **[`examples/run-jsonplaceholder-load.ts`](../examples/run-jsonplaceholder-load.ts)** and:

1. Import **your** `myModel` instead of `jsonPlaceholderLoadModel`.
2. Keep the same **mkdir → bus → reporters → `JMeterEngine` → `RunOrchestrator.run(...)`** block.
3. Optionally set **`process.exitCode = 1`** when **`!summary.passed`**.

Add an **`npm`** script in **`package.json`** (package root) if you want a short command, e.g. `"example:mine": "node --import tsx ./examples/run-mine.ts"`.

---

## How to run

| Goal | Command |
|------|--------|
| Install framework deps | `cd performance-framework && npm ci` |
| Compile TypeScript | `npm run build` |
| JMeter | `jmeter -v` **or** `export JMETER_HOME=/path/to/apache-jmeter-5.x.x` |
| Built-in smoke (httpbin) | `node dist/cli/perf.js run:smoke` |
| JSONPlaceholder example | `npm run example:jsonplaceholder` |
| Your runner (TS, dev) | `node --import tsx ./examples/run-mine.ts` |

After a run, open **`perf-output/<run-id>/index.html`** and **`report.json`** in that same folder.

---

## File map

| Path | Role |
|------|------|
| [`examples/jsonplaceholder-load.scenario.ts`](../examples/jsonplaceholder-load.scenario.ts) | Example scenario (DSL only) |
| [`examples/run-jsonplaceholder-load.ts`](../examples/run-jsonplaceholder-load.ts) | Example runner |
| [`src/cli/perf.ts`](../src/cli/perf.ts) | CLI (`run:smoke` today) |
| `perf-output/` (under package root) | Generated reports (created per run) |

For CI patterns, see [`ci/`](../ci/). For Docker/Kubernetes samples, see [`docker/`](../docker/) and [`k8s/`](../k8s/).
