import { useEffect, useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

type Sample = { label: string; elapsedMs: number; success: boolean; t: number };

const WS_URL = import.meta.env.VITE_PERF_WS_URL ?? 'ws://127.0.0.1:8090';

export function App() {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [status, setStatus] = useState<string>('connecting');

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    ws.onopen = () => setStatus('live');
    ws.onclose = () => setStatus('disconnected');
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data));
        if (msg.type === 'metric:sample') {
          const p = msg.payload;
          setSamples((prev) =>
            [...prev, { label: p.label, elapsedMs: p.elapsedMs, success: p.success, t: Date.now() }].slice(-300),
          );
        }
      } catch {
        /* ignore */
      }
    };
    return () => ws.close();
  }, []);

  const chartData = useMemo(() => {
    const labels = samples.map((_, i) => String(i));
    return {
      labels,
      datasets: [
        {
          label: 'Latency (ms)',
          data: samples.map((s) => s.elapsedMs),
          borderColor: 'rgb(59, 130, 246)',
          tension: 0.2,
        },
      ],
    };
  }, [samples]);

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '1.5rem' }}>
      <h1>Realtime performance</h1>
      <p>
        WebSocket: <code>{WS_URL}</code> — <strong>{status}</strong>
      </p>
      <p>Samples buffered: {samples.length}</p>
      <div style={{ maxWidth: 960 }}>
        <Line data={chartData} options={{ responsive: true, animation: false }} />
      </div>
    </div>
  );
}
