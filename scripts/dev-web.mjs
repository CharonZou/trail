#!/usr/bin/env node

// Browser Dev Mode (dev:web): run the same desktop dev stack as `pnpm dev`,
// but with TRAIL_WEB=1 so the main process starts its loopback Web bridge
// and keeps the Electron window hidden. The app is then driven from a browser
// at http://localhost:5173 instead of the desktop window, which is the
// intended development surface for renderer work.
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const devElectron = join(ROOT, "scripts", "dev-electron.mjs");

console.log("[dev:web] Browser Dev Mode: starting backend + Vite dev server…");
console.log("[dev:web] open http://localhost:5173 in your browser (Electron window stays hidden)");

const child = spawn(process.execPath, [devElectron], {
  env: { ...process.env, TRAIL_WEB: "1" },
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => child.kill(signal));
}
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
