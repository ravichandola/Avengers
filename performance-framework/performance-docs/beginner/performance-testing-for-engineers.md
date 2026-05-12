# Performance testing for engineers — concepts, this framework, and your first API scenario

This guide answers, in order: **what** performance testing is, **which parts** exist in a typical setup, **how this repo implements them**, **where code lives**, **how to translate everyday REST APIs into scripts**, and **how to run** and read results.

---

## 1. What is performance testing?

**Functional tests** ask: *Does the system behave correctly for one user, one path, with expected data?* (Pass/fail on business rules.)

**Performance tests** ask: *How does the system behave under **many concurrent users** and **sustained traffic**?* You care about **speed**, **stability**, **capacity**, and **failure modes** when the system is busy — not a single “happy path” check.

Typical questions performance work answers:

| Question | Rough meaning |
|----------|----------------|
| Can we handle **N** concurrent users? | Throughput and error rate under parallel sessions |
| Is latency **acceptable** for clients? | Response times (often **p95** / **p99**, not only averages) |
| Does the system **recover** after a traffic spike? | Spike / stress behavior |
| Does it stay healthy **over many hours**? | Soak / endurance (memory leaks, slow degradation) |
| At what point does it **break** or miss **SLAs**? | Stress to limits, breakpoint-style exploration |

Performance testing is **not** a replacement for unit or E2E tests. It complements them with **scale** and **time** dimensions.

---

## 2. Core ideas (vocabulary)

| Term | Plain language |
|------|----------------|
| **Virtual users (VUs)** | Simulated clients issuing HTTP requests (same idea as “threads” in many tools). |
| **Load profile** | How many users, how fast you **ramp** them up, how **long** they run, and patterns (steady, spike, step, etc.). |
| **Throughput** | How many operations (e.g. requests) the system completes per second under load. |
| **Latency** | Time from sending a request until a useful response is received (often measured per request, then summarized). |
| **Percentiles (p95, p99)** | “95% of requests were faster than X ms.” Averages hide outliers; percentiles match how SLAs are often written. |
| **SLA (Service Level Agreement)** | Contract-style limits (e.g. “p95 under 500 ms” and “errors below 1%”). Tests can **fail the build** when violated. |
| **Scenario** | A defined user journey: which requests run, in what order, with what payloads and headers. |
| **Artifact** | Files produced by a run: raw samples, HTML/JSON reports, generated test plan, logs. |

---

## 3. What are the “components” in a performance setup?

Thinking from the **outside in**:

1. **Scenario definition** — *What to execute* (URLs, methods, bodies, headers, ordering, think times).
2. **Load controller** — *How hard to push* (users, ramp, duration, scheduling).
3. **Execution runtime** — *What actually generates HTTP traffic* (in this project, default is **Apache JMeter** in non-GUI mode).
4. **System under test (SUT)** — Your APIs/services (and dependencies): the thing you are measuring.
5. **Metrics collection** — Response times, status codes, success/failure (often from a results file — here, **JTL** from JMeter).
6. **Assertions / gates** — Compare metrics to SLAs and per-request expectations; decide pass/fail.
7. **Reporting** — Human and machine-readable output (HTML, JSON, Allure, etc.).

In **this framework**, items 1–2 are mostly **your TypeScript DSL**; item 3 is the **JMeter adapter**; 5–7 are **parsers + domain rules + reporters** wired through an **event bus** (see [ARCHITECTURE.md](../ARCHITECTURE.md) when you want the diagram).

---

## 4. How this package is organized (folder by folder)

Paths are relative to the **package root** (`performance-framework/`, i.e. the parent of `performance-docs/`).

