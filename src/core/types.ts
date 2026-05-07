export type Platform =
  | "chromium"
  | "firefox"
  | "webkit"
  | "macos"
  | "windows"
  | "ios"
  | "android"
  | "api";

export type ActionType =
  | "click"
  | "fill"
  | "getText"
  | "waitFor"
  | "hover"
  | "scroll"
  | "keyPress"
  | "screenshot"
  | "navigate"
  | "select"
  | "check"
  | "uncheck";

export interface ActionResult {
  success: boolean;
  action: string;
  target: string;
  value?: string;
  duration: number;
  error?: string;
}

export interface UIElement {
  id: string;
  role: string;
  name?: string;
  label?: string;
  value?: string;
  bounds: BoundingBox;
  isEnabled: boolean;
  isVisible: boolean;
  attributes: Record<string, string | undefined>;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WaitOptions {
  timeout?: number;
  state?: "visible" | "hidden" | "attached" | "detached";
}

export interface LaunchOptions {
  url?: string;
  name?: string;
  pid?: number;
  windowTitle?: string;
  bundleId?: string;
  appPackage?: string;
  appActivity?: string;
  authProfile?: string;
  storageStatePath?: string;
  windowState?: WindowState;
}

export type WindowState = "normal" | "maximized" | "fullscreen";

export interface APIResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: any;
  duration: number;
}

export interface RequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, string>;
  timeout?: number;
}

export interface FocusOptions {
  restore?: boolean;
  verify?: boolean;
  timeoutMs?: number;
  retries?: number;
}

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}
