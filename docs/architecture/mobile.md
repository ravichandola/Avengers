# Mobile stack (architecture)

Mobile automation talks to **Appium** through a **WebdriverIO** **`remote`** session. **`MobileDriver`** implements **`IDriver`** by translating your generic actions into mobile locator strategies and WDIO commands.

## iOS vs Android

| Platform | Automation driver | Typical launch args |
|----------|-------------------|---------------------|
| iOS | XCUITest (Appium) | `bundleId`, app path |
| Android | UiAutomator2 | `appPackage`, `appActivity` |

## Diagram

See **§13.3** in [**overview.md**](./overview.md#133-mobile-ios--android).

## Key source files

| File | Role |
|------|------|
| `src/drivers/mobile/mobile-driver.ts` | `IDriver` over WDIO session |
| `src/drivers/mobile/pom/*` | `MobileScreen`, blocks |

## User guides

- [iOS](../mobile/ios.md)  
- [Android](../mobile/android.md)  

[← Architecture hub](./README.md) · [Documentation home](../README.md)
