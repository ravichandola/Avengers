import { Locator, Page } from "playwright";
import { resolveSelector } from "../resolve-selector";
import { Block, BlockRoot, Sidebar } from "./block";

export class PageObject {
  constructor(readonly page: Page) {}

  /** Playwright `Locator` — store as class property for locator-independent POM. */
  locator(selector: string): Locator {
    return this.page.locator(resolveSelector(selector));
  }

  async navigate(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: "domcontentloaded" });
  }

  async getTitle(): Promise<string> {
    return this.page.title();
  }

  async getURL(): Promise<string> {
    return this.page.url();
  }

  async screenshot(): Promise<Buffer> {
    return this.page.screenshot();
  }

  /** Generic scoped {@link Block}. */
  block(root: BlockRoot): Block;
  /** Typed scoped block — pass your custom Block subclass. */
  block<T extends Block>(
    Class: new (page: Page, root: BlockRoot) => T,
    root: BlockRoot,
  ): T;
  block<T extends Block>(
    classOrRoot: BlockRoot | (new (page: Page, root: BlockRoot) => T),
    root?: BlockRoot,
  ): Block | T {
    if (typeof classOrRoot === "function") {
      return new classOrRoot(this.page, root!);
    }
    return new Block(this.page, classOrRoot);
  }

  /** Default sidebar block. Pass custom subclass or root for non-standard sidebars. */
  sidebar(root?: BlockRoot): Sidebar;
  sidebar<T extends Sidebar>(
    Class: new (page: Page, root?: BlockRoot) => T,
    root?: BlockRoot,
  ): T;
  sidebar<T extends Sidebar>(
    classOrRoot?: BlockRoot | (new (page: Page, root?: BlockRoot) => T),
    root?: BlockRoot,
  ): Sidebar | T {
    if (typeof classOrRoot === "function") {
      return new classOrRoot(this.page, root);
    }
    return new Sidebar(this.page, classOrRoot);
  }
}
