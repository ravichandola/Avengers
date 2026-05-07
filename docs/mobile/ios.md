# Mobile automation — iOS

iOS tests use **Appium** with **XCUITest** (via **WebdriverIO** remote client). The **`app`** fixture becomes a **`MobileDriver`** when the project metadata sets **`platform: 'ios'`**.

## When is this guide for you?

You automate **iOS apps** (simulator or real device) and already use or can run **Appium 2+**.

**Shared concepts:** [Fixtures & `IDriver`](../common/fixtures-and-idriver.md). **Stack diagram:** [Architecture overview §13.3](../architecture/overview.md#133-mobile-ios--android).

## Prerequisites

1. **macOS** — Xcode and iOS Simulator (typical dev setup).
2. **Appium** installed and running, e.g.:
   ```bash
   appium
   ```
   Default URL used in code: **`http://localhost:4723`** with path **`/wd/hub`** (see `MobileDriver`).
3. **Optional dependency:** **`webdriverio`** is listed as an **optionalDependency** in `package.json`. Install if needed:
   ```bash
   npm install webdriverio
   ```
4. **Driver/iOS dependencies** — Appium XCUITest driver and Xcode command-line tools per Appium docs.

## Configuration

### File naming

Tests must be **`*.mobile.spec.ts`**. Both **`mobile-ios`** and **`mobile-android`** match this pattern — **which OS runs** depends on **`--project`**.

### Playwright project (`mobile-ios`)

Example metadata from `playwright.config.ts`:

```typescript
metadata: {
  platform: 'ios',
  mobile: {
    deviceName: 'iPhone 15',
    platformVersion: '17.0',
    automationName: 'XCUITest',
  },
},
```

You can extend **`mobile`** with **`bundleId`**, **`appPath`**, **`appiumHost`**, **`appiumPort`** via **`FrameworkConfig`** (`src/core/config.ts`) — align extra keys with how fixtures pass `metadata` into `DriverFactory`.

### Launch options (iOS)

| Option | Purpose |
|--------|---------|
| `bundleId` | App bundle identifier (e.g. `com.company.app`) |
| `name` | Can map to **`appium:app`** path when used as app source |

Capabilities are merged in **`MobileDriver.launch()`** — check **`src/drivers/mobile/mobile-driver.ts`** for exact capability names.

## Running tests

```bash
npm run test:mobile
# or explicitly:
npx playwright test --project=mobile-ios
```

Single file:

```bash
npx playwright test --project=mobile-ios tests/mobile/ios-login.mobile.spec.ts
```

**Important:** Start **Appium** before tests, or sessions will fail with connection errors.

## Writing tests

```typescript
import { test, expect } from '../../src/fixtures';

test('launch app', async ({ app }) => {
  await app.launch({
    bundleId: 'com.example.MyApp',
  });

  await app.click('login_button');
  await app.fill('username', 'testuser');
});
```

Selectors map to Appium locator strategies inside **`MobileDriver`** (`findElement`). Prefer **`accessibility id`** / stable IDs your app exposes.

## Configuration knobs (`MobileConfig`)

From **`src/core/config.ts`**:

| Field | Typical use |
|-------|-------------|
| `deviceName` | Simulator or device name |
| `platformVersion` | iOS version |
| `bundleId` | Default bundle if not passed in `launch` |
| `appPath` | `.ipa` / `.app` path when installing build |
| `automationName` | `XCUITest` |
| `appiumHost` / `appiumPort` | Non-default Appium URL |

Override via **`playwright.config.ts`** `metadata.mobile` for your project.

## Troubleshooting

| Symptom | What to check |
|---------|----------------|
| `Failed to connect to Appium` | Appium running? Host/port match `MobileDriver` defaults? |
| Session starts then dies | Bundle ID / signing / simulator boot |
| Element not found | Accessibility identifiers; wait strategies |
| wdio import error | `npm install webdriverio` |

## Related

- **Android:** [Android](./android.md)  
- **First test & setup:** [First test & setup](../configuration/first-test-and-setup.md)  
