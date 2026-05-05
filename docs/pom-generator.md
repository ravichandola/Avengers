# POM Generator — Auto-Generate Page Object Models

The POM generator (`scripts/generate-pom.ts`) scaffolds Page Object Model classes from live app scans, XML page sources, JSON specs, or API endpoint definitions. It supports all 4 platforms: browser, mobile, desktop, and API.

---

## 1. What it does

Instead of hand-writing POM classes with selectors, the generator:
1. **Scans** the target (URL, AX tree, XML, or JSON spec)
2. **Extracts** interactive elements with their best selectors
3. **Generates** a TypeScript class extending the right base POM
4. **Optionally updates** the barrel export in `tests/pom/index.ts`

---

## 2. CLI usage

```bash
npx ts-node --project scripts/tsconfig.json scripts/generate-pom.ts <platform> [options]
```

### Browser — scan a URL with Playwright

```bash
npx ts-node --project scripts/tsconfig.json scripts/generate-pom.ts browser \
  --url https://www.netflix.com \
  --class-name NetflixPage \
  --update-index
```

| Flag | Required | Default | Description |
|------|----------|---------|-------------|
| `--url` | yes | — | Page URL to scan |
| `--class-name` | no | Derived from hostname + "Page" | POM class name |
| `--out` | no | `tests/pom/browser/<kebab>.ts` | Output file path |
| `--static-prop` | no | `entryUrl` | Name for the static URL property |
| `--max-elements` | no | 80 | Cap number of fields |
| `--update-index` | no | false | Append export to `tests/pom/index.ts` |

**How it works:** Launches headless Chromium, navigates to the URL, queries interactive DOM elements (`a[href]`, `button`, `input`, `select`, `textarea`, `[data-testid]`, etc.), and picks the best selector strategy per element (data-testid > id > name > aria-label > text > xpath).

### Mobile — parse Appium page source XML

```bash
npx ts-node --project scripts/tsconfig.json scripts/generate-pom.ts mobile \
  --source ./page-dump.xml \
  --class-name LoginMobileScreen
```

| Flag | Required | Default | Description |
|------|----------|---------|-------------|
| `--source` | yes | — | Path to Appium XML page source |
| `--class-name` | no | `GeneratedMobileScreen` | POM class name |
| `--out` | no | `tests/pom/mobile/<kebab>.ts` | Output file path |
| `--update-index` | no | false | Append export to index |

**How it works:** Parses iOS (`XCUIElementType*`) and Android (`android.widget.*`) XML. Extracts `name`, `label`, `resource-id`, `content-desc`, and `text` attributes as selectors.

**Tip:** Get XML from Appium Inspector or `driver.getPageSource()`.

### Desktop — live scan or JSON spec

#### Live scan (connects to running app)

```bash
npx ts-node --project scripts/tsconfig.json scripts/generate-pom.ts desktop \
  --app Notes \
  --class-name NotesScreen \
  --max-elements 100
```

#### From JSON spec

```bash
npx ts-node --project scripts/tsconfig.json scripts/generate-pom.ts desktop \
  --json ./notes-elements.json \
  --class-name NotesScreen
```

JSON format:
```json
{
  "elements": [
    { "property": "newNote", "selector": "New Note" },
    { "selector": "Search" }
  ]
}
```

| Flag | Required | Default | Description |
|------|----------|---------|-------------|
| `--app` | one of `--app` or `--json` | — | Live-scan a running app's AX tree |
| `--json` | one of `--app` or `--json` | — | Static JSON element list |
| `--class-name` | no | `<AppName>Screen` or `GeneratedDesktopScreen` | POM class name |
| `--max-elements` | no | 100 | Cap fields when using `--app` |
| `--out` | no | `tests/pom/desktop/<kebab>.ts` | Output file path |
| `--update-index` | no | false | Append export to index |

**Prerequisites:** For `--app`, the target app must be running and Accessibility permission must be granted.

### API — from endpoint spec JSON

```bash
npx ts-node --project scripts/tsconfig.json scripts/generate-pom.ts api \
  --json ./user-api.json
```

