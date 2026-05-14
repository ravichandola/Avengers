/**
 * Windows-only: FlaUI-backed `uia.*` RPC (OfficeInterop.exe) and DesktopDriver integration.
 *
 * Requires a built sidecar (`npm run sidecar:build` on Windows). Run with:
 *   npx playwright test tests/desktop/windows-flaui-interop.desktop.spec.ts --project=desktop-windows
 */
import { spawn } from "child_process";
import { exec } from "child_process";
import { promisify } from "util";
import { test as baseTest, expect } from "../../src/fixtures";
import { createDesktopApp } from "../../src/drivers/desktop/desktop-driver";
import type { DesktopDriver } from "../../src/drivers/desktop/desktop-driver";
import {
  getSidecar,
  isSidecarExecutablePresent,
} from "../../src/drivers/desktop/dotnet-bridge";
import { WindowsAdapter } from "../../src/drivers/desktop/windows-adapter";
import type { UIElement } from "../../src/core/types";
import { sleep } from "../../src/utils/retry";

const execAsync = promisify(exec);

const test = baseTest.extend<{ desktop: DesktopDriver }>({
  desktop: async ({}, use, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-windows",
      "Run with --project=desktop-windows",
    );
    test.skip(process.platform !== "win32", "Windows only");
    test.skip(
      !isSidecarExecutablePresent(),
      "OfficeInterop.exe missing; run npm run sidecar:build on Windows",
    );

    await execAsync("taskkill /IM notepad.exe /F").catch(() => {});
    spawn(process.env.SystemRoot + "\\notepad.exe", [], {
      detached: true,
      stdio: "ignore",
    }).unref();
    await sleep(2500);

    const driver = await createDesktopApp({
      name: "notepad",
      windowState: "normal",
      config: {
        platform: "windows",
        vision: { enabled: false },
      },
    });

    await use(driver);
    await driver.close().catch(() => {});
    await execAsync("taskkill /IM notepad.exe /F").catch(() => {});
  },
});

function skipUnlessWindowsDesktop(testInfo: { project: { name: string } }) {
  test.skip(
    testInfo.project.name !== "desktop-windows",
    "Run with --project=desktop-windows",
  );
  test.skip(process.platform !== "win32", "Windows only");
  test.skip(
    !isSidecarExecutablePresent(),
    "OfficeInterop.exe missing; run npm run sidecar:build on Windows",
  );
}

/** Resolve a locator string for Notepad's main text surface (varies by Windows / Notepad version). */
function pickNotepadTextSelector(elements: UIElement[]): string | null {
  const score = (e: UIElement): number => {
    let s = 0;
    const role = (e.role || "").toLowerCase();
    const name = (e.name || "").toLowerCase();
    const id = (e.id || "").toLowerCase();
    if (role === "document" || role === "edit") s += 5;
    if (name.includes("text") || name.includes("editor")) s += 4;
    if (id === "15" || id === "42") s += 3;
    const h = e.bounds?.height ?? 0;
    if (h > 120) s += 2;
    return s;
  };

  let best: UIElement | null = null;
  let bestScore = 0;
  for (const el of elements) {
    const sc = score(el);
    if (sc > bestScore) {
      bestScore = sc;
      best = el;
    }
  }
  if (!best || bestScore < 3) return null;
  return (best.name && best.name.trim()) || best.id || null;
}

test.describe.configure({ mode: "serial" });

test.describe("Windows FlaUI sidecar (interop)", () => {
  test("WIN-001: stdio JSON: ping returns pong @platform=windows", async ({}, testInfo) => {
    skipUnlessWindowsDesktop(testInfo);
    const data = await getSidecar().call("ping", {});
    expect(data).toEqual({ pong: true });
  });

  test("WIN-002: stdio JSON: unknown method fails @platform=windows", async ({}, testInfo) => {
    skipUnlessWindowsDesktop(testInfo);
    await expect(getSidecar().call("uia.no_such_method", {})).rejects.toThrow();
  });

  test("WIN-003: uia.get_elements returns rows for live Notepad PID @platform=windows", async ({
    desktop,
  }, testInfo) => {
    skipUnlessWindowsDesktop(testInfo);

    expect((await desktop.getTitle()).toLowerCase()).toContain("notepad");

    const found = await WindowsAdapter.findWindow("Notepad");
    if (!found) {
      test.skip(true, "Could not resolve Notepad window / PID");
      return;
    }
    const rows = await getSidecar().call("uia.get_elements", {
      pid: found.pid,
      max: 80,
    });
    expect(Array.isArray(rows)).toBeTruthy();
    expect((rows as unknown[]).length).toBeGreaterThan(0);
    const first = (rows as Record<string, unknown>[])[0];
    expect(first).toBeTruthy();
    expect(first.Name !== undefined || first.name !== undefined).toBeTruthy();
  });

  test("WIN-004: uia.is_visible responds for bogus vs real selector @platform=windows", async ({
    desktop,
  }, testInfo) => {
    skipUnlessWindowsDesktop(testInfo);

    const found = await WindowsAdapter.findWindow("Notepad");
    if (!found) {
      test.skip(true, "Could not resolve Notepad window / PID");
      return;
    }

    const miss = await getSidecar().call("uia.is_visible", {
      pid: found.pid,
      selector: "__desktop_agent_no_such_element__",
    });
    expect(miss).toMatchObject({ visible: false });

    const elements = await desktop.getElements();
    const needle = pickNotepadTextSelector(elements);
    if (!needle) {
      test.skip(true, "Could not infer Notepad text selector from UIA tree");
      return;
    }

    const hit = await getSidecar().call("uia.is_visible", {
      pid: found.pid,
      selector: needle,
    });
    expect(hit).toMatchObject({ visible: true });
  });
});

test.describe("Windows FlaUI + DesktopDriver integration", () => {
  test("WIN-005: getElements → fill → getText round-trip via adapter @platform=windows", async ({
    desktop,
  }, testInfo) => {
    skipUnlessWindowsDesktop(testInfo);

    const title = await desktop.getTitle();
    expect(title.toLowerCase()).toContain("notepad");

    const elements = await desktop.getElements();
    expect(elements.length).toBeGreaterThan(0);

    const selector = pickNotepadTextSelector(elements);
    if (!selector) {
      test.skip(true, "Could not infer Notepad text selector from UIA tree");
      return;
    }

    const token = `da-flaui-${Date.now()}`;
    await desktop.fill(selector, token);
    const readBack = await desktop.getText(selector);
    expect(readBack).toContain(token);
  });

  test("WIN-006: Adapter RPC and adapter tree agree on element count (rough) @platform=windows", async ({
    desktop,
  }, testInfo) => {
    skipUnlessWindowsDesktop(testInfo);

    const found = await WindowsAdapter.findWindow("Notepad");
    if (!found) {
      test.skip(true, "Could not resolve Notepad window / PID");
      return;
    }

    const viaRpc = await getSidecar().call("uia.get_elements", {
      pid: found.pid,
      max: 120,
    });
    const viaAdapter = await desktop.getElements();

    expect(Array.isArray(viaRpc)).toBeTruthy();
    expect(viaAdapter.length).toBeGreaterThan(0);
    const rpcLen = (viaRpc as unknown[]).length;
    const diff = Math.abs(rpcLen - viaAdapter.length);
    expect(diff).toBeLessThanOrEqual(25);
  });
});

test.afterAll(async () => {
  if (process.platform !== "win32" || !isSidecarExecutablePresent()) return;
  try {
    await getSidecar().dispose();
  } catch {
    /* ignore */
  }
});
