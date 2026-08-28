import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

import {
  ensureCodexStyleLayer,
  isCodexStyleLayerActive,
  removeCodexStyleLayer
} from "../plugins/fable-ous/scripts/activation.mjs";
import { handleHook } from "../plugins/fable-ous/scripts/hook.mjs";
import { analyzeStyle } from "../plugins/fable-ous/scripts/style.mjs";
import { createStrictSession, runStrictTurn } from "./strict.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const args = [...argv];
  const command = args[0] && !args[0].startsWith("-") ? args.shift() : "strict";
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

export function claudeLaunchPlan(args = [], defaultModel = "") {
  const clean = args.includes("--clean");
  const forwarded = args.filter((value) => value !== "--clean");
  let model = "";
  const modelIndex = forwarded.findIndex((value) => value === "--model");
  const inlineModel = forwarded.find((value) => value.startsWith("--model="));

  if (modelIndex >= 0) model = String(forwarded[modelIndex + 1] || "");
  else if (inlineModel) model = inlineModel.slice("--model=".length);
  else if (defaultModel) {
    model = defaultModel;
    forwarded.unshift("--model", model);
  }

  if (!model) {
    throw new Error("Pass --model explicitly, or use `fable-ous opus` / `fable-ous fable`. Fable-ous will not guess on Claude.");
  }

  if (clean) {
    forwarded.unshift("--setting-sources", "local", "--plugin-dir", resolve(ROOT, "plugins/fable-ous"));
  }

  return {
    args: forwarded,
    model,
    clean,
    env: {}
  };
}

export function claudeInstallPlan(pluginListJson = "[]") {
  let plugins = [];
  try {
    const parsed = JSON.parse(String(pluginListJson || "[]"));
    if (Array.isArray(parsed)) plugins = parsed;
  } catch {
    // A malformed list is treated as a first install; Claude will report a
    // concrete error instead of letting Fable-ous claim a successful upgrade.
  }
  const installed = plugins.some((plugin) => plugin?.id === "fable-ous@fable-ous");
  return installed
    ? ["plugin", "update", "fable-ous@fable-ous", "--scope", "user"]
    : ["plugin", "install", "fable-ous@fable-ous", "--scope", "user"];
}

function launchClaude(args, defaultModel = "") {
  if (!commandExists("claude")) throw new Error("Claude Code is not installed.");
  const plan = claudeLaunchPlan(args, defaultModel);
  const result = spawnSync("claude", plan.args, {
    stdio: "inherit",
    env: { ...process.env, ...plan.env }
  });
  if (result.status !== 0) process.exitCode = result.status ?? 1;
}

function strictOptions(options) {
  return {
    cwd: resolve(String(options.cwd || process.cwd())),
    ...(options.model ? { model: String(options.model) } : {}),
    ...(options.effort ? { effort: String(options.effort) } : {}),
    ...(options.sandbox ? { sandboxMode: String(options.sandbox) } : {}),
    ...(options.approval ? { approvalPolicy: String(options.approval) } : {})
  };
}

async function askOnce(prompt, options) {
  const session = createStrictSession(strictOptions(options));
  const result = await runStrictTurn({
    ...session,
    prompt,
    onProgress: (message) => process.stderr.write(`· ${message}\n`)
  });
  process.stdout.write(`${result.answer}\n`);
}

async function interactive(options) {
  const session = createStrictSession(strictOptions(options));
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  process.stdout.write("Fable-ous · clean  (/exit to quit)\n\n");
  try {
    while (true) {
      const prompt = (await terminal.question("› ")).trim();
      if (!prompt) continue;
      if (prompt === "/exit" || prompt === "/quit") break;
      const activity = startActivity();
      let result;
      try {
        result = await runStrictTurn({
          ...session,
          prompt,
          onProgress: (message) => activity.note(message)
        });
      } finally {
        activity.stop();
      }
      process.stdout.write(`${result.answer}\n\n`);
    }
  } finally {
    terminal.close();
  }
}

