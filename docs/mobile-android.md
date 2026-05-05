# Mobile automation — Android

Android tests use **Appium** with **UiAutomator2** (via **WebdriverIO** remote). The **`app`** fixture uses **`MobileDriver`** when the project sets **`platform: 'android'`**.

## When is this guide for you?

You automate **Android** apps (emulator or device) with **Appium 2+**.

## Prerequisites

1. **Android SDK / emulator** or physical device with USB debugging.
2. **Appium** server running (default **`localhost:4723`**, path **`/wd/hub`** in `MobileDriver`).
3. **Optional:** `npm install webdriverio` if optional deps were skipped.
4. **UiAutomator2** driver installed for Appium (per Appium documentation).

## Configuration

### File naming

Use **`*.mobile.spec.ts`**. Pick the Android project explicitly:

```bash
npx playwright test --project=mobile-android
```

### Playwright project (`mobile-android`)

Example metadata:

```typescript
metadata: {
  platform: 'android',
  mobile: {
    deviceName: 'Pixel 7',
    platformVersion: '14',
    automationName: 'UiAutomator2',
  },
},
```

### Launch options (Android)

| Option | Purpose |
|--------|---------|
| `appPackage` | Java package (e.g. `com.example.app`) |
| `appActivity` | Launch activity name |
| `name` | May map to app path when wiring **`appium:app`** |

See **`MobileDriver.launch()`** for how capabilities are assembled.

## Running tests

```bash
npx playwright test --project=mobile-android
```

There is no dedicated `npm` script for Android only by default — add one if you like:

```json
"test:android": "npx playwright test --project=mobile-android"
```

## Writing tests

```typescript
import { test, expect } from '../../src/fixtures';

test('open app and tap', async ({ app }) => {
  await app.launch({
    appPackage: 'com.example.app',
    appActivity: '.MainActivity',
  });

  await app.click('sign_in');
  await app.fill('email_field', 'user@example.com');
});
```

Prefer **content-desc**, **resource-id**, or stable selectors your `findElement` mapping supports.

## Configuration knobs (`MobileConfig`)

| Field | Typical use |
|-------|-------------|
| `deviceName` | AVD or device name |
| `platformVersion` | Android API level / version |
| `appPackage` / `appActivity` | Defaults when not passed to `launch` |
| `appPath` | APK path |
| `automationName` | `UiAutomator2` |
| `appiumHost` / `appiumPort` | Custom Appium URL |

## Troubleshooting

| Issue | What to check |
|-------|----------------|
| Cannot connect | Appium up? Correct host/port? |
| Activity never loads | Correct `appActivity`; app installed on device |
| Element not found | Scroll/wait; use stable resource ids |
| Wrong device | `adb devices`; emulator booted |

## Related

- **iOS:** [mobile-ios.md](./mobile-ios.md)  
- **Getting started:** [getting-started.md](./getting-started.md)  
