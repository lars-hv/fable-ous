import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const MANAGED_BLOCK_START = "<!-- fable-ous:codex-style:start -->";
export const MANAGED_BLOCK_END = "<!-- fable-ous:codex-style:end -->";
export const NATIVE_CODEX_PREFERENCES = {
  personality: '"friendly"',
  model_verbosity: '"low"',
  hide_agent_reasoning: "true"
};

export const MANAGED_CODEX_CONTRACT = `${MANAGED_BLOCK_START}
## Fable-ous communication

Lead with the outcome, judgment, or acknowledgement. Use warm, plain language. Keep routine answers to 40–100 words and at most three short paragraphs. Give one recommendation and why it matters.

Respond to the user's likely intent and practical need, not just the literal wording. Keep routine work in the background; speak during execution only when a finding, risk, blocker, required decision, changed direction, or material proof changes what the user needs to know.

Treat the final answer as the user-visible handoff: make it natural, direct, and complete rather than a process recap or fixed status envelope. Do not repeat client tool receipts, command counts, file reads, or running-job inventories. Preserve failed verification, uncertainty, risk, missing proof, citations, and authorization boundaries. Exact-output requests apply only when they do not conflict with safety or authorization.

This section changes communication only. Brevity does not reduce analysis, coding, testing, verification, or necessary technical work. It does not replace or override coding workflow, tools, hooks, plugins, safety rules, approval boundaries, or completion judgment.
${MANAGED_BLOCK_END}`;

export function isClaudeHost(env = process.env) {
  return Boolean(env.CLAUDE_PLUGIN_ROOT) && !env.PLUGIN_ROOT;
}

function resolvePaths({ agentsPath, codexConfigPath, configDir, env = process.env } = {}) {
  const resolvedConfigDir = configDir || env.FABLE_OUS_CONFIG_DIR || join(homedir(), ".codex", "fable-ous");
  return {
    agentsPath: agentsPath || env.FABLE_OUS_AGENTS_PATH || join(homedir(), ".codex", "AGENTS.md"),
    codexConfigPath: codexConfigPath || env.FABLE_OUS_CODEX_CONFIG_PATH || join(homedir(), ".codex", "config.toml"),
    configDir: resolvedConfigDir,
    markerPath: join(resolvedConfigDir, "standard.json"),
    nativeMarkerPath: join(resolvedConfigDir, "native-preferences.json")
  };
}

function atomicWrite(path, content, mode = 0o600) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temporary, content, { encoding: "utf8", mode, flag: "wx" });
  renameSync(temporary, path);
}

export function hasStrongCodexContract(content = "") {
  const value = String(content);
  return [
    /lead with (?:one|a|the)?\s*(?:clear\s+)?(?:recommendation|outcome|result|judgment)/i,
    /keep most work in the background|work quietly|speak only when[^.\n]*(?:finding|risk|blocker)/i,
    /likely intent|practical need|not just the literal wording/i,
    /warm[^.\n]*plain|plain[^.\n]*warm/i,
    /never hide[^.\n]*(?:failed|failure|uncertainty|risk|authorization)|preserve[^.\n]*(?:proof|evidence|failed verification)/i
  ].every((pattern) => pattern.test(value));
}

