#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { windowsCommandPlan } from "../src/cli.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
const npmArgs = ["pack", "--dry-run", "--json", "--ignore-scripts"];
const npmExecPath = process.env.npm_execpath;
const npmPlan = process.platform === "win32" && npmExecPath
  // npm.cmd is a generated shim. Re-entering it through cmd.exe from an npm script can make the
  // shim resolve npm-cli.js relative to the project. Invoke npm's actual JS entrypoint instead.
  ? { command: process.execPath, args: [npmExecPath, ...npmArgs], spawnOptions: { shell: false } }
  : process.platform === "win32"
    ? windowsCommandPlan("npm.cmd", npmArgs)
  : { command: "npm", args: npmArgs, spawnOptions: { shell: false } };
const result = spawnSync(
  npmPlan.command,
  npmPlan.args,
  { cwd: ROOT, encoding: "utf8", ...npmPlan.spawnOptions }
);

if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(result.stderr.trim() || `npm pack failed with exit ${result.status}`);
}

let details;
try {
  details = JSON.parse(result.stdout);
} catch {
  throw new Error("npm pack did not return valid JSON.");
}

if (!Array.isArray(details) || details.length !== 1) {
  throw new Error("npm pack returned an unexpected package list.");
}

const packed = details[0];
const files = packed.files.map((file) => file.path);
const allowedExact = new Set(["LICENSE", "README.md", "package.json"]);
const allowedPrefixes = [
  ".agents/",
  ".claude-plugin/",
  "bin/",
  "docs/",
  "evals/public/",
  "plugins/",
  "scripts/",
  "src/"
];
const required = [
  ".agents/plugins/marketplace.json",
  ".claude-plugin/marketplace.json",
  "bin/fable-ous.mjs",
  "plugins/fable-ous/.claude-plugin/plugin.json",
  "plugins/fable-ous/.codex-plugin/plugin.json",
  "plugins/fable-ous/scripts/activation.mjs",
  "scripts/check-package.mjs",
  "scripts/validate-plugins.mjs",
  "src/cli.mjs"
];
const forbiddenPath = [
  /(^|\/)(test|tests)(\/|$)/i,
  /(^|\/)evals\/private(\/|$)/i,
  /(^|\/)(node_modules|coverage)(\/|$)/i,
  /(^|\/)\.DS_Store$/,
  /\.(log|pem|key|tgz)$/i
];
const absoluteHomePath = [
  /\/Users\/[^/\s]+\//,
  /\/home\/[^/\s]+\//,
  /[A-Za-z]:\\Users\\[^\\\s]+\\/
];
const errors = [];

if (packageJson.private === true) errors.push("package.json still has private=true");
if (packageJson.bin?.["fable-ous"] !== "bin/fable-ous.mjs") {
  errors.push("package.json must preserve the public fable-ous binary");
}
if (packed.name !== packageJson.name || packed.version !== packageJson.version) {
  errors.push("packed name/version does not match package.json");
}

for (const path of files) {
  const allowed = allowedExact.has(path) || allowedPrefixes.some((prefix) => path.startsWith(prefix));
  if (!allowed) errors.push(`unexpected package path: ${path}`);
  if (forbiddenPath.some((pattern) => pattern.test(path))) errors.push(`forbidden package path: ${path}`);

  const content = readFileSync(resolve(ROOT, path), "utf8");
  if (absoluteHomePath.some((pattern) => pattern.test(content))) {
    errors.push(`absolute home path found in: ${path}`);
  }
}

for (const path of required) {
  if (!files.includes(path)) errors.push(`required package path missing: ${path}`);
}

if (errors.length) {
  throw new Error(`Package content check failed:\n- ${errors.join("\n- ")}`);
}

process.stdout.write(
  `Package content verified: ${packed.name}@${packed.version}, ${files.length} files, ${packed.size} bytes.\n`
);
