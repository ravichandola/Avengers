# Beginner track — performance testing & this framework

Start here if you are **new to performance testing** or **new to this repository**. These pages assume you can read TypeScript and HTTP (URLs, methods, headers, JSON) but **do not** assume prior load-testing experience.

## Reading order

| Order | Document | What you get |
|-------|----------|----------------|
| 1 | [**Performance testing for engineers**](./performance-testing-for-engineers.md) | Concepts, repo layout, API → scenario, **why not `*.spec.ts`**, **how to run** (commands + artifacts), pitfalls |
| 2 | [QUICKSTART.md](../QUICKSTART.md) | Short recap: scripts, commands, file map |
| 3 | [WORKFLOW.md](../WORKFLOW.md) | Detailed workflow (install, DSL reference, CI, debugging) |
| 4 | [ARCHITECTURE.md](../ARCHITECTURE.md) | Why modules are separated (hexagon, adapters, events) |

## Example code to open while you read

From the **package root** ([`../..`](../../)):

- [`examples/jsonplaceholder-load.scenario.ts`](../../examples/jsonplaceholder-load.scenario.ts) — a full scenario (load profile + GET + POST + SLA).
- [`examples/run-jsonplaceholder-load.ts`](../../examples/run-jsonplaceholder-load.ts) — how a scenario is executed locally (this is **not** a Playwright `*.spec.ts`; see the guide §8).

**Package root** = the parent folder of `performance-docs/` (where `package.json` lives).
