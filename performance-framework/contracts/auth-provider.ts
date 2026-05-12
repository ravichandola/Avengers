/**
 * Shared contract only: performance tests may obtain tokens the same way functional tests do,
 * without importing Playwright or any functional framework implementation.
 */
export interface AuthProvider {
  getToken(): Promise<string>;
}

export interface AuthContext {
  /** e.g. Bearer token header value */
  authorizationHeader?: string;
  cookies?: Record<string, string>;
}
