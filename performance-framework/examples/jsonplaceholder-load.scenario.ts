import { scenario, get, post } from '../src/index.js';

/**
 * Real public API (JSONPlaceholder) — read + write paths, transaction, modest SLA.
 * https://jsonplaceholder.typicode.com/guide/
 */
export const jsonPlaceholderLoadModel = scenario('JSONPlaceholder — posts API load')
  .tag('example', 'public-api', 'rest')
  .load({
    kind: 'ramp_up',
    users: 8,
    rampUp: '8s',
    duration: '35s',
  })
  .slaRule({
    name: 'jsonplaceholder-sla',
    p95Ms: 3000,
    maxErrorRatePercent: 5,
  })
  .transaction('Read and create post', (tx) => {
    tx.request(
      get('https://jsonplaceholder.typicode.com/posts/1', 'get-post-by-id').assertStatus(200).assertP95Below(3000),
    );
    tx.request(
      post('https://jsonplaceholder.typicode.com/posts', 'create-post')
        .header('Content-Type', 'application/json; charset=UTF-8')
        .body({ title: 'perf-fw example', body: 'load test', userId: 1 })
        .assertStatus(201)
        .assertP95Below(3000),
    );
  })
  .build();
