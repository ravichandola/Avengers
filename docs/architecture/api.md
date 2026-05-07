# API stack (architecture)

**`APIDriver`** implements **`IDriver`** for HTTP-only testing. It uses **`fetch`** (and helpers for JSON / GraphQL). There is **no** browser and **no** **`VisionDriverWrapper`** — the factory returns **`APIDriver`** directly.

## Diagram

See **§13.4** in [**overview.md**](./overview.md#134-api-http).

## Key source files

| File | Role |
|------|------|
| `src/drivers/api/api-driver.ts` | GET/POST/…/GraphQL |
| `src/drivers/api/pom/*` | Optional grouping of endpoint helpers |

On **`api`** Playwright projects you can use the **`api`** fixture, or treat **`app`** as **`APIDriver`** when metadata is configured that way — see [Fixtures & `IDriver`](../common/fixtures-and-idriver.md).

## User guide

- [HTTP API testing](../api/http-testing.md)  

[← Architecture hub](./README.md) · [Documentation home](../README.md)
