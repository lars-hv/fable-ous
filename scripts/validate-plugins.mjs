#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_ROOT = resolve(ROOT, "plugins/fable-ous");
const CODEX_ROOT = process.env.CODEX_HOME
  ? resolve(process.env.CODEX_HOME)
  : resolve(homedir(), ".codex");
const CODEX_VALIDATOR = resolve(
  CODEX_ROOT,
  "skills/.system/plugin-creator/scripts/validate_plugin.py"
);

function run(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}`);
  }
}

if (!existsSync(CODEX_VALIDATOR)) {
  throw new Error(`Codex plugin validator not found under ${CODEX_ROOT}.`);
}

run("python3", [CODEX_VALIDATOR, PLUGIN_ROOT]);
run("claude", ["plugin", "validate", PLUGIN_ROOT]);
