import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export const MANAGED_BLOCK_START = "<!-- fable-ous:codex-style:start -->";
export const MANAGED_BLOCK_END = "<!-- fable-ous:codex-style:end -->";
const MANAGED_BLOCK_SEPARATOR = "\n<!-- fable-ous:codex-style:boundary -->\n";
export const NATIVE_CODEX_PREFERENCES = {
  personality: '"friendly"',
  hide_agent_reasoning: "true"
};

let activeOwnedTransaction = null;

const RETIRED_NATIVE_CODEX_PREFERENCES = {
  model_verbosity: '"low"'
};

export const MANAGED_CODEX_CONTRACT = `${MANAGED_BLOCK_START}
## Fable-ous communication

Lead with the outcome, judgment, or acknowledgement. Use warm, plain adult-to-adult language. Give one recommendation and why it matters. Use the length the subject needs; completeness and clarity matter more than shortness.

This is a wording and presentation layer only. Describe the work and outcome established by the host's existing workflow; it neither selects work nor changes how work is planned, performed, tested, reviewed, approved, or completed.

Make every user-facing message earn its place: add a result, decision, changed understanding, material risk, blocker, or proof the user needs. Do not narrate commands, file reads, tool counts, or the full sequence of work. Short progress updates are useful when they change what the user needs to know; required host notices still apply.

Treat the final answer as the user-visible handoff, not an internal receipt. It should answer the practical question without forcing a follow-up: what happened, whether the host has established that the requested outcome is finished, what changed for the user and why it matters, and what concrete evidence makes that believable. Report that evidence without creating or relaxing completion criteria. Include the material caveat or missing proof when one exists. Give one exact next action only when something remains. Use natural prose rather than a fixed status form, and include numbers, filenames, or technical detail only when they materially improve understanding or trust. When installed or customer behavior is part of the outcome, distinguish local checks from live evidence.

Preserve safety warnings, authorization boundaries, uncertainty, failed verification, citations, and honest limits. Exact-output requests apply only when they do not conflict with safety or authorization.

This section controls wording and presentation only. It does not replace or override the host's coding workflow, tools, hooks, plugins, safety rules, approval boundaries, evidence requirements, or completion judgment.
${MANAGED_BLOCK_END}`;

export function isClaudeHost(env = process.env) {
  return Boolean(env.CLAUDE_PLUGIN_ROOT) && !env.PLUGIN_ROOT;
}

function resolvePaths({ agentsPath, codexConfigPath, configDir, env = process.env } = {}) {
  const codexHome = env.CODEX_HOME ? resolve(env.CODEX_HOME) : join(homedir(), ".codex");
  const resolvedConfigDir = configDir || env.FABLE_OUS_CONFIG_DIR || join(codexHome, "fable-ous");
  return {
    agentsPath: agentsPath || env.FABLE_OUS_AGENTS_PATH || join(codexHome, "AGENTS.md"),
    codexConfigPath: codexConfigPath || env.FABLE_OUS_CODEX_CONFIG_PATH || join(codexHome, "config.toml"),
    configDir: resolvedConfigDir,
    markerPath: join(resolvedConfigDir, "standard.json"),
    nativeMarkerPath: join(resolvedConfigDir, "native-preferences.json")
  };
}

function requireRegularFileOrAbsent(path) {
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      throw new Error(`Cannot safely modify symbolic link: ${path}`);
    }
    if (!stat.isFile()) {
      throw new Error(`Cannot safely modify a managed path that is not a regular file: ${path}`);
    }
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
}