function startActivity(stream = process.stdout) {
  let timer;
  let frame = 0;
  let active = true;
  const frames = ["·", "··", "···"];
  const clear = () => {
    if (stream.isTTY) stream.write("\r\u001b[2K");
  };
  const draw = () => {
    if (stream.isTTY && active) stream.write(`\r${frames[frame++ % frames.length]} Working`);
  };

  if (stream.isTTY) {
    draw();
    timer = setInterval(draw, 280);
    timer.unref?.();
  }

  return {
    note(message) {
      clear();
      stream.write(`· ${message}\n`);
      draw();
    },
    stop() {
      active = false;
      if (timer) clearInterval(timer);
      clear();
    }
  };
}

function install(options) {
  const pluginRoot = resolve(ROOT, "plugins/fable-ous");
  if (!commandExists("codex")) throw new Error("Codex CLI is not installed.");

  run("codex", ["plugin", "marketplace", "add", ROOT]);
  run("codex", ["plugin", "add", "fable-ous@fable-ous"]);
  const style = ensureCodexStyleLayer();

  if (!options["codex-only"] && commandExists("claude")) {
    run("claude", ["plugin", "validate", pluginRoot]);
    run("claude", ["plugin", "marketplace", "add", ROOT]);
    const installed = execFileSync("claude", ["plugin", "list", "--json"], { encoding: "utf8" });
    run("claude", claudeInstallPlan(installed));
  }
  process.stdout.write(`Fable-ous installed. Codex style source: ${style.source}. Start a fresh session.\n`);
}

function styleOff() {
  const result = removeCodexStyleLayer();
  process.stdout.write(result.removed
    ? "Fable-ous removed its managed Codex instruction block.\n"
    : "Fable-ous Codex style marker removed; existing user instructions were preserved.\n");
}

function doctor() {
  const result = {
    codex: { available: commandExists("codex"), installed: false },
    claude: { available: commandExists("claude"), installed: false },
    config: { modelVerbosity: "unset", personality: "unset" },
    standardMode: {
      durableStyle: isCodexStyleLayerActive(),
      perTurnHooksSilent: handleHook({ mode: "prompt-submit" }) === null
    }
  };

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
    const config = readFileSync(configPath, "utf8");
    result.config.modelVerbosity = config.match(/^model_verbosity\s*=\s*"([^"]+)"/m)?.[1] || "unset";
    result.config.personality = config.match(/^personality\s*=\s*"([^"]+)"/m)?.[1] || "unset";
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
  process.stdout.write(`Fable-ous\n\nCommands:\n  fable-ous install [--codex-only]\n  fable-ous style-off\n  fable-ous doctor\n  fable-ous strict [--cwd PATH] [--model MODEL] [--effort LEVEL]\n  fable-ous ask "PROMPT" [--cwd PATH] [--model MODEL]\n  fable-ous opus [--clean] [...CLAUDE_ARGS]\n  fable-ous fable [--clean] [...CLAUDE_ARGS]\n  fable-ous claude --model MODEL [--clean] [...CLAUDE_ARGS]\n  fable-ous lint < response.txt\n`);
}

export async function main(argv) {
  if (argv[0] === "opus") return launchClaude(argv.slice(1), "claude-opus-5");
  if (argv[0] === "fable") return launchClaude(argv.slice(1), "claude-fable-5");
  if (argv[0] === "claude") return launchClaude(argv.slice(1));
  const { command, options } = parseArgs(argv);
  if (command === "install") return install(options);
  if (command === "style-off") return styleOff();
  if (command === "doctor") return doctor();
  if (command === "lint") return lint();
  if (command === "ask") {
    const prompt = options._.join(" ").trim();
    if (!prompt) throw new Error("Provide a prompt after `fable-ous ask`.");
    return askOnce(prompt, options);
  }
  if (command === "strict") return interactive(options);
  if (command === "help" || command === "--help" || command === "-h") return help();
  throw new Error(`Unknown command: ${command}`);
}
