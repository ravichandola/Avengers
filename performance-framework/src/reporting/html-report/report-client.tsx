import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import type { Chart, ChartConfiguration } from "chart.js";

const THEME_KEY = "perf-fw-report-theme";

type ChartCtor = new (
  ctx: HTMLCanvasElement,
  config: ChartConfiguration,
) => Chart;

function getChartClass(): ChartCtor | undefined {
  return (globalThis as unknown as { Chart?: ChartCtor }).Chart;
}

type ChartPayload = {
  labels: string[];
  p50: number[];
  p95: number[];
  p99: number[];
  passed: number[];
  failed: number[];
  totalPass: number;
  totalFail: number;
};

function readChartPayload(): ChartPayload | null {
  const el = document.getElementById("perf-chart-data");
  if (!el?.textContent) return null;
  try {
    return JSON.parse(el.textContent) as ChartPayload;
  } catch {
    return null;
  }
}

function chartCssVars(docRoot: HTMLElement) {
  const st = getComputedStyle(docRoot);
  return {
    p50: st.getPropertyValue("--chart-p50").trim(),
    p95: st.getPropertyValue("--chart-p95").trim(),
    p99: st.getPropertyValue("--chart-p99").trim(),
    pass: st.getPropertyValue("--chart-pass").trim(),
    fail: st.getPropertyValue("--chart-fail").trim(),
    grid: st.getPropertyValue("--chart-grid").trim(),
    text: st.getPropertyValue("--chart-text").trim(),
  };
}

function destroyCharts(instances: Chart[]): void {
  for (const c of instances) {
    try {
      c.destroy();
    } catch {
      void 0;
    }
  }
  instances.length = 0;
}

function buildCharts(docRoot: HTMLElement, instances: Chart[]): void {
  const ChartClass = getChartClass();
  if (!ChartClass) return;
  const D = readChartPayload();
  if (!D?.labels?.length) return;
  destroyCharts(instances);
  const C = chartCssVars(docRoot);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const anim: false | { duration: number } = reduced
    ? false
    : { duration: 400 };

  const elTotals = document.getElementById("chartTotals");
  if (
    elTotals instanceof HTMLCanvasElement &&
    (D.totalPass > 0 || D.totalFail > 0)
  ) {
    instances.push(
      new ChartClass(elTotals, {
        type: "doughnut",
        data: {
          labels: ["Passed samples", "Failed samples"],
          datasets: [
            {
              data: [D.totalPass, D.totalFail],
              backgroundColor: [C.pass, C.fail],
              borderWidth: 0,
            },
          ],
        },
        options: {
          animation: anim,
          plugins: {
            legend: {
              position: "bottom",
              labels: { color: C.text, boxWidth: 12 },
            },
          },
        },
      }),
    );
  }

  const elLat = document.getElementById("chartLatency");
  if (elLat instanceof HTMLCanvasElement) {
    instances.push(
      new ChartClass(elLat, {
        type: "bar",
        data: {
          labels: D.labels,
          datasets: [
            { label: "p50", data: D.p50, backgroundColor: C.p50 },
            { label: "p95", data: D.p95, backgroundColor: C.p95 },
            { label: "p99", data: D.p99, backgroundColor: C.p99 },
          ],
        },
        options: {
          animation: anim,
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              ticks: { color: C.text, maxRotation: 45 },
              grid: { color: C.grid },
            },
            y: {
              beginAtZero: true,
              ticks: { color: C.text },
              grid: { color: C.grid },
              title: { display: true, text: "ms", color: C.text },
            },
          },
          plugins: { legend: { labels: { color: C.text } } },
        },
      }),
    );
  }

  const elStack = document.getElementById("chartStacked");
  if (elStack instanceof HTMLCanvasElement) {
    instances.push(
      new ChartClass(elStack, {
        type: "bar",
        data: {
          labels: D.labels,
          datasets: [
            {
              label: "Passed",
              data: D.passed,
              backgroundColor: C.pass,
              stack: "s",
            },
            {
              label: "Failed",
              data: D.failed,
              backgroundColor: C.fail,
              stack: "s",
            },
          ],
        },
        options: {
          animation: anim,
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              stacked: true,
              beginAtZero: true,
              ticks: { color: C.text },
              grid: { color: C.grid },
            },
            y: {
              stacked: true,
              ticks: { color: C.text },
              grid: { display: false },
            },
          },
          plugins: { legend: { labels: { color: C.text } } },
        },
      }),
    );
  }
}

function effectiveMode(mq: MediaQueryList, pref: string): "light" | "dark" {
  if (pref === "system") return mq.matches ? "dark" : "light";
  return pref as "light" | "dark";
}

function syncThemeButtons(): void {
  const saved = localStorage.getItem(THEME_KEY);
  const active = saved === "light" || saved === "dark" ? saved : "system";
  document
    .querySelectorAll<HTMLButtonElement>("[data-theme-btn]")
    .forEach((btn) => {
      const m = btn.getAttribute("data-theme-btn");
      btn.setAttribute("aria-pressed", m === active ? "true" : "false");
    });
}

/** Client-only: themes + Chart.js. SSR markup comes from `ReportPage.tsx`. */
export function ReportClientApp(): null {
  useEffect(() => {
    const docRoot = document.documentElement;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const chartInstances: Chart[] = [];

    const runBuildCharts = (): void => {
      requestAnimationFrame(() => {
        destroyCharts(chartInstances);
        buildCharts(docRoot, chartInstances);
      });
    };

    const applyResolved = (resolved: "light" | "dark"): void => {
      docRoot.setAttribute("data-theme", resolved);
      runBuildCharts();
    };

    const setPreference = (pref: string | null): void => {
      if (pref == null) return;
      if (pref === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, pref);
      syncThemeButtons();
      applyResolved(effectiveMode(mq, pref));
    };

    const saved = localStorage.getItem(THEME_KEY);
    const pref = saved === "light" || saved === "dark" ? saved : "system";
    syncThemeButtons();
    docRoot.setAttribute("data-theme", effectiveMode(mq, pref));

    const themeButtons =
      document.querySelectorAll<HTMLButtonElement>("[data-theme-btn]");
    const clickHandlers: Array<{ btn: HTMLButtonElement; fn: () => void }> = [];
    themeButtons.forEach((btn) => {
      const fn = (): void => {
        setPreference(btn.getAttribute("data-theme-btn"));
      };
      btn.addEventListener("click", fn);
      clickHandlers.push({ btn, fn });
    });

    const onMqChange = (): void => {
      if (!localStorage.getItem(THEME_KEY))
        applyResolved(effectiveMode(mq, "system"));
    };
    mq.addEventListener("change", onMqChange);

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () =>
        buildCharts(docRoot, chartInstances),
      );
    } else {
      requestAnimationFrame(() => buildCharts(docRoot, chartInstances));
    }

    return () => {
      mq.removeEventListener("change", onMqChange);
      clickHandlers.forEach(({ btn, fn }) =>
        btn.removeEventListener("click", fn),
      );
      destroyCharts(chartInstances);
    };
  }, []);

  return null;
}

const mountEl = document.getElementById("perf-report-root");
if (mountEl) {
  createRoot(mountEl).render(<ReportClientApp />);
}
