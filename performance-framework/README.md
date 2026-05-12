# Performance framework

TypeScript DSL and JMeter-backed runners for load and performance tests.

**Documentation:** [`./performance-docs/`](./performance-docs/) — **Postman + OAuth2 + load test walkthrough (English + Hinglish):** [**FROM-POSTMAN-TO-LOAD-TEST.md**](./performance-docs/FROM-POSTMAN-TO-LOAD-TEST.md). Otherwise start with [**beginner/**](./performance-docs/beginner/) if you are new to performance testing; then QUICKSTART, WORKFLOW, ARCHITECTURE.

### Running tests without `npm run build`

Scripts that use **`tsx`** execute TypeScript straight from `src/` — **no compile step** while you iterate:

| Command | Purpose |
|--------|---------|
| `npm run example:jsonplaceholder` | Full example (GET/POST load) |
| `npm run dev:smoke` | CLI smoke (`run:smoke`) via source |
| `npm run cli -- …` | Any CLI subcommand via source (e.g. `npm run cli -- run:smoke --env local`) |

Use **`npm run build`** when you need **`dist/`** (published package, `node dist/cli/perf.js`, or CI that runs compiled JS only).

### JMeter — one-time setup (then forget it)

The runner **auto-resolves** JMeter in this order: `--jmeter-home` / `--jmeter-bin` → **`JMETER_HOME`** or **`APACHE_JMETER_HOME`** → **`jmeter` on your `PATH`** (via `command -v` / `where`) → common locations (e.g. **Homebrew** `.../opt/jmeter/libexec`). You should only need **one** of these, **once**:

1. **macOS (Homebrew)** — install, then either restart the terminal or set:
   ```bash
   echo 'export JMETER_HOME="$(brew --prefix jmeter)/libexec"' >> ~/.zprofile
   source ~/.zprofile
   ```
2. **Manual tarball** — unpack and add to `~/.zprofile`:
   ```bash
   export JMETER_HOME=$HOME/tools/apache-jmeter-5.6.3   # your real path
   ```
3. **PATH only** — add JMeter’s `bin` directory to `PATH` so `jmeter -v` works everywhere.

After that, run **`npm run dev:smoke`** / **`npm run example:jsonplaceholder`** with no extra flags.

### Report UX (local server + browser)

- **Interactive terminal (pass or fail):** the report is served at **`http://127.0.0.1:50552/`** (default port; override with **`PERF_REPORT_PORT`**), the browser opens, and the process stays up until **Ctrl+C**.
- **CI / automation:** set **`CI=true`** or run smoke with **`--ci`**, or set **`PERF_NO_REPORT_SERVER=1`** — only **`file://`** paths are printed (no server, no hang).

**Run example and open the latest HTML report (macOS):**

```bash
npm run example:jsonplaceholder && open "$(ls -td perf-output/*/ | head -1)index.html"
```

**Git:** Do not commit run artifacts — see [`.gitignore`](./.gitignore) (`perf-output/`, local `node_modules/`, etc.).
