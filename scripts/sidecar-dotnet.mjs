/* eslint-disable no-undef */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const csproj = join(root, "sidecar", "OfficeInterop", "OfficeInterop.csproj");

const cmd = process.argv[2] || "build";
const argsByCmd = {
  build: ["publish", csproj, "-c", "Release", "-p:SelfContained=false"],
  clean: ["clean", csproj],
  ping: ["run", "--project", csproj],
};

const dotnetArgs = argsByCmd[cmd];
if (!dotnetArgs) {
  console.error(
    `sidecar-dotnet: unknown command "${cmd}" (use build, clean, ping).`,
  );
  process.exit(1);
}

if (process.platform !== "win32") {
  console.warn(
    `sidecar:${cmd}: skipped on ${process.platform} (OfficeInterop is net8.0-windows / FlaUI / Office COM). ` +
      "On Windows, install the .NET 8 SDK and run again: https://dotnet.microsoft.com/download/dotnet/8.0",
  );
  process.exit(0);
}

const probe = spawnSync("dotnet", ["--version"], {
  encoding: "utf8",
  shell: true,
});
if (probe.status !== 0) {
  console.error(
    "dotnet was not found on PATH. Install the .NET 8 SDK: https://dotnet.microsoft.com/download/dotnet/8.0",
  );
  process.exit(1);
}

const run = spawnSync("dotnet", dotnetArgs, {
  stdio: "inherit",
  cwd: root,
  shell: true,
});
process.exit(run.status === null ? 1 : run.status);
