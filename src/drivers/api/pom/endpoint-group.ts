import { APIDriver } from '../api-driver';
import { APIResponse, RequestOptions } from '../../../core/types';

/**
 * API endpoint group — organize endpoints logically, define once, use everywhere.
 *
 * ```ts
 * class UserAPI extends EndpointGroup {
 *   getAll()           { return this.get('/users'); }
 *   getById(id: number){ return this.get(`/users/${id}`); }
 *   create(data: any)  { return this.post('/users', data); }
 *   update(id: number, data: any) { return this.put(`/users/${id}`, data); }
 *   remove(id: number) { return this.del(`/users/${id}`); }
 * }
 *
 * const users = new UserAPI(apiDriver);
 * const res = await users.getById(42);
 * ```
 */
export class EndpointGroup {
  constructor(protected readonly api: APIDriver) {}

  protected get(path: string, opts?: RequestOptions): Promise<APIResponse> {
    return this.api.get(path, opts);
  }

  protected post(path: string, body?: any, opts?: RequestOptions): Promise<APIResponse> {
    return this.api.post(path, body, opts);
  }

  protected put(path: string, body?: any, opts?: RequestOptions): Promise<APIResponse> {
    return this.api.put(path, body, opts);
  }

  protected patch(path: string, body?: any, opts?: RequestOptions): Promise<APIResponse> {
    return this.api.patch(path, body, opts);
  }

  protected del(path: string, opts?: RequestOptions): Promise<APIResponse> {
    return this.api.delete(path, opts);
  }

  protected graphql(query: string, variables?: Record<string, any>, opts?: RequestOptions): Promise<APIResponse> {
    return this.api.graphql(query, variables, opts);
  }
}