function readText(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function readOptionalText(path) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw new Error(`Cannot safely read ${path}: ${error?.message || "unknown error"}`);
  }
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findTopLevelSetting(content, key) {
  const table = content.search(/^[ \t]*\[[^\]\r\n]+\][ \t]*(?:#.*)?\r?$/m);
  const boundary = table >= 0 ? table : content.length;
  const head = content.slice(0, boundary);
  const keyPattern = `(?:${escapeRegExp(key)}|["']${escapeRegExp(key)}["'])`;
  const pattern = new RegExp(`^[ \\t]*${keyPattern}[ \\t]*=[^\\r\\n]*(?:\\r?\\n|$)`, "gm");
  const matches = [...head.matchAll(pattern)];
  if (matches.length > 1) throw new Error(`Duplicate top-level Codex setting: ${key}`);
  const match = matches[0];
  if (!match || match.index === undefined) return null;
  const withEnding = match[0];
  return {
    index: match.index,
    end: match.index + withEnding.length,
    line: withEnding.replace(/\r?\n$/, ""),
    ending: withEnding.endsWith("\r\n") ? "\r\n" : withEnding.endsWith("\n") ? "\n" : ""
  };
}

function settingValue(setting) {
  if (!setting) return null;
  const value = setting.line.slice(setting.line.indexOf("=") + 1).trim();
  const quoted = /^(?:"([^"\\]*(?:\\.[^"\\]*)*)"|'([^']*)')[ \t]*(?:#.*)?$/.exec(value);
  if (quoted) return { type: "string", value: quoted[1] ?? quoted[2] };
  const bool = /^(true|false)[ \t]*(?:#.*)?$/.exec(value);
  return bool ? { type: "boolean", value: bool[1] } : null;
}

function desiredSettingValue(value) {
  if (value === "true" || value === "false") return { type: "boolean", value };
  return { type: "string", value: JSON.parse(value) };
}

function settingHasDesiredValue(setting, desired) {
  const actual = settingValue(setting);
  const expected = desiredSettingValue(desired);
  return actual?.type === expected.type && actual.value === expected.value;
}

function replaceSetting(content, setting, line) {
  return `${content.slice(0, setting.index)}${line}${setting.ending}${content.slice(setting.end)}`;
}

export function ensureNativeCodexPreferences(options = {}) {
  const paths = resolvePaths(options);
  const existed = existsSync(paths.codexConfigPath);
  let content = options.existingContent ?? readOptionalText(paths.codexConfigPath);
  const markerExists = existsSync(paths.nativeMarkerPath);
  const existingMarker = readJson(paths.nativeMarkerPath);
  const validOriginal = existingMarker?.original
    && typeof existingMarker.original === "object"
    && !Array.isArray(existingMarker.original);
  if (markerExists && (existingMarker?.schema !== 1 || !validOriginal)) {
    throw new Error(`Cannot safely update invalid rollback marker: ${paths.nativeMarkerPath}`);
  }
  const original = validOriginal ? { ...existingMarker.original } : {};
  let changed = false;

  for (const [key, value] of Object.entries(NATIVE_CODEX_PREFERENCES)) {
    const desired = `${key} = ${value}`;
    const setting = findTopLevelSetting(content, key);
    if (markerExists && !settingHasDesiredValue(setting, value)) {
      original[key] = setting ? { present: true, line: setting.line } : { present: false };
    } else if (!(key in original)) {
      original[key] = setting ? { present: true, line: setting.line } : { present: false };
    }
    if (settingHasDesiredValue(setting, value)) continue;
    content = setting
      ? replaceSetting(content, setting, desired)
      : `${desired}\n${content}`;
    changed = true;
  }

  atomicWrite(paths.nativeMarkerPath, `${JSON.stringify({ schema: 1, original })}\n`);
  if (changed || (options.existingContent !== undefined && !existed)) {
    atomicWrite(paths.codexConfigPath, content);
  }
  return { active: true, changed, ...paths };
}

export function isNativeCodexPreferencesActive(options = {}) {
  const paths = resolvePaths(options);
  if (!existsSync(paths.nativeMarkerPath)) return false;
  const content = readText(paths.codexConfigPath);
  return Object.entries(NATIVE_CODEX_PREFERENCES).every(([key, value]) => {
    const setting = findTopLevelSetting(content, key);
    return settingHasDesiredValue(setting, value);
  });
}

export function nativeCodexPreferenceValues(options = {}) {
  const paths = resolvePaths(options);
  const content = readOptionalText(paths.codexConfigPath);
  return Object.fromEntries(Object.keys(NATIVE_CODEX_PREFERENCES).map((key) => {
    const parsed = settingValue(findTopLevelSetting(content, key));
    return [key, parsed?.value ?? "unset"];
  }));
}

export function removeNativeCodexPreferences(options = {}) {
  const paths = resolvePaths(options);
  const marker = readJson(paths.nativeMarkerPath);
  if (marker?.schema !== 1 || !marker.original) {
    return { restored: false, markerPreserved: existsSync(paths.nativeMarkerPath), ...paths };
  }

  let content = readOptionalText(paths.codexConfigPath);
  let changed = false;
  for (const [key, value] of Object.entries(NATIVE_CODEX_PREFERENCES)) {
    const setting = findTopLevelSetting(content, key);
    if (!setting || !settingHasDesiredValue(setting, value)) continue;
    const previous = marker.original[key];
    content = previous?.present
      ? replaceSetting(content, setting, previous.line)
      : `${content.slice(0, setting.index)}${content.slice(setting.end)}`;
    changed = true;
  }

  if (changed) atomicWrite(paths.codexConfigPath, content);
  rmSync(paths.nativeMarkerPath, { force: true });
  return { restored: changed, ...paths };
}

function writeMarker(paths, source) {
  atomicWrite(paths.markerPath, `${JSON.stringify({ schema: 1, source })}\n`);
}

export function ensureCodexStyleLayer(options = {}) {
  const paths = resolvePaths(options);
  const existed = existsSync(paths.agentsPath);
  const content = options.existingContent ?? readOptionalText(paths.agentsPath);

  const managedStart = content.indexOf(MANAGED_BLOCK_START);
  const managedEnd = content.indexOf(MANAGED_BLOCK_END);
  if (managedStart >= 0 && managedEnd >= managedStart) {
    const oldBlock = content.slice(managedStart, managedEnd + MANAGED_BLOCK_END.length);
    const changed = oldBlock !== MANAGED_CODEX_CONTRACT;
    const next = changed
      ? `${content.slice(0, managedStart)}${MANAGED_CODEX_CONTRACT}${content.slice(managedEnd + MANAGED_BLOCK_END.length)}`
      : content;
    writeMarker(paths, "managed");
    if (changed || (options.existingContent !== undefined && !existed)) atomicWrite(paths.agentsPath, next);
    return { active: true, changed, source: "managed", ...paths };
  }

  if (hasStrongCodexContract(content)) {
    if (options.existingContent !== undefined && !existed) atomicWrite(paths.agentsPath, content);
    const source = "existing";
    writeMarker(paths, source);
    return { active: true, changed: false, source, ...paths };
  }

  if (existed) {
    const backupPath = `${paths.agentsPath}.fable-ous.bak`;
    if (!existsSync(backupPath)) copyFileSync(paths.agentsPath, backupPath);
  }

  const prefix = content.trimEnd();
  const next = `${prefix ? `${prefix}\n\n` : ""}${MANAGED_CODEX_CONTRACT}\n`;
  writeMarker(paths, "managed");
  atomicWrite(paths.agentsPath, next);
  return { active: true, changed: true, source: "managed", ...paths };
}

export function isCodexStyleLayerActive(options = {}) {
  const paths = resolvePaths(options);
  if (!existsSync(paths.markerPath)) return false;
  const content = readOptionalText(paths.agentsPath);
  return content.includes(MANAGED_BLOCK_START) || hasStrongCodexContract(content);
}

export function removeCodexStyleLayer(options = {}) {
  const paths = resolvePaths(options);
  const content = readText(paths.agentsPath);
  const start = content.indexOf(MANAGED_BLOCK_START);
  const end = content.indexOf(MANAGED_BLOCK_END);
  let removed = false;

  if (start >= 0 && end >= start) {
    const before = content.slice(0, start).trimEnd();
    const after = content.slice(end + MANAGED_BLOCK_END.length).trimStart();
    const next = [before, after].filter(Boolean).join("\n\n");
    atomicWrite(paths.agentsPath, next ? `${next}\n` : "");
    removed = true;
  }

  rmSync(paths.markerPath, { force: true });
  return { removed, ...paths };
}