```
performance-framework/
├── performance-docs/          # Markdown guides (includes beginner/)
├── contracts/                 # OPTIONAL cross-team interfaces (no Playwright)
├── src/
│   ├── dsl/                   # Fluent TypeScript scenario API (what you write most)
│   ├── ast/                   # ScenarioModel — pure data passed to engines
│   ├── domain/                # Load profiles, assertions, SLA shapes
│   ├── engine/                # PerformanceEngine port (compile + execute contract)
│   ├── adapters/jmeter/       # JMX generation, JMeter CLI, JTL parsing
│   ├── events/                # Event bus + assertion evaluation helpers
│   ├── reporting/             # HTML / JSON / Allure reporters
│   ├── plugins/               # Extension points for custom reporters/engines
│   ├── orchestration/         # RunOrchestrator — wires engine to a run
│   ├── realtime/              # WebSocket bridge for live dashboards (optional)
│   ├── observability/         # Telemetry hooks (optional)
│   └── cli/                   # Commander CLI (e.g. run:smoke)
├── examples/                  # Example scenarios and runners — copy these
├── dashboard/                 # Optional React UI for live metrics
├── ci/                        # Example CI snippets
├── docker/ / k8s/             # Example deployment layouts
├── perf-output/               # Generated per run (gitignored) — reports, JTL, JMX
├── package.json
└── tsconfig.json
```

**As a beginner, you mostly touch:**

| Area | You… |
|------|------|
| `examples/` (or your own folder next to it) | Write **scenarios** and **runners** |
| `performance-docs/` | Read how things work |
| `perf-output/` | Open **`index.html`** / **`report.json`** after a run (do not commit this folder) |

You **do not** need to edit `adapters/jmeter/` for normal API tests — that is maintenance for framework authors.

---

## 5. Mental model: from your script to JMeter to reports

1. You build a **`ScenarioModel`** with **`scenario(...).load(...).request(...).build()`** (`dsl/` → `ast/`).
2. **`JMeterEngine`** turns that model into a **`.jmx`** file and runs **`jmeter -n`** (`adapters/jmeter/`).
3. JMeter writes a **`.jtl`** file (CSV sample log).
4. The adapter **parses JTL**, emits **metric events**, and evaluates **SLAs** and **per-request assertions** (`events/`, `domain/`).
5. **Reporters** write **`report.json`**, **`index.html`**, **Allure** inputs under **`perf-output/<run-id>/`** (`reporting/`).

So: **TypeScript describes intent**; **JMeter is the motor**; **this repo** standardizes compilation, execution, and pass/fail.

---

## 6. Converting REST APIs into performance scenarios

You are already familiar with APIs as: **verb + URL + headers + optional body**. This framework uses the same — expressed in a fluent API.

### 6.1 Map HTTP to DSL helpers

| HTTP | DSL helper (import from `../src/index.js` in `examples/`) |
|------|-------------------------------------------------------------|
| GET | `get(url, label?)` |
| POST | `post(url, label?)` |
| PUT | `put(url, label?)` |
| PATCH | `patch(url, label?)` |
| DELETE | `del(url, label?)` |

**Always give a short `label` (second argument)** for requests you care about — it becomes the JMeter sample name and is used to **scope** assertions to the right rows in the results (e.g. `get('https://api.example.com/users/1', 'get-user')`).

### 6.2 Headers, JSON body, auth

- **Headers:** `.header('Content-Type', 'application/json')`, custom headers the same way.
- **Bearer token:** `.bearerToken(process.env.MY_TOKEN!)` (read secrets from env in your runner, not hard-coded).
- **JSON body:** `.body({ key: 'value' })` — serialized to JSON for the request.
- **Raw body:** `.rawBody('...')`.
- **GraphQL:** `.graphql(query, variables?)`.

### 6.3 Think time (pace of a “user”)

`.think({ type: 'fixed', ms: 250 })` inserts delay before the request in generated plans — models users not hammering as fast as possible.

### 6.4 Assertions (per request)

Examples: `.assertStatus(200)`, `.assertP95Below(500)`, `.assertP99Below(...)`.  
**Scenario-level** rules use **`.slaRule({ p95Ms, maxErrorRatePercent, ... })`** on the scenario builder.

### 6.5 Grouping flows: transactions

Use **`.transaction('Checkout', (tx) => { ... })`** to group steps (e.g. add to cart → pay). For JMeter, the inner steps still flatten to samplers; grouping helps structure your script and mirrors user journeys.

### 6.6 Load: what to put in `.load({ ... })`

