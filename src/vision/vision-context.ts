import { IDriver } from '../core/base-driver';
import { WindowBounds } from '../core/types';
import { logger } from '../utils/logger';
import { readPngSize } from '../utils/image';

/**
 * VisionContext — a PID-anchored snapshot bundle that vision flows operate on.
 *
 * Captures, at a single moment in time:
 *   - The screenshot bytes (window-scoped on desktop, full-screen on browser)
 *   - The image's pixel dimensions (read from the PNG header — no decode)
 *   - The on-screen logical bounds of the source window, if any
 *
 * All vision-returned coordinates are in IMAGE PIXEL space. The context
 * carries everything needed to translate them back to logical SCREEN
 * coordinates that desktop click APIs accept, and to bounds-clip them so
 * a hallucinated coordinate cannot land in the wrong app.
 */
export interface VisionContext {
  screenshot: Buffer;
  imageWidth: number;
  imageHeight: number;
  bounds: WindowBounds | null;
  /** Stable PID at acquire time, if available. Used purely for logging. */
  pid: number | null;
}

interface DesktopLike {
  focusForVision?: (settleMs?: number) => Promise<void>;
  screenshotWindow?: () => Promise<Buffer>;
  getWindowBounds?: () => Promise<WindowBounds | null>;
}

/**
 * Acquire a vision context for the given driver. On desktop drivers this:
 *   1. Brings the PID's window to the foreground (focusForVision)
 *   2. Reads the window bounds at the moment of capture
 *   3. Captures only that window (screenshotWindow)
 *
 * On non-desktop drivers (browser, mobile) it falls back to a full-screen
 * capture with no bounds — coordinate translation becomes a no-op.
 */
export async function acquireVisionContext(driver: IDriver): Promise<VisionContext> {
  const d = driver as IDriver & DesktopLike;

  if (typeof d.focusForVision === 'function') {
    try { await d.focusForVision(); } catch (e) {
      logger.warn('VisionContext', `focusForVision failed: ${e}`);
    }
  }

  let screenshot: Buffer;
  let bounds: WindowBounds | null = null;
  let pid: number | null = null;

  if (typeof d.screenshotWindow === 'function' && typeof d.getWindowBounds === 'function') {
    bounds = await d.getWindowBounds().catch(() => null);
    screenshot = await d.screenshotWindow();
    pid = (driver as unknown as { adapter?: { pid?: number | null } }).adapter?.pid ?? null;
  } else {
    screenshot = await driver.screenshot();
  }

  const dim = readPngSize(screenshot) ?? { width: 0, height: 0 };

  return {
    screenshot,
    imageWidth: dim.width,
    imageHeight: dim.height,
    bounds,
    pid,
  };
}

/**
 * Translate vision-returned image-pixel coordinates into screen-space
 * logical coordinates using the captured window bounds.
 *
 * Returns `null` if the resulting point falls outside the window — this is
 * the bounds-clip safety net that catches model hallucinations before they
 * become misclicks in another app.
 */
export function imageToScreen(
  imgX: number,
  imgY: number,
  ctx: VisionContext,
): { x: number; y: number } | null {
  if (!ctx.bounds || ctx.imageWidth === 0 || ctx.imageHeight === 0) {
    return { x: Math.round(imgX), y: Math.round(imgY) };
  }

  const { bounds, imageWidth, imageHeight } = ctx;
  const sx = imageWidth / bounds.width;
  const sy = imageHeight / bounds.height;
  if (sx <= 0 || sy <= 0) return null;

  const screenX = bounds.x + imgX / sx;
  const screenY = bounds.y + imgY / sy;

  const margin = 2;
  if (
    screenX < bounds.x - margin || screenX > bounds.x + bounds.width + margin ||
    screenY < bounds.y - margin || screenY > bounds.y + bounds.height + margin
  ) {
    logger.warn(
      'VisionContext',
      `coord (${Math.round(screenX)},${Math.round(screenY)}) outside window ` +
      `[${bounds.x},${bounds.y} ${bounds.width}x${bounds.height}] — rejecting`,
    );
    return null;
  }

  return { x: Math.round(screenX), y: Math.round(screenY) };
}