function atomicWrite(path, content, mode = 0o600) {
  requireRegularFileOrAbsent(path);
  let effectiveMode = mode;
  try {
    effectiveMode = lstatSync(path).mode & 0o7777;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(temporary, content, { encoding: "utf8", mode: effectiveMode, flag: "wx" });
    chmodSync(temporary, effectiveMode);
    const produced = ownedPathState(temporary);
    activeOwnedTransaction?.assertCurrent(path);
    renameSync(temporary, path);
    activeOwnedTransaction?.record(path, produced);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function removeOwnedPath(path, options = {}) {
  requireRegularFileOrAbsent(path);
  activeOwnedTransaction?.assertCurrent(path);
  rmSync(path, options);
  activeOwnedTransaction?.record(path, { path, existed: false });
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

function escapedAt(line, index) {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && line[cursor] === "\\"; cursor--) slashes++;
  return slashes % 2 === 1;
}

function decodeTomlBasicKey(source) {
  let result = "";
  for (let index = 1; index < source.length - 1; index++) {
    const character = source[index];
    if (character !== "\\") {
      const code = character.codePointAt(0);
      if (code < 0x20 || code === 0x7f) return null;
      result += character;
      continue;
    }

    const escape = source[++index];
    const simple = {
      b: "\b",
      t: "\t",
      n: "\n",
      f: "\f",
      r: "\r",
      '"': '"',
      "\\": "\\"
    };
    if (Object.hasOwn(simple, escape)) {
      result += simple[escape];
      continue;
    }
    const digits = escape === "u" ? 4 : escape === "U" ? 8 : 0;
    if (!digits) return null;
    const hex = source.slice(index + 1, index + 1 + digits);
    if (!new RegExp(`^[0-9A-Fa-f]{${digits}}$`, "u").test(hex)) return null;
    const codePoint = Number.parseInt(hex, 16);
    if (codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return null;
    result += String.fromCodePoint(codePoint);
    index += digits;
  }
  return result;
}

function tomlStateAfterLine(line, initialState = {}) {
  let multiline = initialState.multiline || null;
  let arrayDepth = initialState.arrayDepth || 0;
  let basic = false;
  let literal = false;
  for (let index = 0; index < line.length; index++) {
    const triple = line.slice(index, index + 3);
    if (multiline === "basic") {
      if (triple === '"""' && !escapedAt(line, index)) {
        multiline = null;
        index += 2;
      }
      continue;
    }
    if (multiline === "literal") {
      if (triple === "'''") {
        multiline = null;
        index += 2;
      }
      continue;
    }
    if (!basic && !literal && line[index] === "#") break;
    if (!basic && !literal && triple === '"""' && !escapedAt(line, index)) {
      multiline = "basic";
      index += 2;
      continue;
    }
    if (!basic && !literal && triple === "'''") {
      multiline = "literal";
      index += 2;
      continue;
    }
    if (!literal && line[index] === '"' && !escapedAt(line, index)) basic = !basic;
    else if (!basic && line[index] === "'") literal = !literal;
    else if (!basic && !literal && line[index] === "[") arrayDepth++;
    else if (!basic && !literal && line[index] === "]") {
      if (arrayDepth === 0) throw new Error("Cannot safely update a config with an unsupported TOML array boundary.");
      arrayDepth--;
    }
  }
  return { multiline, arrayDepth };
}

function firstTopLevelTableIndex(content) {
  let offset = 0;
  let state = { multiline: null, arrayDepth: 0 };
  for (const segment of content.match(/[^\n]*(?:\n|$)/g) || []) {
    if (!segment) continue;
    const line = segment.replace(/\r?\n$/u, "");
    if (state.multiline === null && state.arrayDepth === 0) {
      if (/^[ \t]*(?:\[[^\]\r\n]+\]|\[\[[^\]\r\n]+\]\])[ \t]*(?:#.*)?$/u.test(line)) return offset;
      if (/^[ \t]*\[.*\][ \t]*(?:#.*)?$/u.test(line)) {
        throw new Error("Cannot safely update a config with an unsupported TOML table header.");
      }
    }
    state = tomlStateAfterLine(line, state);
    offset += segment.length;
  }
  if (state.multiline !== null || state.arrayDepth !== 0) {
    throw new Error("Cannot safely update a config with an unclosed or unsupported TOML value.");
  }
  return -1;
}

function parseTomlKeyPath(line) {
  const keys = [];
  let index = 0;
  const skipWhitespace = () => {
    while (line[index] === " " || line[index] === "\t") index++;
  };
  skipWhitespace();

  while (index < line.length) {
    let key;
    if (line[index] === '"') {
      const start = index++;
      while (index < line.length) {
        if (line[index] === '"' && !escapedAt(line, index)) {
          index++;
          key = decodeTomlBasicKey(line.slice(start, index));
          break;
        }
        index++;
      }
      if (key === undefined) return null;
    } else if (line[index] === "'") {
      const end = line.indexOf("'", index + 1);
      if (end < 0) return null;
      key = line.slice(index + 1, end);
      index = end + 1;
    } else {
      const match = /^[A-Za-z0-9_-]+/u.exec(line.slice(index));
      if (!match) return null;
      key = match[0];
      index += match[0].length;
    }
    keys.push(key);
    skipWhitespace();
    if (line[index] !== ".") break;
    index++;
    skipWhitespace();
  }

  return line[index] === "=" ? keys : null;
}

function findTopLevelSetting(content, key) {
  const table = firstTopLevelTableIndex(content);
  const boundary = table >= 0 ? table : content.length;
  const head = content.slice(0, boundary);
  const matches = [];
  let offset = 0;
  let state = { multiline: null, arrayDepth: 0 };
  for (const segment of head.match(/[^\n]*(?:\n|$)/g) || []) {
    if (!segment) continue;
    if (state.multiline === null && state.arrayDepth === 0) {
      const keys = parseTomlKeyPath(segment.replace(/\r?\n$/u, ""));
      if (keys?.[0] === key) {
        if (keys.length !== 1) throw new Error(`Conflicting TOML key for managed Codex setting: ${key}`);
        matches.push({ text: segment, index: offset });
      }
    }
    state = tomlStateAfterLine(segment.replace(/\r?\n$/u, ""), state);
    offset += segment.length;
  }
  if (matches.length > 1) throw new Error(`Duplicate top-level Codex setting: ${key}`);
  const match = matches[0];
  if (!match || match.index === undefined) return null;
  const withEnding = match.text;
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
  const doubleQuoted = /^("(?:[^"\\]|\\.)*")[ \t]*(?:#.*)?$/.exec(value);
  if (doubleQuoted) {
    try {
      return { type: "string", value: JSON.parse(doubleQuoted[1]) };
    } catch {
      return null;
    }
  }
  const literalQuoted = /^'([^']*)'[ \t]*(?:#.*)?$/.exec(value);
  if (literalQuoted) return { type: "string", value: literalQuoted[1] };
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

function restoreManagedSetting(content, key, managedValue, previous) {
  const setting = findTopLevelSetting(content, key);
  if (!setting || !settingHasDesiredValue(setting, managedValue)) {
    return { content, changed: false };
  }
  if (!previous?.present && setting.line !== `${key} = ${managedValue}`) {
    return { content, changed: false };
  }

  let restoredLine = previous?.line;
  if (previous?.present && setting.line !== `${key} = ${managedValue}`) {
    const equals = setting.line.indexOf("=");
    const tail = setting.line.slice(equals + 1);
    const token = /^(\s*)("(?:[^"\\]|\\.)*"|'[^']*'|true|false)(\s*(?:#.*)?)$/u.exec(tail);
    const previousSetting = findTopLevelSetting(`${previous.line}\n`, key);
    const previousValue = settingValue(previousSetting);
    if (token && previousValue) {
      const replacement = previousValue.type === "boolean"
        ? previousValue.value
        : token[2].startsWith("'") && !previousValue.value.includes("'")
        ? `'${previousValue.value}'`
        : JSON.stringify(previousValue.value);
      restoredLine = `${setting.line.slice(0, equals + 1)}${token[1]}${replacement}${token[3]}`;
    }
  }
  return {
    content: previous?.present
      ? replaceSetting(content, setting, restoredLine)
      : `${content.slice(0, setting.index)}${content.slice(setting.end)}`,
    changed: true
  };
}

const ORIGINAL_SETTING_TYPES = {
  personality: "string",
  hide_agent_reasoning: "boolean",
  model_verbosity: "string"
};

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validOriginalSetting(key, entry) {
  if (!isPlainObject(entry) || typeof entry.present !== "boolean") return false;
  const keys = Object.keys(entry).sort();
  if (!entry.present) return keys.length === 1 && keys[0] === "present";
  if (keys.length !== 2 || keys[0] !== "line" || keys[1] !== "present" || typeof entry.line !== "string") {
    return false;
  }
  if (/\r|\n/.test(entry.line)) return false;
  try {
    const setting = findTopLevelSetting(`${entry.line}\n`, key);
    if (!setting || setting.index !== 0 || setting.line !== entry.line) return false;
    return settingValue(setting)?.type === ORIGINAL_SETTING_TYPES[key];
  } catch {
    return false;
  }
}

function validNativeMarker(marker) {
  if (marker?.schema !== 1 || !isPlainObject(marker.original)) return false;
  if (Object.keys(marker).sort().join(",") !== "original,schema") return false;
  if (!Object.keys(NATIVE_CODEX_PREFERENCES).every((key) => Object.hasOwn(marker.original, key))) {
    return false;
  }
  return Object.entries(marker.original).every(
    ([key, entry]) => Object.hasOwn(ORIGINAL_SETTING_TYPES, key) && validOriginalSetting(key, entry)
  );
}

export function assertSafeCodexCommunicationPaths(options = {}) {
  const paths = resolvePaths(options);
  for (const path of [paths.agentsPath, paths.codexConfigPath, paths.markerPath, paths.nativeMarkerPath]) {
    requireRegularFileOrAbsent(path);
  }

  const agentsContent = readOptionalText(paths.agentsPath);
  managedBlockBounds(agentsContent);

  const configContent = readOptionalText(paths.codexConfigPath);
  const markerExists = existsSync(paths.nativeMarkerPath);
  const marker = markerExists ? readJson(paths.nativeMarkerPath) : null;
  if (markerExists && !validNativeMarker(marker)) {
    throw new Error(`Cannot safely update invalid rollback marker: ${paths.nativeMarkerPath}`);
  }
  const keys = new Set([
    ...Object.keys(NATIVE_CODEX_PREFERENCES),
    ...Object.keys(marker?.original || {})
  ]);
  for (const key of keys) {
    const setting = findTopLevelSetting(configContent, key);
    if (Object.hasOwn(NATIVE_CODEX_PREFERENCES, key)
      && (!markerExists || !settingHasDesiredValue(setting, NATIVE_CODEX_PREFERENCES[key]))) {
      originalSetting(setting, key);
    }
  }
  return paths;
}

function originalSetting(setting, key) {
  const entry = setting ? { present: true, line: setting.line } : { present: false };
  if (!validOriginalSetting(key, entry)) {
    throw new Error(`Cannot safely preserve unsupported Codex setting: ${key}`);
  }
  return entry;
}

export function ensureNativeCodexPreferences(options = {}) {
  const paths = resolvePaths(options);
  requireRegularFileOrAbsent(paths.codexConfigPath);
  requireRegularFileOrAbsent(paths.nativeMarkerPath);
  const existed = existsSync(paths.codexConfigPath);
  let content = options.existingContent ?? readOptionalText(paths.codexConfigPath);
  const markerExists = existsSync(paths.nativeMarkerPath);
  const existingMarker = readJson(paths.nativeMarkerPath);
  const validOriginal = validNativeMarker(existingMarker);
  if (markerExists && !validOriginal) {
    throw new Error(`Cannot safely update invalid rollback marker: ${paths.nativeMarkerPath}`);
  }
  const original = validOriginal ? { ...existingMarker.original } : {};
  let changed = false;

  for (const [key, managedValue] of Object.entries(RETIRED_NATIVE_CODEX_PREFERENCES)) {
    if (!(key in original)) continue;
    const restored = restoreManagedSetting(content, key, managedValue, original[key]);
    content = restored.content;
    changed ||= restored.changed;
    delete original[key];
  }

  for (const [key, value] of Object.entries(NATIVE_CODEX_PREFERENCES)) {
    const desired = `${key} = ${value}`;
    const setting = findTopLevelSetting(content, key);
    if (markerExists && !settingHasDesiredValue(setting, value)) {
      original[key] = originalSetting(setting, key);
    } else if (!(key in original)) {
      original[key] = originalSetting(setting, key);
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
  requireRegularFileOrAbsent(paths.codexConfigPath);
  requireRegularFileOrAbsent(paths.nativeMarkerPath);
  if (!existsSync(paths.nativeMarkerPath)) return false;
  if (!validNativeMarker(readJson(paths.nativeMarkerPath))) return false;
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
  requireRegularFileOrAbsent(paths.codexConfigPath);
  requireRegularFileOrAbsent(paths.nativeMarkerPath);
  const marker = readJson(paths.nativeMarkerPath);
  if (!validNativeMarker(marker)) {
    return { restored: false, markerPreserved: existsSync(paths.nativeMarkerPath), ...paths };
  }

  let content = readOptionalText(paths.codexConfigPath);
  let changed = false;
  for (const [key, value] of Object.entries({
    ...NATIVE_CODEX_PREFERENCES,
    ...RETIRED_NATIVE_CODEX_PREFERENCES
  })) {
    if (!(key in marker.original)) continue;
    const restored = restoreManagedSetting(content, key, value, marker.original[key]);
    content = restored.content;
    changed ||= restored.changed;
  }

  if (changed) atomicWrite(paths.codexConfigPath, content);
  removeOwnedPath(paths.nativeMarkerPath, { force: true });
  return { restored: changed, ...paths };
}

function writeMarker(paths, source) {
  atomicWrite(paths.markerPath, `${JSON.stringify({ schema: 1, source })}\n`);
}

function writeStyleWithMarker(paths, content) {
  const markerExisted = existsSync(paths.markerPath);
  const previousMarker = markerExisted ? readOptionalText(paths.markerPath) : null;
  const managedMarker = `${JSON.stringify({ schema: 1, source: "managed" })}\n`;
  writeMarker(paths, "managed");
  try {
    atomicWrite(paths.agentsPath, content);
  } catch (error) {
    try {
      requireRegularFileOrAbsent(paths.markerPath);
      if (readOptionalText(paths.markerPath) !== managedMarker) {
        throw new Error("Managed style marker changed before rollback.");
      }
      if (markerExisted) atomicWrite(paths.markerPath, previousMarker);
      else removeOwnedPath(paths.markerPath, { force: true });
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], "Could not write AGENTS.md or safely roll back its marker.");
    }
    throw error;
  }
}

function managedBlockBounds(content) {
  const startCount = content.split(MANAGED_BLOCK_START).length - 1;
  const endCount = content.split(MANAGED_BLOCK_END).length - 1;
  if (startCount !== endCount || startCount > 1) {
    throw new Error("Cannot safely update a malformed Fable-ous block in AGENTS.md.");
  }
  if (startCount === 0) return null;
  const start = content.indexOf(MANAGED_BLOCK_START);
  const end = content.indexOf(MANAGED_BLOCK_END);
  if (end < start) {
    throw new Error("Cannot safely update a malformed Fable-ous block in AGENTS.md.");
  }
  const separatorStart = start - MANAGED_BLOCK_SEPARATOR.length;
  const removalStart = separatorStart >= 0
    && content.slice(separatorStart, start) === MANAGED_BLOCK_SEPARATOR
    ? separatorStart
    : start;
  return { start, end, removalStart };
}

function withoutManagedBlock(content, managed) {
  const { end, removalStart = managed.start } = managed;
  return `${content.slice(0, removalStart)}${content.slice(end + MANAGED_BLOCK_END.length)}`;
}

function legacyWithoutManagedBlock(content, managed) {
  const { end, removalStart = managed.start } = managed;
  const before = content.slice(0, removalStart).trimEnd();
  const after = content.slice(end + MANAGED_BLOCK_END.length).trimStart();
  const next = [before, after].filter(Boolean).join("\n\n");
  return next ? `${next}\n` : "";
}

function removeRedundantLegacyBackup(paths, content) {
  const backupPath = `${paths.agentsPath}.fable-ous.bak`;
  try {
    if (!lstatSync(backupPath).isFile()) return false;
    const managed = managedBlockBounds(content);
    if (!managed || readFileSync(backupPath, "utf8") !== legacyWithoutManagedBlock(content, managed)) return false;
    rmSync(backupPath);
    return true;
  } catch {
    return false;
  }
}

export function ensureCodexStyleLayer(options = {}) {
  const paths = resolvePaths(options);
  requireRegularFileOrAbsent(paths.agentsPath);
  requireRegularFileOrAbsent(paths.markerPath);
  const existed = existsSync(paths.agentsPath);
  const content = options.existingContent ?? readOptionalText(paths.agentsPath);

  const managed = managedBlockBounds(content);
  if (managed) {
    const { start: managedStart, end: managedEnd } = managed;
    const oldBlock = content.slice(managedStart, managedEnd + MANAGED_BLOCK_END.length);
    const changed = oldBlock !== MANAGED_CODEX_CONTRACT;
    const next = changed
      ? `${content.slice(0, managedStart)}${MANAGED_CODEX_CONTRACT}${content.slice(managedEnd + MANAGED_BLOCK_END.length)}`
      : content;
    if (changed || (options.existingContent !== undefined && !existed)) {
      writeStyleWithMarker(paths, next);
    } else {
      writeMarker(paths, "managed");
    }
    removeRedundantLegacyBackup(paths, next);
    return { active: true, changed, source: "managed", ...paths };
  }

  const next = `${content}${MANAGED_BLOCK_SEPARATOR}${MANAGED_CODEX_CONTRACT}`;
  writeStyleWithMarker(paths, next);
  return { active: true, changed: true, source: "managed", ...paths };
}

export function isCodexStyleLayerActive(options = {}) {
  const paths = resolvePaths(options);
  requireRegularFileOrAbsent(paths.agentsPath);
  requireRegularFileOrAbsent(paths.markerPath);
  if (!existsSync(paths.markerPath)) return false;
  const content = readOptionalText(paths.agentsPath);
  const managed = managedBlockBounds(content);
  return Boolean(managed)
    && content.slice(managed.start, managed.end + MANAGED_BLOCK_END.length) === MANAGED_CODEX_CONTRACT;
}

export function removeCodexStyleLayer(options = {}) {
  const paths = resolvePaths(options);
  requireRegularFileOrAbsent(paths.agentsPath);
  requireRegularFileOrAbsent(paths.markerPath);
  const content = readOptionalText(paths.agentsPath);
  const managed = managedBlockBounds(content);
  let removed = false;

  if (managed) {
    atomicWrite(paths.agentsPath, withoutManagedBlock(content, managed));
    removed = true;
  }

  removeOwnedPath(paths.markerPath, { force: true });
  return { removed, ...paths };
}

function snapshotOwnedPath(path) {
  return ownedPathState(path);
}

function ownedPathState(path) {
  requireRegularFileOrAbsent(path);
  if (!existsSync(path)) return { path, existed: false };
  const stat = lstatSync(path);
  return {
    path,
    existed: true,
    content: readFileSync(path),
    mode: stat.mode & 0o7777,
    device: stat.dev,
    inode: stat.ino
  };
}

function sameOwnedPathState(left, right) {
  if (!left || !right || left.existed !== right.existed) return false;
  if (!left.existed) return true;
  return left.device === right.device
    && left.inode === right.inode
    && left.mode === right.mode
    && left.content.equals(right.content);
}

function restoreOwnedSnapshots(snapshots, producedStates, paths) {
  const failures = [];
  let configRollbackConflict = false;
  const configWasProduced = producedStates.has(paths.codexConfigPath);
  for (const snapshot of snapshots) {
    try {
      const current = ownedPathState(snapshot.path);
      const produced = producedStates.get(snapshot.path);
      if (snapshot.path === paths.nativeMarkerPath && configRollbackConflict && configWasProduced) {
        if (current.existed) continue;
        if (snapshot.existed && produced && sameOwnedPathState(current, produced)) {
          atomicWrite(snapshot.path, snapshot.content, snapshot.mode);
          chmodSync(snapshot.path, snapshot.mode);
        }
        continue;
      }
      if (!produced) {
        if (!sameOwnedPathState(current, snapshot)) {
          throw new Error(`Concurrent change preserved during rollback: ${snapshot.path}`);
        }
        continue;
      }
      if (sameOwnedPathState(current, snapshot)) continue;
      if (!sameOwnedPathState(current, produced)) {
        throw new Error(`Concurrent change preserved during rollback: ${snapshot.path}`);
      }
      if (!snapshot.existed) {
        rmSync(snapshot.path, { force: true });
      } else {
        atomicWrite(snapshot.path, snapshot.content, snapshot.mode);
        chmodSync(snapshot.path, snapshot.mode);
      }
    } catch (error) {
      if (snapshot.path === paths.codexConfigPath) configRollbackConflict = true;
      failures.push(error);
    }
  }
  if (failures.length) {
    throw new AggregateError(failures, "Could not restore every Fable-ous owned path.");
  }
}

function runCodexCommunicationTransaction(
  options,
  operation,
  rollbackMessage = "Fable-ous style-off failed and its owned-file rollback was incomplete."
) {
  if (activeOwnedTransaction) throw new Error("Nested Fable-ous communication transactions are not supported.");
  const paths = assertSafeCodexCommunicationPaths(options);
  const snapshots = [
    paths.agentsPath,
    paths.codexConfigPath,
    paths.markerPath,
    paths.nativeMarkerPath
  ].map(snapshotOwnedPath);
  const transaction = {
    producedStates: new Map(),
    expectedStates: new Map(snapshots.map((snapshot) => [snapshot.path, snapshot])),
    assertCurrent(path) {
      const expected = this.expectedStates.get(path);
      if (expected && !sameOwnedPathState(ownedPathState(path), expected)) {
        throw new Error(`Concurrent change detected before writing managed path: ${path}`);
      }
    },
    record(path, state) {
      if (snapshots.some((snapshot) => snapshot.path === path)) {
        const produced = { ...state, path };
        this.producedStates.set(path, produced);
        this.expectedStates.set(path, produced);
      }
    }
  };

  try {
    activeOwnedTransaction = transaction;
    return operation();
  } catch (error) {
    activeOwnedTransaction = null;
    try {
      restoreOwnedSnapshots(snapshots, transaction.producedStates, paths);
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        rollbackMessage
      );
    }
    throw error;
  } finally {
    if (activeOwnedTransaction === transaction) activeOwnedTransaction = null;
  }
}

export function ensureCodexCommunicationLayer(options = {}) {
  return runCodexCommunicationTransaction(options, () => {
    const nativePreferences = ensureNativeCodexPreferences(options);
    const style = ensureCodexStyleLayer(options);
    return { style, nativePreferences };
  }, "Fable-ous install failed and its owned-file rollback was incomplete.");
}

export function removeCodexCommunicationLayer(options = {}) {
  return runCodexCommunicationTransaction(options, () => {
    const nativePreferences = removeNativeCodexPreferences(options);
    if (nativePreferences.markerPreserved) {
      throw new Error("Fable-ous could not safely restore native preferences.");
    }
    const style = removeCodexStyleLayer(options);
    return { style, nativePreferences };
  });
}