You must set at least **`users`**. You usually set **`rampUp`** and **`duration`** with strings like `'30s'`, `'5m'`, `'1h'`. **`kind`** selects patterns such as **`constant`**, **`ramp_up`**, **`stress`**, **`spike`**, **`soak`**, **`volume`** (see [WORKFLOW.md](../WORKFLOW.md) for the full list and fields like `dataSource` for CSV-driven data).

### 6.7 From Postman or curl to a line of code

**curl:**

```bash
curl -s -X POST 'https://api.example.com/v1/orders' \
  -H 'Authorization: Bearer '"$TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"sku":"abc","qty":1}'
```

**Rough scenario fragment:**

```ts
.request(
  post('https://api.example.com/v1/orders', 'create-order')
    .header('Content-Type', 'application/json')
    .bearerToken(process.env.API_TOKEN!)
    .body({ sku: 'abc', qty: 1 })
    .assertStatus(201)
    .assertP95Below(800),
)
```

You then choose **how many users** and **how long** in `.load({ ... })`.

---

## 7. Where to put your scripts

**Recommended for learning:** add files under **`examples/`** next to the shipped samples:

| File | Role |
|------|------|
| `examples/my-service.scenario.ts` | Exports `myModel = scenario('...').load(...).request(...).build()` |
| `examples/run-my-service.ts` | Imports `myModel`, creates `perf-output/<uuid>/`, wires bus + reporters + `JMeterEngine` + `RunOrchestrator`, calls `run`, sets exit code |

Copy **`examples/run-jsonplaceholder-load.ts`** as your runner template — only the import of the model changes for simple cases.

Add a **`package.json`** script if you want, e.g. `"example:my-service": "node --import tsx ./examples/run-my-service.ts"` (run from **package root**).

---

## 8. Why tests are not written as `*.spec.ts` (Playwright / Jest style)

If you are used to **Playwright** or **Jest**, you expect files like `something.spec.ts` with `test('...', async () => { ... })` that the **test runner** discovers and executes.

**This performance package is intentionally different:**

| Aspect | Functional `*.spec.ts` (e.g. Playwright) | This framework |
|--------|------------------------------------------|----------------|
| **Runner** | Playwright Test / Jest schedules many short tests. | **`node`** runs a **single entry script** (or the **`perf-fw`** CLI). That script builds a **scenario model** and calls **`RunOrchestrator.run()`**. |
| **Work shape** | Many isolated tests, fixtures, retries. | **One (or few) long runs**: ramp users, hold duration, many HTTP samples, often **minutes** of traffic. |
| **Execution engine** | Browser or direct `fetch` in-process. | Default **JMeter non-GUI** subprocess (`jmeter -n`), with **`.jmx`** + **`.jtl`** on disk — not the same lifecycle as `test.describe()`. |
| **Artifact** | Traces, screenshots, Playwright report. | **`perf-output/<run-id>/`** (JTL, JSON, HTML, Allure inputs). |
| **Repo boundary** | The main **desktop-agent** repo is built around Playwright. | **Performance** is a **separate package** under `performance-framework/` so it can be versioned, run in **dedicated CI jobs**, and stay **free of Playwright imports** (see [ARCHITECTURE.md](../ARCHITECTURE.md)). |

So you write **scenario modules** (`*.scenario.ts` is a useful naming convention, but not required) that **export a built model**, plus a small **runner** `run-*.ts` that wires **JMeter + reporters** — or you call the built-in **`run:smoke`** CLI command.

**Could you wrap a scenario in Playwright later?** Possible as a **thin integration** (e.g. one Playwright test that spawns the perf runner), but that is **not** the default: long runs, resource usage, and **CI ownership** are kept separate from functional suites. The beginner path is: **npm script or `node --import tsx ./examples/run-....ts`**.

---

## 9. How to run tests (step by step)

All commands below are from the **package root** (`performance-framework/`, where `package.json` lives).

### 9.1 One-time / per machine

1. Install **Node.js 20+** and **Java** (JMeter needs a JVM).  
2. Install **Apache JMeter** and either:
   - add its **`bin`** directory to your **`PATH`** (so `jmeter -v` works), **or**  
   - set **`JMETER_HOME`** to the JMeter install directory (the folder that contains `bin/jmeter`).

