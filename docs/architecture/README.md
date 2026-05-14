# Architecture documentation

Use these pages when you want to understand **how the framework is built**, not only how to configure a test.

| Document                             | Audience                                                                                                                                      |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| [**Overview (full)**](./overview.md) | Anyone who needs the complete picture: layers, fixtures, factory, POM, two LLM systems, config, porting, **§13** runtime deep dives, glossary |
| [**Browser**](./browser.md)          | Short browser-focused map + links to `BrowserDriver` files and user guides                                                                    |
| [**Desktop**](./desktop.md)          | `DesktopDriver`, macOS + Windows adapters, optional .NET sidecar, MCP alignment                                                               |
| [**Mobile**](./mobile.md)            | Appium / WebdriverIO path behind `MobileDriver`                                                                                               |
| [**API**](./api.md)                  | `APIDriver` — HTTP without a browser                                                                                                          |

**Prerequisite:** you should already know what **`IDriver`** and **fixtures** are — see [Common: fixtures & shared API](../common/fixtures-and-idriver.md).

Back to [documentation home](../README.md).
