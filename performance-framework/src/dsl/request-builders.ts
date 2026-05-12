import { randomUUID } from 'node:crypto';
import type { HttpMethod, ThinkTime } from '../domain/load-profile.js';
import type { RequestDefinition } from '../ast/scenario-model.js';

export class RequestBuilder {
  private readonly def: RequestDefinition;

  private constructor(method: HttpMethod, url: string, name?: string) {
    this.def = {
      id: randomUUID(),
      name: name ?? `${method} ${url}`,
      method,
      url,
      headers: {},
      cookies: {},
      assertions: [],
    };
  }

  static method(method: HttpMethod, url: string, name?: string): RequestBuilder {
    return new RequestBuilder(method, url, name);
  }

  header(key: string, value: string): this {
    this.def.headers[key] = value;
    return this;
  }

  cookie(name: string, value: string): this {
    this.def.cookies[name] = value;
    return this;
  }

  bearerToken(token: string): this {
    this.def.headers.Authorization = `Bearer ${token}`;
    return this;
  }

  body(payload: unknown): this {
    this.def.body = { json: payload };
    return this;
  }

  rawBody(content: string): this {
    this.def.body = { raw: content };
    return this;
  }

  graphql(query: string, variables?: Record<string, unknown>): this {
    this.def.body = { graphql: { query, variables } };
    return this;
  }

  think(time: ThinkTime): this {
    this.def.thinkTime = time;
    return this;
  }

  assertStatus(code: number): this {
    this.def.assertions.push({ kind: 'status', value: code });
    return this;
  }

  assertP95Below(maxMs: number): this {
    this.def.assertions.push({ kind: 'duration_p95', maxMs });
    return this;
  }

  assertP99Below(maxMs: number): this {
    this.def.assertions.push({ kind: 'duration_p99', maxMs });
    return this;
  }

  captureJson(name: string, jsonPath: string): this {
    this.def.capture = [...(this.def.capture ?? []), { name, jsonPath }];
    return this;
  }

  build(): RequestDefinition {
    return { ...this.def, assertions: [...this.def.assertions] };
  }
}

export const get = (url: string, name?: string): RequestBuilder =>
  RequestBuilder.method('GET', url, name);
export const post = (url: string, name?: string): RequestBuilder =>
  RequestBuilder.method('POST', url, name);
export const put = (url: string, name?: string): RequestBuilder =>
  RequestBuilder.method('PUT', url, name);
export const patch = (url: string, name?: string): RequestBuilder =>
  RequestBuilder.method('PATCH', url, name);
export const del = (url: string, name?: string): RequestBuilder =>
  RequestBuilder.method('DELETE', url, name);
