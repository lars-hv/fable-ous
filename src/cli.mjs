import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

import { isFableModel } from "../plugins/fable-ous/scripts/activation.mjs";
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
  const forwarded = [...args];
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

  return {
    args: forwarded,
    model,
    env: {
      FABLE_OUS_MODEL: model,
      FABLE_OUS_FORCE: isFableModel(model) ? "off" : "on"
    }
  };
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
  const result = await runStrictTurn({ ...session, prompt });
  process.stdout.write(`${result.answer}\n`);
}

async function interactive(options) {
  const session = createStrictSession(strictOptions(options));
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  process.stdout.write("Fable-ous strict mode. Raw Codex responses stay hidden. Type /exit to quit.\n\n");
  try {
    while (true) {
      const prompt = (await terminal.question("you › ")).trim();
      if (!prompt) continue;
      if (prompt === "/exit" || prompt === "/quit") break;
      const result = await runStrictTurn({ ...session, prompt });
      process.stdout.write(`\nfable-ous › ${result.answer}\n\n`);
    }
  } finally {
    terminal.close();
  }
}

function install(options) {
  const pluginRoot = resolve(ROOT, "plugins/fable-ous");
  if (!commandExists("codex")) throw new Error("Codex CLI is not installed.");

  run("codex", ["plugin", "marketplace", "add", ROOT]);
  run("codex", ["plugin", "add", "fable-ous@fable-ous"]);

  if (!options["codex-only"] && commandExists("claude")) {
    run("claude", ["plugin", "validate", pluginRoot]);
    run("claude", ["plugin", "marketplace", "add", ROOT]);
    run("claude", ["plugin", "install", "fable-ous@fable-ous", "--scope", "user"]);
  }
  process.stdout.write("Fable-ous installed. Start a fresh Codex or Claude Code session.\n");
}

function doctor() {
  const result = {
    codex: { available: commandExists("codex"), installed: false },
    claude: { available: commandExists("claude"), installed: false },
    config: { modelVerbosity: "unset", personality: "unset" }
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
  process.stdout.write(`Fable-ous\n\nCommands:\n  fable-ous install [--codex-only]\n  fable-ous doctor\n  fable-ous strict [--cwd PATH] [--model MODEL] [--effort LEVEL]\n  fable-ous ask "PROMPT" [--cwd PATH] [--model MODEL]\n  fable-ous opus [...CLAUDE_ARGS]\n  fable-ous fable [...CLAUDE_ARGS]\n  fable-ous claude --model MODEL [...CLAUDE_ARGS]\n  fable-ous lint < response.txt\n`);
}

export async function main(argv) {
  if (argv[0] === "opus") return launchClaude(argv.slice(1), "claude-opus-5");
  if (argv[0] === "fable") return launchClaude(argv.slice(1), "claude-fable-5");
  if (argv[0] === "claude") return launchClaude(argv.slice(1));
  const { command, options } = parseArgs(argv);
  if (command === "install") return install(options);
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