Sanity check:

```bash
java -version
jmeter -v
# or:
echo "$JMETER_HOME" && ls "$JMETER_HOME/bin/jmeter"
```

### 9.2 Every clone (or CI job)

```bash
cd performance-framework
npm ci
npm run build
```

This compiles TypeScript to **`dist/`** (including **`dist/cli/perf.js`**).

### 9.3 Run the built-in smoke test

Uses a tiny POST to httpbin; good for “is JMeter + wiring OK?”

```bash
# If JMeter is not on PATH:
export JMETER_HOME=/path/to/apache-jmeter-5.x.x

node dist/cli/perf.js run:smoke --env local
# optional:
# node dist/cli/perf.js run:smoke --jmeter-home "$JMETER_HOME"
```

Exit code **0** = run passed SLAs/assertions; **non-zero** = failed gate.

### 9.4 Run the JSONPlaceholder example (beginner tutorial)

Same as in the docs — exercises GET + POST + load profile:

```bash
export JMETER_HOME=/path/to/apache-jmeter-5.x.x   # if needed
npm run example:jsonplaceholder
```

### 9.5 Run your own runner (TypeScript, fast iteration)

```bash
node --import tsx ./examples/run-my-load.ts
```

After **`npm run build`**, you can run compiled JS instead of `tsx` if you compile your examples into `dist/` (optional setup).

### 9.6 Where to look after a run

The script prints a line like **`Run directory: .../perf-output/<uuid>`**. In that folder:

| File / folder | Use |
|---------------|-----|
| **`index.html`** | Open in a browser — high-level pass/fail and violations. |
| **`report.json`** | All metric samples + summary (good for CI or trends). |
| **`results.jtl`** | Raw JMeter CSV — deep debugging. |
| **`scenario.jmx`** | Generated plan — verify URLs and payloads. |

Do **not** commit **`perf-output/`**; it is **gitignored**.

More detail: [WORKFLOW.md](../WORKFLOW.md) and [QUICKSTART.md](../QUICKSTART.md).

---

## 10. What “convert APIs for performance testing” really means in practice

1. **List endpoints** that represent real user or system flows (not every micro-endpoint at once unless needed).  
2. For each endpoint, capture **method, URL, headers, body shape, and expected status**.  
3. Decide **environment** (base URL, tokens) — use **environment variables** in runners.  
4. Choose **load**: how many users, ramp, duration, and what **SLA** matters (p95/p99, max error rate).  
5. Implement as **`.request(get(...))` / `.request(post(...))`** chains; use **`.transaction`** for multi-step flows.  
6. Run in a **lower environment** first; then align with **CI** (see `ci/` examples) and gates on **`summary.passed`**.

**Correlation** (extract token from response A, use in request B): the AST supports **capture** metadata; full JMeter-style correlation is an advanced topic — start with stateless or env-provided tokens.

---

## 11. Pitfalls beginners hit

| Symptom | Likely cause |
|---------|----------------|
| `jmeter: command not found` | Install JMeter or set **`JMETER_HOME`** / `PATH`. |
| Very high failure rate | Wrong base URL, auth, or environment; or SUT throttling you. |
| Assertions fail on mixed endpoints | Ensure each request has a **unique `label`** and statuses match reality (201 vs 200). |
| Huge `perf-output/` | Normal — clean old runs locally; in CI, upload artifacts then discard. |

---

## 12. What to read next

- [Beginner index](./README.md) — links to this page and the rest of the docs.  
- [QUICKSTART.md](../QUICKSTART.md) — condensed commands and file map.  
- [WORKFLOW.md](../WORKFLOW.md) — exhaustive workflow and DSL reference.  
- [ARCHITECTURE.md](../ARCHITECTURE.md) — why **`dsl`** must not import **`adapters/jmeter`**, event flow, and extension points.

Once you have a scenario running locally, you have the same building blocks used in larger **stress**, **spike**, and **soak** efforts — only the **`load`** block and environment change.
