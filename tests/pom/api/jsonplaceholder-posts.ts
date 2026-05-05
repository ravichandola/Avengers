import { APIResponse } from '../../../src/core/types';
import { APIDriver } from '../../../src/drivers/api/api-driver';
import { EndpointGroup } from '../../../src/drivers/api/pom/endpoint-group';

/** jsonplaceholder.typicode.com — rest-crud.api.spec.ts */
export class JsonPlaceholderPosts extends EndpointGroup {
  constructor(api: APIDriver) {
    super(api);
  }

  list(): Promise<APIResponse> {
    return this.get('/posts');
  }

  getById(id: number): Promise<APIResponse> {
    return this.get(`/posts/${id}`);
  }

  create(body: Record<string, unknown>): Promise<APIResponse> {
    return this.post('/posts', body);
  }

  update(id: number, body: Record<string, unknown>): Promise<APIResponse> {
    return this.put(`/posts/${id}`, body);
  }

  remove(id: number): Promise<APIResponse> {
    return this.del(`/posts/${id}`);
  }
}
