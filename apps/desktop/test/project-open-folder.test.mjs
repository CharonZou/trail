import { readMainSource } from "./helpers/source-contracts.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) =>
  readFile(new URL(relativePath, import.meta.url), "utf8");

const [protocolSource, apiSource, mainSource] = await Promise.all([
  read("../../../packages/shared/src/protocol.ts"),
  read("../src/lib/api.ts"),
  readMainSource(),
]);

test("open-folder is exposed as a project-only IPC action", () => {
  assert.match(
    protocolSource,
    /projectOpenFolder:\s*"pi-desktop\/project\/openFolder"/,
  );
  assert.doesNotMatch(protocolSource, /sessionOpenFolder/);
  assert.match(
    apiSource,
    /openProjectFolder:\s*\(path: string\)[\s\S]*?IPC\.invoke\.projectOpenFolder, path/,
  );
  assert.doesNotMatch(apiSource, /openSessionFolder/);
});

test("main opens only a registered project directory", () => {
  const gateStart = mainSource.indexOf("async function knownProjectPath(");
  const gate = mainSource.slice(
    gateStart,
    mainSource.indexOf("handle(IPC.invoke.projectOpenFolder", gateStart),
  );
  const start = mainSource.indexOf("handle(IPC.invoke.projectOpenFolder");
  const end = mainSource.indexOf("handle(IPC.invoke.projectOpen,", start);
  const handler = mainSource.slice(start, end);

  assert.ok(gateStart >= 0, "the shared project path gate should exist");
  assert.ok(start >= 0 && end > start, "project open-folder handler should exist");
  // One gate for both open channels: it resolves the request against the
  // host's own project records before anything reaches the OS.
  assert.match(gate, /host\.call\("projects\.list"\)/);
  assert.match(gate, /resolve\(candidate\) === projectPath/);
  assert.match(gate, /ErrorCodes\.INVALID_ARGUMENT/);
  assert.match(gate, /ErrorCodes\.NOT_FOUND/);
  assert.match(gate, /statSync\(projectPath\)\.isDirectory\(\)/);
  assert.match(handler, /await knownProjectPath\(path\)/);
  assert.match(handler, /shell\.openPath\(stripWinLongPrefix\(projectPath\)\)/);
  assert.match(handler, /return \{ ok: true, path: projectPath \}/);
});
