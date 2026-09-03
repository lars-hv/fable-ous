import { spawnSync } from "node:child_process";
import {
  accessSync,
  constants,
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync
} from "node:fs";
import { homedir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertSafeCodexCommunicationPaths,
  ensureCodexCommunicationLayer,
  isNativeCodexPreferencesActive,
  isCodexStyleLayerActive,
  nativeCodexPreferenceValues,
  removeCodexCommunicationLayer
} from "../plugins/fable-ous/scripts/activation.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_ROOT = resolve(ROOT, "plugins/fable-ous");
const EXPECTED_CODEX_MANIFEST = JSON.parse(readFileSync(resolve(PLUGIN_ROOT, ".codex-plugin/plugin.json"), "utf8"));
const EXPECTED_CLAUDE_MANIFEST = JSON.parse(readFileSync(resolve(PLUGIN_ROOT, ".claude-plugin/plugin.json"), "utf8"));

function artifactFiles(root, relative = "") {
  const directory = relative ? join(root, relative) : root;
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Unexpected symbolic link in plugin artifact: ${child}`);
    if (entry.isDirectory()) files.push(...artifactFiles(root, child));
    else if (entry.isFile()) files.push(child);
    else throw new Error(`Unexpected filesystem entry in plugin artifact: ${child}`);
  }
  return files.sort();
}

const EXPECTED_ARTIFACT_FILES = artifactFiles(PLUGIN_ROOT);

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

function envValue(env, name) {
  const entry = Object.entries(env).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return entry?.[1];
}

export function commandPath(command, { env = process.env, platform = process.platform } = {}) {
  const pathValue = envValue(env, "PATH");
  if (!pathValue || !command || /[\\/]/.test(command)) return null;
  const separator = platform === "win32" ? ";" : ":";
  const windowsExtensions = extname(command)
    ? [""]
    : String(envValue(env, "PATHEXT") || ".COM;.EXE;.BAT;.CMD")
      .split(";")
      .filter(Boolean);
  const extensions = platform === "win32" ? windowsExtensions : [""];

  for (const rawDirectory of pathValue.split(separator)) {
    const directory = rawDirectory.replace(/^"|"$/g, "");
    if (!directory) continue;
    for (const extension of extensions) {
      const candidate = join(directory, `${command}${extension}`);
      try {
        if (!statSync(candidate).isFile()) continue;
        if (platform !== "win32") accessSync(candidate, constants.X_OK);
        return candidate;
      } catch {
        // Keep searching PATH.
      }
    }
  }
  return null;
}

export function commandExists(command, options = {}) {
  return commandPath(command, options) !== null;
}

export function windowsCommandPlan(executable, args, env = process.env) {
  const values = [executable, ...args].map(String);
  if (values.some((value) => /[\r\n"&|<>^%!]/u.test(value))) {
    throw new Error("Cannot safely quote a Windows command shim invocation containing command-shell metacharacters.");
  }
  const commandLine = values.map((value) => `"${value}"`).join(" ");
  return {
    command: env.ComSpec || env.COMSPEC || "cmd.exe",
    args: ["/d", "/s", "/c", `"${commandLine}"`],
    spawnOptions: {
      shell: false,
      windowsVerbatimArguments: true
    }
  };
}

function commandResult(command, args, options = {}) {
  const executable = commandPath(command);
  if (!executable) throw new Error(`${command} is not installed.`);
  if (process.platform === "win32" && /\.(?:cmd|bat)$/iu.test(executable)) {
    const plan = windowsCommandPlan(executable, args);
    return spawnSync(plan.command, plan.args, { ...options, ...plan.spawnOptions });
  }
  return spawnSync(executable, args, { ...options, shell: false });
}

function run(command, args) {
  const result = commandResult(command, args, { stdio: "inherit" });
  if (result.error || result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed`);
}

