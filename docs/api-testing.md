# API testing (REST / GraphQL)

HTTP tests use the **`api`** fixture, backed by **`APIDriver`**. It shares the same test runner as UI tests but uses **`get` / `post` / `put` / `patch` / `delete`** instead of clicks.

## When is this guide for you?

You test **REST APIs**, optional **GraphQL**, or any JSON **HTTP** surface — without launching a browser.

## Configuration

### File naming

Tests must match **`*.api.spec.ts`**.

### Playwright project (`api`)

In `playwright.config.ts`, the **`api`** project sets:

```typescript
metadata: {
  platform: 'api',
  api: {
    baseURL: process.env.API_BASE_URL ?? 'https://jsonplaceholder.typicode.com',
  },
},
```

Set **`API_BASE_URL`** in `.env` to point at your backend:

```env
API_BASE_URL=https://api.staging.example.com
```

### Auth headers (optional)

`FrameworkConfig.api.auth` supports:

| Type | Behavior |
|------|----------|
| `bearer` | `Authorization: Bearer <token>` |
| `basic` | HTTP Basic from username/password |
| `apikey` | Custom header (default `X-API-Key`) |

Wire these through **`resolveConfig`** / project metadata if you extend the fixture to pass them (the structure exists in **`src/core/config.ts`**). For quick experiments, you can duplicate project metadata with embedded auth for non-production only.

## Running tests

```bash
npm run test:api
# or
npx playwright test --project=api
```

Single file:

```bash
npx playwright test --project=api tests/api/rest-crud.api.spec.ts
```

## Writing tests

```typescript
import { test, expect } from '../../src/fixtures';

test('GET collection', async ({ api }) => {
  const res = await api.get('/posts');

  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
});

test('POST resource', async ({ api }) => {
  const res = await api.post('/posts', {
    title: 'Hello',
    body: 'World',
    userId: 1,
  });

  expect(res.status).toBe(201);
  expect(res.body.title).toBe('Hello');
});
```

### GraphQL

```typescript
const res = await api.graphql(
  `query { me { id name } }`,
  { /* variables */ }
);
expect(res.status).toBe(200);
```

(Exact path `/graphql` is used inside **`APIDriver`** — adjust if your server uses a different route by extending the driver or adding options.)

### Response shape

`APIResponse` includes **`status`**, **`headers`**, **`body`** (parsed JSON or text), and **`duration`**.

## Using `app` vs `api`

- **`api`** — HTTP methods, ideal for contract tests.  
- **`app`** — Not used for pure API tests; **`IDriver`** UI methods on **`APIDriver`** intentionally throw — don’t call **`click`** on the API driver.

You can still call **`api.launch({ url: 'https://override-base' })`** to change base URL for a test if implemented (see **`APIDriver.launch`**).

## Troubleshooting

| Issue | What to check |
|-------|----------------|
| 404 / wrong host | `API_BASE_URL`, trailing slashes, path concatenation |
| TLS errors | Corporate proxy / certs (handle at Node/OS level) |
| Timeout | Increase **`api.timeout`** in config metadata |
| Auth failures | Bearer/basic/apikey wiring in config |

## Related

- [getting-started.md](./getting-started.md)  
- [advanced-auth-and-checkpoints.md](./advanced-auth-and-checkpoints.md) (different kind of “auth” — browser storage)  
