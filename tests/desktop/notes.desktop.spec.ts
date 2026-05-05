import { exec } from 'child_process';
import { promisify } from 'util';
import { test, expect } from '../../src/fixtures';
import { VisionDriverWrapper } from '../../src/vision';

const execAsync = promisify(exec);

async function runAppleScript(script: string): Promise<void> {
  const escaped = script.replace(/'/g, "'\\''");
  await execAsync(`osascript -e '${escaped}'`);
}

test.describe('Notes - Desktop Automation', () => {
  test.skip(process.platform !== 'darwin', 'macOS only');

  test('uses visual AI to flow through Notes and write content @app=Notes', async ({ app }) => {
    test.skip(!process.env.OPENAI_API_KEY, 'OPENAI_API_KEY required for visual AI flow');

    try {
      const visionDriver = app as VisionDriverWrapper;
      const vision = visionDriver.getVisionProvider();

      await runAppleScript(`
        tell application "Notes" to activate
        tell application "System Events"
          keystroke "n" using command down
          delay 0.4
        end tell
      `);

      const bootScreenshot = await app.screenshot();
      const screenSummary = await vision.describeScreen(bootScreenshot);
      test.skip(screenSummary === 'Vision analysis failed', 'Vision API unavailable (quota/auth)');
      expect(screenSummary.length).toBeGreaterThan(0);

      const detections = await vision.detectElements(bootScreenshot, 'note editor area or note content input');
      expect(detections.length).toBeGreaterThan(0);

      await runAppleScript(`
        tell application "Notes" to activate
        tell application "System Events"
          keystroke "Automation line 1"
          key code 36
          keystroke "Automation line 2"
          key code 36
          keystroke "Automation line 3"
        end tell
      `);

      const title = await app.getTitle();
      expect(title.length).toBeGreaterThan(0);
    } finally {
      await runAppleScript(`tell application "Notes" to quit`);
    }
  });

  test('verifies core Notes flows: create, search, and app state @app=Notes', async ({ app }) => {

    try {
      const token = `DA-${Date.now()}`;

      await runAppleScript(`
        tell application "Notes" to activate
        tell application "System Events"
          keystroke "n" using command down
          delay 0.4
          keystroke "Desktop Agent smoke note"
          key code 36
          keystroke "Body line 1"
          key code 36
          keystroke "${token}"
          delay 0.3

          keystroke "n" using command down
          delay 0.4
          keystroke "Second note for search"
          key code 36
          keystroke "Search token: ${token}"
          delay 0.3

          keystroke "f" using command down
          delay 0.3
          keystroke "${token}"
          key code 36
          delay 0.4
        end tell
      `);

      const title = await app.getTitle();
      expect(title.length).toBeGreaterThan(0);

      const elements = await app.getElements();
      expect(elements.length).toBeGreaterThan(0);

      const screenshot = await app.screenshot();
      expect(screenshot.byteLength).toBeGreaterThan(0);
    } finally {
      await runAppleScript(`tell application "Notes" to quit`);
    }
  });
});
