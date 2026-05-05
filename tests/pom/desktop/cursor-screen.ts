import { DesktopPage } from '../../../src/drivers/desktop/pom/desktop-page';
import { DesktopDriver } from '../../../src/drivers/desktop/desktop-driver';

/** Auto-generated (desktop — selectors = AX / System Events titles) */
export class CursorScreen extends DesktopPage {
  readonly desktopBridgeTsDesktopAgent = this.element("desktop-bridge.ts — desktop-agent");
  readonly desktopBridgeTsDesktopAgent2 = this.element("desktop-bridge.ts — desktop-agent");
  readonly leftTitleActions = this.element("Left title actions");
  readonly togglePrimarySideBarB = this.element("Toggle Primary Side Bar (⌘B)");
  readonly glyphElement1 = this.element("");
  readonly glyphElement2 = this.element("");
  readonly navigationActions = this.element("Navigation actions");
  readonly goBack = this.element("Go Back (⌃-)");
  readonly glyphElement3 = this.element("");
  readonly goForward = this.element("Go Forward (⌃⇧-)");
  readonly glyphElement4 = this.element("");
  readonly desktopBridgeTsDesktopAgent3 = this.element("desktop-bridge.ts — desktop-agent");
  readonly titleActions = this.element("Title actions");
  readonly agentsWindow = this.element("Agents Window ");
  readonly agentsWindow2 = this.element("Agents Window");
  readonly glyphElement5 = this.element("");
  readonly togglePanelJ = this.element("Toggle Panel (⌘J)");
  readonly glyphElement6 = this.element("");
  readonly glyphElement7 = this.element("");
  readonly toggleAgentsJ = this.element("Toggle Agents (⌥⌘J)");
  readonly openCursorSettings = this.element("Open Cursor Settings");
  readonly glyphElement8 = this.element("");
  readonly glyphElement9 = this.element("");
  readonly glyphElement10 = this.element("");
  readonly glyphElement11 = this.element("");
  readonly glyphElement12 = this.element("");
  readonly glyphElement13 = this.element("");
  readonly explorerSectionDesktopAgent = this.element("Explorer Section: desktop-agent");
  readonly glyphElement14 = this.element("");
  readonly explorerSectionDesktopAgent2 = this.element("Explorer Section: desktop-agent");
  readonly desktopAgent = this.element("DESKTOP-AGENT");
  readonly filesExplorer = this.element("Files Explorer");
  readonly cursor = this.element(".cursor");
  readonly glyphElement15 = this.element("");
  readonly documentsDesktopAgentCursor = this.element("~/Documents/desktop-agent/.cursor");

  constructor(driver: DesktopDriver) {
    super(driver);
  }
}
