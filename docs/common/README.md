# Common documentation

These pages describe features that **every platform** can use: the same **`IDriver`** contract, shared **fixtures**, **auth** profiles, **checkpoints**, **eval / LLM** tools, and the **POM generator**.

| Guide | What you will learn |
|--------|---------------------|
| [**Fixtures & `IDriver`**](./fixtures-and-idriver.md) | Factory, vision wrapper, env layers, fixture matrix, `DriverPage` / `ElementRef`, links to browser / desktop / mobile / API guides |
| [**Auth & checkpoints**](./auth-and-checkpoints.md) | `.auth` storage, `.checkpoints` resume, `resumeKey` / `validateResume` / `uiResumeValidator`, worker-scoped `testId`, mid-step `resumable.checkpoint`, portable `copyable/` module |
| [**Eval framework**](./eval-framework.md) | Rule-based and LLM judges, datasets, alignment |
| [**LLM providers**](./llm-providers.md) | API keys, models, switching providers |
| [**POM generator**](./pom-generator.md) | CLI to scaffold POMs from DOM, AX, mobile, or OpenAPI-style inputs |

Start here after [First test & setup](../configuration/first-test-and-setup.md) if you are new.

[← Documentation home](../README.md)
