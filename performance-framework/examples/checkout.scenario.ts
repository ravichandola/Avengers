import { scenario, post } from '../src/index.js';

const checkout = scenario('Checkout API')
  .tag('api', 'checkout')
  .load({ kind: 'stress', users: 50, rampUp: '30s', duration: '5m' })
  .slaRule({ name: 'checkout-latency', p95Ms: 500, maxErrorRatePercent: 1 })
  .request(
    post('https://httpbin.org/post', 'authorize')
      .body({ cartId: '${CART_ID}' })
      .assertStatus(200)
      .assertP95Below(500),
  )
  .build();

console.log(JSON.stringify(checkout, null, 2));
