import { WebSocketServer } from 'ws';
import type { PerformanceEventBus } from '../events/event-bus.js';

/** Push live metrics to dashboard clients; decoupled from reporters (secondary fan-out). */
export function attachDashboardBridge(bus: PerformanceEventBus, port: number): WebSocketServer {
  const wss = new WebSocketServer({ port });

  const broadcast = (data: unknown) => {
    const msg = JSON.stringify(data);
    for (const client of wss.clients) {
      if (client.readyState === 1) client.send(msg);
    }
  };

  bus.on('metric:sample', (p) => broadcast({ type: 'metric:sample', payload: p }));
  bus.on('run:begin', (p) => broadcast({ type: 'run:begin', payload: p }));
  bus.on('run:end', (p) => broadcast({ type: 'run:end', payload: p }));

  return wss;
}
