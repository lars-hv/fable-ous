import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ensureNativeCodexPreferences,
  ensureCodexStyleLayer,
  isNativeCodexPreferencesActive,
  isCodexStyleLayerActive,
  nativeCodexPreferenceValues,
  removeNativeCodexPreferences,
  removeCodexStyleLayer
} from "../plugins/fable-ous/scripts/activation.mjs";
import { analyzeStyle } from "../plugins/fable-ous/scripts/style.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function parseArgs(argv) {
  const args = [...argv];
  const command = args[0] && !args[0].startsWith("-") ? args.shift() : "help";
  const options = { _: [] };
  while (args.length) {
    const value = args.shift();
    if (!value.startsWith("--")) {
      options._.push(value);
      continue;
    }
    const [key, inline] = value.slice(2).split("=", 2);
    if (inline !== undefined) options[key] = inline;
    else if (args[0] && !args[0].startsWith("--")) options[key] = args.shift();
    else options[key] = true;
  }
  return { command, options };
}

function commandExists(command) {
  return spawnSync("sh", ["-lc", `command -v ${command}`], { stdio: "ignore" }).status === 0;
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed`);
}

export function claudeInstallPlan(pluginListJson = "[]") {
  let plugins = [];
  try {
    const parsed = JSON.parse(String(pluginListJson || "[]"));
    if (Array.isArray(parsed)) plugins = parsed;
  } catch {
    // Let Claude report a concrete install error instead of claiming an
    // upgrade from an unreadable plugin list.
  }
  const installed = plugins.some((plugin) => plugin?.id === "fable-ous@fable-ous");
  return installed
    ? ["plugin", "update", "fable-ous@fable-ous", "--scope", "user"]
    : ["plugin", "install", "fable-ous@fable-ous", "--scope", "user"];
}

function install(options) {
  const pluginRoot = resolve(ROOT, "plugins/fable-ous");
  if (!commandExists("codex")) throw new Error("Codex CLI is not installed.");
  let styleWasActive = true;
  let nativePreferencesWereActive = true;
  try {
    styleWasActive = isCodexStyleLayerActive();
    nativePreferencesWereActive = isNativeCodexPreferencesActive();
  } catch {
    // Preserve unknown pre-existing state if the user's files cannot be inspected safely.
  }

  run("codex", ["plugin", "marketplace", "add", ROOT]);
  run("codex", ["plugin", "add", "fable-ous@fable-ous"]);

  if (!options["codex-only"] && commandExists("claude")) {
    run("claude", ["plugin", "validate", pluginRoot]);
    run("claude", ["plugin", "marketplace", "add", ROOT]);
    const installed = execFileSync("claude", ["plugin", "list", "--json"], { encoding: "utf8" });
    run("claude", claudeInstallPlan(installed));
  }

  let style;
  let nativePreferences;
  try {
    style = ensureCodexStyleLayer();
    nativePreferences = ensureNativeCodexPreferences();
  } catch (error) {
    if (!nativePreferencesWereActive) removeNativeCodexPreferences();
    if (!styleWasActive) removeCodexStyleLayer();
    throw error;
  }

  process.stdout.write(
    `Fable-ous installed in native Codex. Style source: ${style.source}; native calm settings: ${nativePreferences.active ? "active" : "inactive"}. Start a fresh session with codex.\n`
  );
}

function styleOff() {
  const style = removeCodexStyleLayer();
  const nativePreferences = removeNativeCodexPreferences();
  process.stdout.write(nativePreferences.markerPreserved
    ? "Fable-ous preserved an unreadable rollback marker; no unsafe preference restore was attempted.\n"
    : style.removed || nativePreferences.restored
    ? "Fable-ous restored its managed Codex communication settings.\n"
    : "Fable-ous markers were removed; existing user settings were preserved.\n");
}

function doctor() {
  const result = {
    codex: { available: commandExists("codex"), installed: false },
    claude: { available: commandExists("claude"), installed: false },
    config: {
      modelVerbosity: "unset",
      personality: "unset",
      hideAgentReasoning: "unset"
    },
    nativeMode: {
      durableStyle: false,
      calmPreferences: false,
      lifecycleHooks: false,
      replacementClient: false
    },
    limits: {
      nativeToolReceiptsRemainVisible: true,
      externalHooksCanOverrideTheFinal: true
    }
  };

  try {
    result.nativeMode.durableStyle = isCodexStyleLayerActive();
    result.nativeMode.calmPreferences = isNativeCodexPreferencesActive();
  } catch {
    result.nativeMode.error = "Could not safely inspect managed Codex communication files.";
  }

  if (result.codex.available) {
    try {
      const parsed = JSON.parse(execFileSync("codex", ["plugin", "list", "--json"], { encoding: "utf8" }));
      result.codex.installed = parsed.installed?.some((plugin) => plugin.name === "fable-ous" && plugin.enabled) || false;
    } catch {
      result.codex.error = "Could not read Codex plugins.";
    }
  }

  if (result.claude.available) {
    try {
      const output = execFileSync("claude", ["plugin", "list", "--json"], { encoding: "utf8" });
      result.claude.installed = output.includes("fable-ous");
    } catch {
      result.claude.error = "Could not read Claude plugins.";
    }
  }

  const configPath = resolve(homedir(), ".codex/config.toml");
  if (existsSync(configPath)) {
    try {
      const values = nativeCodexPreferenceValues({ codexConfigPath: configPath });
      result.config.modelVerbosity = values.model_verbosity;
      result.config.personality = values.personality;
      result.config.hideAgentReasoning = values.hide_agent_reasoning;
    } catch {
      result.config.error = "Could not safely read native Codex preferences.";
    }
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.codex.installed) process.exitCode = 1;
}

async function lint() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const issues = analyzeStyle(input);
  process.stdout.write(`${JSON.stringify({ pass: issues.length === 0, issues }, null, 2)}\n`);
  if (issues.length) process.exitCode = 1;
}

function help() {
  process.stdout.write(`Fable-ous · native Codex plugin

Install once, then run Codex normally:
  fable-ous install [--codex-only]
  codex

Commands:
  fable-ous install [--codex-only]
  fable-ous doctor
  fable-ous style-off
  fable-ous lint < response.txt
`);
}

export async function main(argv) {
  const { command, options } = parseArgs(argv);
  if (command === "install") return install(options);
  if (command === "style-off") return styleOff();
  if (command === "doctor") return doctor();
  if (command === "lint") return lint();
  if (command === "help" || command === "--help" || command === "-h") return help();
  throw new Error(`Unknown command: ${command}`);
}
