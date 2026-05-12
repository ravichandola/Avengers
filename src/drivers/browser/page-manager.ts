import { Page, BrowserContext } from "playwright";
import { PageObject } from "./pom/page-object";
import { DialogHandler } from "./dialog-handler";
import { logger } from "../../utils/logger";

/**
 * Tab/page lifecycle, POM factory, dialog handling.
 *
 * ```ts
 * // POM factory (current tab):
 * const login = pages.create(LoginPage);
 * await login.login('user@test.com', 'pass');
 *
 * // New tab + POM:
 * const checkout = await pages.newPage(CheckoutPage, 'https://example.com/checkout');
 *
 * // Tab switching:
 * await pages.openNewTab('https://example.com');
 * pages.switchTo(0);
 *
 * // Dialog:
 * pages.dialogs.acceptNext('my input');
 * await pages.current().evaluate(() => prompt('Name?'));
 * ```
 */
export class PageManager {
  readonly dialogs = new DialogHandler();
  private context: BrowserContext;
  private activePage: Page | null = null;

  constructor(context: BrowserContext) {
    this.context = context;
    const pages = context.pages();
    if (pages.length > 0) {
      this.activePage = pages[pages.length - 1];
      this.attachDialogs(this.activePage);
    }
    context.on("page", (page) => this.attachDialogs(page));
  }

  // ─── POM Factory ──────────────────────────────────────────

  /** Instantiate a PageObject subclass on the current tab. */
  create<T extends PageObject>(PageClass: new (page: Page) => T): T {
    return new PageClass(this.current());
  }

  /**
   * Playwright `newPage` + POM: opens a new tab (optional `url`), returns your page class instance.
   * Active tab becomes this new page. For the current tab only, use {@link create}.
   */
  async newPage<T extends PageObject>(
    PageClass: new (page: Page) => T,
    url?: string,
  ): Promise<T> {
    const page = await this.openNewTab(url);
    return new PageClass(page);
  }

  // ─── Tab / Page Management ────────────────────────────────

  current(): Page {
    if (!this.activePage) {
      const pages = this.context.pages();
      if (pages.length === 0) throw new Error("No pages available");
      this.activePage = pages[pages.length - 1];
    }
    return this.activePage;
  }

  getAll(): Page[] {
    return this.context.pages();
  }

  count(): number {
    return this.context.pages().length;
  }

  switchTo(index: number): Page {
    const pages = this.context.pages();
    if (index < 0 || index >= pages.length) {
      throw new Error(
        `Page index ${index} out of range (${pages.length} pages)`,
      );
    }
    this.activePage = pages[index];
    logger.info(
      "PageManager",
      `Switched to page ${index}: ${this.activePage.url()}`,
    );
    return this.activePage;
  }

  async switchToTitle(title: string): Promise<Page> {
    for (const page of this.context.pages()) {
      if ((await page.title()).includes(title)) {
        this.activePage = page;
        logger.info("PageManager", `Switched to page with title: ${title}`);
        return page;
      }
    }
    throw new Error(`No page found with title containing: "${title}"`);
  }

  async switchToURL(urlPattern: string | RegExp): Promise<Page> {
    for (const page of this.context.pages()) {
      const url = page.url();
      const matches =
        typeof urlPattern === "string"
          ? url.includes(urlPattern)
          : urlPattern.test(url);
      if (matches) {
        this.activePage = page;
        logger.info("PageManager", `Switched to page with URL: ${url}`);
        return page;
      }
    }
    throw new Error(`No page found matching URL: ${urlPattern}`);
  }

  async openNewTab(url?: string): Promise<Page> {
    const page = await this.context.newPage();
    if (url) await page.goto(url);
    this.activePage = page;
    logger.info("PageManager", `Opened new tab${url ? `: ${url}` : ""}`);
    return page;
  }

  async closeTab(index?: number): Promise<void> {
    const pages = this.context.pages();
    const target = index !== undefined ? pages[index] : this.activePage;
    if (!target) return;

    await target.close();
    const remaining = this.context.pages();
    this.activePage =
      remaining.length > 0 ? remaining[remaining.length - 1] : null;
    logger.info("PageManager", `Closed tab, ${remaining.length} remaining`);
  }

  async waitForNewPage(action?: () => Promise<void>): Promise<Page> {
    const pagePromise = this.context.waitForEvent("page");
    if (action) await action();
    const newPage = await pagePromise;
    await newPage.waitForLoadState();
    this.activePage = newPage;
    logger.info("PageManager", `New page opened: ${newPage.url()}`);
    return newPage;
  }

  async closeAll(): Promise<void> {
    for (const page of this.context.pages()) {
      await page.close();
    }
    this.activePage = null;
  }

  // ─── Internals ────────────────────────────────────────────

  private attachDialogs(page: Page): void {
    this.dialogs.attach(page);
  }
}