JSON format:
```json
{
  "className": "UserApi",
  "comment": "User management endpoints",
  "endpoints": [
    { "name": "listUsers", "method": "get", "path": "/users" },
    { "name": "getUser", "method": "get", "path": "/users/:id" },
    { "name": "createUser", "method": "post", "path": "/users" },
    { "name": "updateUser", "method": "put", "path": "/users/:id" },
    { "name": "deleteUser", "method": "delete", "path": "/users/:id" }
  ]
}
```

| Flag | Required | Default | Description |
|------|----------|---------|-------------|
| `--json` | yes | — | API endpoint spec JSON |
| `--out` | no | `tests/pom/api/<kebab>.ts` | Output file path |
| `--update-index` | no | false | Append export to index |

**Path parameters:** Segments like `:id` become TypeScript method parameters automatically.

---

## 3. Generated file structure

### Browser POM

```typescript
import { DriverPage } from '../../../src/pom/driver-page';

/** Auto-generated (browser) — https://www.netflix.com */
export class NetflixPage extends DriverPage {
  static readonly entryUrl = "https://www.netflix.com";
  readonly signIn = this.element("a:has-text(\"Sign In\")");
  readonly emailField = this.element("[name=\"userLoginId\"]");
  // ... more elements

  async open(): Promise<void> {
    await this.navigate(NetflixPage.entryUrl);
  }
}
```

### Desktop POM

```typescript
import { DesktopPage } from '../../../src/drivers/desktop/pom/desktop-page';
import { DesktopDriver } from '../../../src/drivers/desktop/desktop-driver';

/** Auto-generated (desktop — selectors = AX / System Events titles) */
export class NotesScreen extends DesktopPage {
  readonly newNote = this.element("New Note");
  readonly search = this.element("Search");

  constructor(driver: DesktopDriver) {
    super(driver);
  }
}
```

### Mobile POM

```typescript
import { MobileScreen } from '../../../src/drivers/mobile/pom/mobile-screen';
import { MobileDriver } from '../../../src/drivers/mobile/mobile-driver';

/** Auto-generated (mobile) */
export class LoginMobileScreen extends MobileScreen {
  readonly emailField = this.element("Email");
  readonly passwordField = this.element("Password");

  constructor(driver: MobileDriver) {
    super(driver);
  }
}
```

### API POM

```typescript
import { APIResponse } from '../../../src/core/types';
import { APIDriver } from '../../../src/drivers/api/api-driver';
import { EndpointGroup } from '../../../src/drivers/api/pom/endpoint-group';

/** Auto-generated (api) — User management endpoints */
export class UserApi extends EndpointGroup {
  constructor(api: APIDriver) {
    super(api);
  }

  listUsers(): Promise<APIResponse> {
    return this.get("/users");
  }

  getUser(id: string | number): Promise<APIResponse> {
    return this.get(`/users/${id}`);
  }

  createUser(body?: Record<string, unknown>): Promise<APIResponse> {
    return this.post("/users", body);
  }
}
```

---

## 4. How to extend

### Add a new selector strategy (browser)

Edit the `bestBrowserSelector()` function in `scripts/generate-pom.ts`. The priority order is:

1. `data-testid` → `[data-testid="value"]`
2. `id` → `#id`
3. `name` → `[name="value"]`
4. `aria-label` → `[aria-label="value"]`
5. `placeholder` → `[placeholder="value"]`
6. Text-based → `button:has-text("...")`, `a:has-text("...")`
7. Fallback → `xpath=`

### Add a new platform

1. Create a generator function (like `generateBrowserPom`)
2. Create a scanner function (like `scanBrowser`)
3. Add the platform to `parseArgs` and the `main()` switch
4. Add a help section in `printHelp()`

### Generate from MCP (Cursor)

The MCP desktop-bridge also has `generate_pom` and `generate_test` tools that do the same thing, but invoked by Cursor during chat. See [desktop-bridge-mcp.md](./desktop-bridge-mcp.md).
