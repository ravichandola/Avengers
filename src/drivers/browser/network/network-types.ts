export interface NetworkRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  postData: string | null;
  resourceType: string;
}

export interface NetworkResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  timing: NetworkTiming;
}

export interface NetworkTiming {
  startTime: number;
  endTime: number;
  duration: number;
}

export interface NetworkEntry {
  id: string;
  testId: string;
  timestamp: number;
  request: NetworkRequest;
  response: NetworkResponse | null;
  failure: string | null;
  isNavigationRequest: boolean;
}

export interface NetworkSummary {
  testId: string;
  testTitle: string;
  status: string;
  totalRequests: number;
  failedRequests: number;
  byMethod: Record<string, number>;
  byStatus: Record<string, number>;
  byResourceType: Record<string, number>;
  totalDuration: number;
  slowestCalls: NetworkEntry[];
  entries: NetworkEntry[];
}

export interface NetworkMonitorConfig {
  maxEntries: number;
  redactHeaders: string[];
  capturePostData: boolean;
  urlFilter?: RegExp;
}

export const DEFAULT_NETWORK_CONFIG: NetworkMonitorConfig = {
  maxEntries: 2000,
  redactHeaders: ['authorization', 'cookie', 'set-cookie', 'x-api-key', 'x-auth-token'],
  capturePostData: true,
};