function capture(command, args) {
  const result = commandResult(command, args, { encoding: "utf8" });
  if (result.error || result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed`);
  return result.stdout;
}

function parseClaudePluginList(pluginListJson = "[]") {
  let parsed;
  try {
    parsed = JSON.parse(String(pluginListJson));
  } catch {
    throw new Error("Claude plugin list returned malformed JSON.");
  }
  if (!Array.isArray(parsed)) throw new Error("Claude plugin list JSON must be an array.");
  return parsed;
}

function sameRealPath(left, right) {
  try {
    return realpathSync(left) === realpathSync(right);
  } catch {
    return false;
  }
}

function directoryHasFiles(path) {
  try {
    return readdirSync(path, { withFileTypes: true }).some((entry) => (
      entry.isFile() || entry.isSymbolicLink() || (entry.isDirectory() && directoryHasFiles(join(path, entry.name)))
    ));
  } catch {
    return false;
  }
}

function artifactBoundary(artifactPath) {
  const result = {
    artifactBound: false,
    lifecycleHooks: false,
    replacementClient: false,
    error: null
  };
  if (!artifactPath) {
    result.error = "No installed artifact path was available.";
    return result;
  }

  try {
    result.lifecycleHooks = directoryHasFiles(join(artifactPath, "hooks"))
      || existsSync(join(artifactPath, "scripts/hook.mjs"));
    result.replacementClient = directoryHasFiles(join(artifactPath, "src"))
      || directoryHasFiles(join(artifactPath, "bin"));
    const packagePath = join(artifactPath, "package.json");
    if (existsSync(packagePath)) {
      const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
      result.replacementClient ||= Boolean(
        packageJson.dependencies?.["@openai/codex-sdk"]
        || packageJson.devDependencies?.["@openai/codex-sdk"]
      );
    }
    const actualFiles = artifactFiles(artifactPath);
    result.artifactBound = actualFiles.length === EXPECTED_ARTIFACT_FILES.length
      && actualFiles.every((relative, index) => relative === EXPECTED_ARTIFACT_FILES[index])
      && EXPECTED_ARTIFACT_FILES.every((relative) => (
      readFileSync(join(artifactPath, relative), "utf8") === readFileSync(join(PLUGIN_ROOT, relative), "utf8")
      ));
  } catch {
    result.error = "Installed artifact could not be safely matched to this Fable-ous release.";
  }
  return result;
}

function safeCacheComponent(value) {
  return typeof value === "string" && /^[A-Za-z0-9_.+-]+$/u.test(value);
}

function codexActiveCachePath(plugin, codexHome) {
  if ([plugin?.marketplaceName, plugin?.name, plugin?.version].every(safeCacheComponent)) {
    const cached = join(
      codexHome,
      "plugins/cache",
      plugin.marketplaceName,
      plugin.name,
      plugin.version
    );
    if (existsSync(cached)) return cached;
  }
  return null;
}

function codexPluginStatus(pluginList, codexHome) {
  const plugin = Array.isArray(pluginList?.installed)
    ? pluginList.installed.find((entry) => (
      entry?.pluginId === "fable-ous@fable-ous"
      && entry?.name === "fable-ous"
      && entry?.marketplaceName === "fable-ous"
    ))
    : null;
  if (!plugin) return {
    installed: false,
    enabled: false,
    healthy: false,
    expectedVersion: EXPECTED_CODEX_MANIFEST.version,
    sourceBound: false,
    artifactBound: false
  };

  const boundary = artifactBoundary(codexActiveCachePath(plugin, codexHome));
  const sourceBound = plugin.source?.source === "local"
    && sameRealPath(plugin.source.path, PLUGIN_ROOT)
    && plugin.marketplaceSource?.sourceType === "local"
    && sameRealPath(plugin.marketplaceSource.source, ROOT);
  const installed = plugin.installed !== false;
  const enabled = plugin.enabled === true;
  const healthy = installed
    && enabled
    && plugin.version === EXPECTED_CODEX_MANIFEST.version
    && sourceBound
    && boundary.artifactBound
    && !boundary.lifecycleHooks
    && !boundary.replacementClient;
  return {
    installed,
    enabled,
    healthy,
    version: plugin.version || "unknown",
    expectedVersion: EXPECTED_CODEX_MANIFEST.version,
    sourceBound,
    artifactBound: boundary.artifactBound,
    lifecycleHooks: boundary.lifecycleHooks,
    replacementClient: boundary.replacementClient,
    ...(boundary.error ? { error: boundary.error } : {})
  };
}

function claudePluginStatus(pluginListJson, claudeHome) {
  const plugin = parseClaudePluginList(pluginListJson).find(
    (entry) => entry?.id === "fable-ous@fable-ous" && entry?.scope === "user"
  );
  if (!plugin) return {
    installed: false,
    enabled: false,
    healthy: false,
    expectedVersion: EXPECTED_CLAUDE_MANIFEST.version,
    sourceBound: false,
    artifactBound: false
  };

  const boundary = artifactBoundary(
    typeof plugin.installPath === "string" ? resolve(plugin.installPath) : null
  );
  const expectedInstallPath = safeCacheComponent(plugin.version)
    ? join(claudeHome, "plugins/cache/fable-ous/fable-ous", plugin.version)
    : null;
  const sourceBound = typeof plugin.installPath === "string"
    && expectedInstallPath !== null
    && sameRealPath(plugin.installPath, expectedInstallPath);
  const installed = true;
  const enabled = plugin.enabled === true;
  const healthy = enabled
    && plugin.version === EXPECTED_CLAUDE_MANIFEST.version
    && sourceBound
    && boundary.artifactBound
    && !boundary.lifecycleHooks
    && !boundary.replacementClient;
  return {
    installed,
    enabled,
    healthy,
    version: plugin.version || "unknown",
    expectedVersion: EXPECTED_CLAUDE_MANIFEST.version,
    sourceBound,
    artifactBound: boundary.artifactBound,
    lifecycleHooks: boundary.lifecycleHooks,
    replacementClient: boundary.replacementClient,
    ...(boundary.error ? { error: boundary.error } : {})
  };
}

export function claudePluginEnabled(pluginListJson = "[]") {
  return parseClaudePluginList(pluginListJson).some(
    (plugin) => plugin?.id === "fable-ous@fable-ous" && plugin?.scope === "user" && plugin?.enabled === true
  );
}

export function claudeInstallPlan(pluginListJson = "[]") {
  const installed = parseClaudePluginList(pluginListJson).some(
    (plugin) => plugin?.id === "fable-ous@fable-ous" && plugin?.scope === "user"
  );
  return installed
    ? ["plugin", "update", "fable-ous@fable-ous", "--scope", "user"]
    : ["plugin", "install", "fable-ous@fable-ous", "--scope", "user"];
}

export function claudeEnablePlan(pluginListJson = "[]") {
  const installed = parseClaudePluginList(pluginListJson).find(
    (plugin) => plugin?.id === "fable-ous@fable-ous" && plugin?.scope === "user"
  );
  return installed && installed.enabled !== true
    ? ["plugin", "enable", "fable-ous@fable-ous", "--scope", "user"]
    : null;
}

function install(options) {
  const allowLegacyMigration = options["migrate-legacy"] === true;
  assertSafeCodexCommunicationPaths({}, {
    allowLegacyNativeMarker: allowLegacyMigration,
    allowLegacyStyleMarker: allowLegacyMigration
  });
  if (!commandExists("codex")) throw new Error("Codex CLI is not installed.");
  const codexHome = process.env.CODEX_HOME
    ? resolve(process.env.CODEX_HOME)
    : resolve(homedir(), ".codex");
  run("codex", ["plugin", "marketplace", "add", ROOT]);
  run("codex", ["plugin", "add", "fable-ous@fable-ous"]);
  let installedCodex;
  try {
    installedCodex = codexPluginStatus(
      JSON.parse(capture("codex", ["plugin", "list", "--json"])),
      codexHome
    );
  } catch {
    throw new Error("Codex did not report an active plugin after installation.");
  }
  if (!installedCodex.healthy) {
    throw new Error("Codex did not bind an enabled artifact to the expected Fable-ous release.");
  }

  if (!options["codex-only"] && commandExists("claude")) {
    const claudeHome = process.env.CLAUDE_CONFIG_DIR
      ? resolve(process.env.CLAUDE_CONFIG_DIR)
      : resolve(homedir(), ".claude");
    run("claude", ["plugin", "validate", PLUGIN_ROOT]);
    run("claude", ["plugin", "marketplace", "add", ROOT]);
    const installed = capture("claude", ["plugin", "list", "--json"]);
    run("claude", claudeInstallPlan(installed));
    let postInstall = capture("claude", ["plugin", "list", "--json"]);
    const enablePlan = claudeEnablePlan(postInstall);
    if (enablePlan) run("claude", enablePlan);
    if (enablePlan) postInstall = capture("claude", ["plugin", "list", "--json"]);
    const installedStatus = claudePluginStatus(postInstall, claudeHome);
    if (!installedStatus.healthy) {
      throw new Error("Claude did not bind an enabled user-scope artifact to the expected Fable-ous release.");
    }
  }

  const { style, nativePreferences } = ensureCodexCommunicationLayer({ allowLegacyMigration });

  process.stdout.write(
    `Fable-ous installed in native Codex. Style source: ${style.source}; native calm settings: ${nativePreferences.active ? "active" : "inactive"}. Start a fresh session with codex.\n`
  );
}

function styleOff() {
  const { style, nativePreferences } = removeCodexCommunicationLayer();
  process.stdout.write(style.removed || nativePreferences.restored
    ? "Fable-ous restored its managed Codex communication settings.\n"
    : "Fable-ous markers were removed; existing user settings were preserved.\n");
}

function doctor() {
  const codexHome = process.env.CODEX_HOME ? resolve(process.env.CODEX_HOME) : resolve(homedir(), ".codex");
  const claudeHome = process.env.CLAUDE_CONFIG_DIR
    ? resolve(process.env.CLAUDE_CONFIG_DIR)
    : resolve(homedir(), ".claude");
  const result = {
    codex: { available: commandExists("codex"), installed: false, healthy: false },
    claude: { available: commandExists("claude"), installed: false, healthy: false },
    config: {
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
      const parsed = JSON.parse(capture("codex", ["plugin", "list", "--json"]));
      result.codex = { available: true, ...codexPluginStatus(parsed, codexHome) };
    } catch {
      result.codex.error = "Could not read Codex plugins.";
    }
  }

  if (result.claude.available) {
    try {
      const output = capture("claude", ["plugin", "list", "--json"]);
      result.claude = { available: true, ...claudePluginStatus(output, claudeHome) };
    } catch {
      result.claude.error = "Could not read Claude plugins.";
    }
  }

  const configPath = process.env.FABLE_OUS_CODEX_CONFIG_PATH || join(codexHome, "config.toml");
  if (existsSync(configPath)) {
    try {
      const values = nativeCodexPreferenceValues({ codexConfigPath: configPath });
      result.config.personality = values.personality;
      result.config.hideAgentReasoning = values.hide_agent_reasoning;
    } catch {
      result.config.error = "Could not safely read native Codex preferences.";
    }
  }

  result.nativeMode.lifecycleHooks = Boolean(
    result.codex.enabled && result.codex.lifecycleHooks
    || result.claude.enabled && result.claude.lifecycleHooks
  );
  result.nativeMode.replacementClient = Boolean(
    result.codex.enabled && result.codex.replacementClient
    || result.claude.enabled && result.claude.replacementClient
  );

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  const unhealthyEnabledClaude = result.claude.installed && result.claude.enabled && !result.claude.healthy;
  if (!result.codex.healthy
    || unhealthyEnabledClaude
    || !result.nativeMode.durableStyle
    || !result.nativeMode.calmPreferences) {
    process.exitCode = 1;
  }
}

function help() {
  process.stdout.write(`Fable-ous · native Codex plugin

Install once, then run Codex normally:
  fable-ous install [--codex-only] [--migrate-legacy]
  codex

Commands:
  fable-ous install [--codex-only] [--migrate-legacy]
  fable-ous doctor
  fable-ous style-off        Remove only the reversible Codex communication layer
`);
}

export async function main(argv) {
  const { command, options } = parseArgs(argv);
  if (command === "install") return install(options);
  if (command === "style-off") return styleOff();
  if (command === "doctor") return doctor();
  if (command === "help" || command === "--help" || command === "-h") return help();
  throw new Error(`Unknown command: ${command}`);
}
