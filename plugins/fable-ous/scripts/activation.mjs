import {
  chmodSync,
  constants,
  copyFileSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

export const MANAGED_BLOCK_START = "<!-- fable-ous:codex-style:start -->";
export const MANAGED_BLOCK_END = "<!-- fable-ous:codex-style:end -->";
const MANAGED_BLOCK_SEPARATOR = "\n<!-- fable-ous:codex-style:boundary -->\n";
const STYLE_BINDING_PATTERN = /^[0-9a-f]{32}$/u;
const TARGET_BINDING_PATTERN = /^[0-9a-f]{64}$/u;
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

Lead with the outcome in warm, plain language.

Preserve the evidence needed to trust the result, material caveats or missing proof, and the next action when one exists; omit secondary detail and repetition.

This changes presentation only—not work, safety, verification, or completion criteria.
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

function canonicalManagedPath(path) {
  let cursor = resolve(path);
  const absentSegments = [];
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) break;
    absentSegments.unshift(basename(cursor));
    cursor = parent;
  }
  return resolve(realpathSync(cursor), ...absentSegments);
}

function managedTargetBinding(path) {
  return createHash("sha256").update(canonicalManagedPath(path)).digest("hex");
}

function legacyTargetMatchesDefault(paths, targetName, targetPath) {
  const defaultTarget = join(dirname(canonicalManagedPath(paths.configDir)), targetName);
  return canonicalManagedPath(defaultTarget) === canonicalManagedPath(targetPath);
}

function atomicWrite(path, content, mode = 0o600) {
  requireRegularFileOrAbsent(path);
  activeOwnedTransaction?.assertCurrent(path);
  const expected = activeOwnedTransaction?.expectedStates.get(path) || ownedPathState(path);
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
    replaceOwnedPath(path, temporary, expected);
    activeOwnedTransaction?.record(path, produced);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function assertHardLinkSupport(path) {
  const probe = uniqueDisplacedPath(`${path}.link-probe`);
  try {
    linkSync(path, probe);
  } finally {
    rmSync(probe, { force: true });
  }
}

function uniqueDisplacedPath(path) {
  return `${path}.fable-ous-displaced-${process.pid}-${Date.now()}-${randomBytes(8).toString("hex")}`;
}

function restoreDisplacedPath(path, displaced) {
  try {
    linkSync(displaced, path);
    rmSync(displaced, { force: true });
    return path;
  } catch (error) {
    if (error?.code === "EEXIST") return displaced;
    try {
      const originalMode = lstatSync(displaced).mode & 0o7777;
      copyFileSync(displaced, path, constants.COPYFILE_EXCL);
      chmodSync(path, originalMode);
      chmodSync(displaced, 0o600);
      return displaced;
    } catch (copyError) {
      if (copyError?.code === "EEXIST") return displaced;
      throw new AggregateError([error, copyError], `Could not restore displaced managed path: ${path}`);
    }
  }
}

function displacedPathFailure(error, path, displaced, action) {
  try {
    const preservedAt = restoreDisplacedPath(path, displaced);
    return new AggregateError(
      [error],
      `Could not safely ${action} managed path; previous bytes preserved at: ${preservedAt}`
    );
  } catch (restoreError) {
    return new AggregateError(
      [error, restoreError],
      `Could not safely ${action} managed path; recovery bytes remain at: ${displaced}`
    );
  }
}

function replaceOwnedPath(path, preparedPath, expected) {
  if (!expected.existed) {
    try {
      linkSync(preparedPath, path);
      return;
    } catch (error) {
      if (error?.code === "EEXIST") {
        throw new Error(`Concurrent change detected before creating managed path: ${path}`);
      }
      throw error;
    }
  }

  const displaced = uniqueDisplacedPath(path);
  assertHardLinkSupport(path);
  try {
    renameSync(path, displaced);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`Concurrent change detected before replacing managed path: ${path}`);
    }
    throw error;
  }

  const moved = ownedPathState(displaced);
  if (!sameOwnedPathState(moved, expected)) {
    const preservedAt = restoreDisplacedPath(path, displaced);
    throw new Error(`Concurrent change detected before replacing managed path; bytes preserved at: ${preservedAt}`);
  }

  try {
    linkSync(preparedPath, path);
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw displacedPathFailure(
        new Error(`Concurrent change detected while replacing managed path: ${path}`),
        path,
        displaced,
        "replace"
      );
    }
    throw displacedPathFailure(error, path, displaced, "replace");
  }
  chmodSync(displaced, 0o600);
}

function removeOwnedPath(path, options = {}) {
  requireRegularFileOrAbsent(path);
  activeOwnedTransaction?.assertCurrent(path);
  const expected = activeOwnedTransaction?.expectedStates.get(path) || ownedPathState(path);
  if (!expected.existed) {
    activeOwnedTransaction?.record(path, { path, existed: false });
    return;
  }

  const displaced = uniqueDisplacedPath(path);
  assertHardLinkSupport(path);
  try {
    renameSync(path, displaced);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`Concurrent change detected before removing managed path: ${path}`);
    }
    throw error;
  }
  const moved = ownedPathState(displaced);
  if (!sameOwnedPathState(moved, expected)) {
    const preservedAt = restoreDisplacedPath(path, displaced);
    throw new Error(`Concurrent change detected before removing managed path; bytes preserved at: ${preservedAt}`);
  }
  chmodSync(displaced, 0o600);
  activeOwnedTransaction?.record(path, { path, existed: false });
}

function decodeUtf8(content, path) {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(content);
  } catch (error) {
    throw new Error(`Cannot safely read non-UTF-8 file ${path}: ${error?.message || "invalid UTF-8"}`);
  }
}

function readOptionalText(path) {
  try {
    return decodeUtf8(readFileSync(path), path);
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    if (/non-UTF-8/u.test(error?.message || "")) throw error;
    throw new Error(`Cannot safely read ${path}: ${error?.message || "unknown error"}`);
  }
}

function assertBomFreeCodexConfig(content, path) {
  if (content.startsWith("\uFEFF")) {
    throw new Error(`Cannot safely update BOM-bearing Codex config: ${path}`);
  }
  return content;
}

function readOptionalCodexConfig(path) {
  return assertBomFreeCodexConfig(readOptionalText(path), path);
}

function readJson(path) {
  let content;
  try {
    content = readOptionalText(path);
  } catch {
    throw new Error(`Cannot safely read JSON file: ${path}`);
  }
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(content);
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
  let firstTable = -1;
  let state = { multiline: null, arrayDepth: 0 };
  for (const segment of content.match(/[^\n]*(?:\n|$)/g) || []) {
    if (!segment) continue;
    const line = segment.replace(/\r?\n$/u, "");
    if (state.multiline === null && state.arrayDepth === 0) {
      const table = /^[ \t]*\[([^\]\r\n]+)\][ \t]*(?:#.*)?$/u.exec(line)
        || /^[ \t]*\[\[([^\]\r\n]+)\]\][ \t]*(?:#.*)?$/u.exec(line);
      if (table) {
        const keys = parseTomlKeyPath(`${table[1]}=`);
        if (keys?.[0] && Object.hasOwn(NATIVE_CODEX_PREFERENCES, keys[0])) {
          throw new Error(`Conflicting TOML table for managed Codex setting: ${keys[0]}`);
        }
        if (firstTable < 0) firstTable = offset;
      } else if (/^[ \t]*\[.*\][ \t]*(?:#.*)?$/u.test(line)) {
        throw new Error("Cannot safely update a config with an unsupported TOML table header.");
      }
    }
    state = tomlStateAfterLine(line, state);
    offset += segment.length;
  }
  if (state.multiline !== null || state.arrayDepth !== 0) {
    throw new Error("Cannot safely update a config with an unclosed or unsupported TOML value.");
  }
  return firstTable;
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
  if (!isPlainObject(marker) || !isPlainObject(marker.original)) return false;
  if (marker.schema === 1) {
    if (Object.keys(marker).sort().join(",") !== "original,schema") return false;
  } else if (marker.schema === 2) {
    if (!TARGET_BINDING_PATTERN.test(marker.targetBinding)) return false;
    if (Object.keys(marker).sort().join(",") !== "original,schema,targetBinding") return false;
  } else {
    return false;
  }
  if (!Object.keys(NATIVE_CODEX_PREFERENCES).every((key) => Object.hasOwn(marker.original, key))) {
    return false;
  }
  return Object.entries(marker.original).every(
    ([key, entry]) => Object.hasOwn(ORIGINAL_SETTING_TYPES, key) && validOriginalSetting(key, entry)
  );
}

function nativeMarkerOwnsTarget(marker, paths) {
  if (marker.schema === 2) {
    return marker.targetBinding === managedTargetBinding(paths.codexConfigPath);
  }
  return marker.schema === 1
    && legacyTargetMatchesDefault(paths, "config.toml", paths.codexConfigPath);
}

function validStyleMarker(marker) {
  if (!isPlainObject(marker) || marker.source !== "managed") return false;
  if (marker.schema === 1) return Object.keys(marker).sort().join(",") === "schema,source";
  if (marker.schema === 2) {
    return STYLE_BINDING_PATTERN.test(marker.binding)
      && Object.keys(marker).sort().join(",") === "binding,schema,source";
  }
  return marker.schema === 3
    && STYLE_BINDING_PATTERN.test(marker.binding)
    && TARGET_BINDING_PATTERN.test(marker.targetBinding)
    && Object.keys(marker).sort().join(",") === "binding,schema,source,targetBinding";
}

function styleMarkerOwnsTarget(marker, paths) {
  if (marker.schema === 3) {
    return marker.targetBinding === managedTargetBinding(paths.agentsPath);
  }
  return legacyTargetMatchesDefault(paths, "AGENTS.md", paths.agentsPath);
}

function readStyleMarker(paths) {
  if (!existsSync(paths.markerPath)) return null;
  const marker = readJson(paths.markerPath);
  if (!validStyleMarker(marker)) {
    throw new Error(`Cannot safely update invalid style marker: ${paths.markerPath}`);
  }
  if (!styleMarkerOwnsTarget(marker, paths)) {
    throw new Error(`Cannot safely update a style marker bound to another AGENTS.md target: ${paths.markerPath}`);
  }
  return marker;
}

function markdownPositionIsInsideFence(content, position) {
  let fence = null;
  for (const line of content.slice(0, position).split(/\r?\n/u)) {
    const candidate = /^[ \t]{0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
    if (!candidate) continue;
    const marker = candidate[1];
    if (!fence) {
      fence = { character: marker[0], length: marker.length };
      continue;
    }
    if (marker[0] === fence.character
      && marker.length >= fence.length
      && /^[ \t]*$/u.test(candidate[2])) {
      fence = null;
    }
  }
  return Boolean(fence);
}

function styleOwnership(paths, content, managed, options = {}) {
  const marker = readStyleMarker(paths);
  if (!marker) return { owned: false, marker: null };
  if (!options.allowLegacyMarker && marker.schema < 3) {
    throw new Error("Cannot safely remove an unbound legacy style marker; run install once to migrate it first.");
  }
  if (!managed) {
    if (!options.allowOrphanMarker) {
      throw new Error("Cannot safely update a style marker that is not bound to AGENTS.md content.");
    }
    return { owned: true, legacy: marker.schema === 1, marker };
  }
  if (markdownPositionIsInsideFence(content, managed.start)) {
    throw new Error("Cannot safely update a Fable-ous block inside an open Markdown fence.");
  }
  if (marker.schema === 2 || marker.schema === 3) {
    if (managed.binding !== marker.binding) {
      throw new Error("Cannot safely update AGENTS.md because its style ownership binding does not match.");
    }
    return { owned: true, binding: marker.binding, legacy: false, marker };
  }
  const legacyBackup = provableLegacyBackup(paths, content, managed);
  if (!legacyBackup) {
    throw new Error("Cannot safely migrate an unbound legacy Fable-ous marker without its byte-exact AGENTS.md backup.");
  }
  return { owned: true, legacy: true, legacyBackup, marker };
}

export function assertSafeCodexCommunicationPaths(options = {}, safety = {}) {
  const paths = resolvePaths(options);
  const resolvedManagedPaths = [
    paths.agentsPath,
    paths.codexConfigPath,
    paths.markerPath,
    paths.nativeMarkerPath
  ].map(canonicalManagedPath);
  if (new Set(resolvedManagedPaths).size !== resolvedManagedPaths.length) {
    throw new Error("Fable-ous communication files must resolve to distinct managed paths.");
  }
  for (const path of [paths.agentsPath, paths.codexConfigPath, paths.markerPath, paths.nativeMarkerPath]) {
    requireRegularFileOrAbsent(path);
  }
  const existingManagedFiles = [
    paths.agentsPath,
    paths.codexConfigPath,
    paths.markerPath,
    paths.nativeMarkerPath
  ].filter((path) => existsSync(path)).map((path) => ({ path, stat: lstatSync(path) }));
  for (let left = 0; left < existingManagedFiles.length; left++) {
    for (let right = left + 1; right < existingManagedFiles.length; right++) {
      const first = existingManagedFiles[left];
      const second = existingManagedFiles[right];
      if (first.stat.dev === second.stat.dev && first.stat.ino === second.stat.ino) {
        throw new Error(`Fable-ous communication files must not share the same managed inode: ${first.path} and ${second.path}`);
      }
    }
  }

  const agentsContent = readOptionalText(paths.agentsPath);
  const managed = managedBlockBounds(agentsContent);
  const ownership = styleOwnership(paths, agentsContent, managed, {
    allowOrphanMarker: safety.allowOrphanStyleMarker,
    allowLegacyMarker: safety.allowLegacyStyleMarker
  });
  if (!managed
    && !safety.allowOpenFenceWithoutManaged
    && markdownPositionIsInsideFence(agentsContent, agentsContent.length)) {
    throw new Error("Cannot safely install Fable-ous inside an open Markdown fence in AGENTS.md.");
  }
  if (managed && !ownership.owned && !safety.allowUnownedStyleMarkers) {
    throw new Error("Cannot safely update an unowned Fable-ous marker example in AGENTS.md.");
  }

  const configContent = readOptionalCodexConfig(paths.codexConfigPath);
  const markerExists = existsSync(paths.nativeMarkerPath);
  const marker = markerExists ? readJson(paths.nativeMarkerPath) : null;
  if (markerExists && (
    !validNativeMarker(marker)
    || !nativeMarkerOwnsTarget(marker, paths)
    || (marker.schema === 1 && !safety.allowLegacyNativeMarker)
  )) {
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
  let content = options.existingContent ?? readOptionalCodexConfig(paths.codexConfigPath);
  content = assertBomFreeCodexConfig(content, paths.codexConfigPath);
  const markerExists = existsSync(paths.nativeMarkerPath);
  const existingMarker = readJson(paths.nativeMarkerPath);
  const validMarker = validNativeMarker(existingMarker);
  if (markerExists && !validMarker) {
    throw new Error(`Cannot safely update invalid rollback marker: ${paths.nativeMarkerPath}`);
  }
  if (existingMarker?.schema === 1 && options.allowLegacyMigration !== true) {
    throw new Error("Cannot safely migrate an unbound legacy native-preferences marker without explicit --migrate-legacy authorization.");
  }
  const validOriginal = validMarker && nativeMarkerOwnsTarget(existingMarker, paths);
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

  atomicWrite(paths.nativeMarkerPath, `${JSON.stringify({
    schema: 2,
    targetBinding: managedTargetBinding(paths.codexConfigPath),
    original
  })}\n`);
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
  const marker = readJson(paths.nativeMarkerPath);
  if (!validNativeMarker(marker) || marker.schema !== 2 || !nativeMarkerOwnsTarget(marker, paths)) return false;
  const content = readOptionalCodexConfig(paths.codexConfigPath);
  return Object.entries(NATIVE_CODEX_PREFERENCES).every(([key, value]) => {
    const setting = findTopLevelSetting(content, key);
    return settingHasDesiredValue(setting, value);
  });
}

export function nativeCodexPreferenceValues(options = {}) {
  const paths = resolvePaths(options);
  const content = readOptionalCodexConfig(paths.codexConfigPath);
  return Object.fromEntries(Object.keys(NATIVE_CODEX_PREFERENCES).map((key) => {
    const parsed = settingValue(findTopLevelSetting(content, key));
    return [key, parsed?.value ?? "unset"];
  }));
}

export function removeNativeCodexPreferences(options = {}, safety = {}) {
  const paths = resolvePaths(options);
  requireRegularFileOrAbsent(paths.codexConfigPath);
  requireRegularFileOrAbsent(paths.nativeMarkerPath);
  const marker = readJson(paths.nativeMarkerPath);
  if (!validNativeMarker(marker)
    || !nativeMarkerOwnsTarget(marker, paths)
    || (marker.schema === 1 && !safety.allowLegacyMarker)) {
    const content = readOptionalCodexConfig(paths.codexConfigPath);
    const incomplete = Object.entries(NATIVE_CODEX_PREFERENCES).some(([key, value]) => {
      const setting = findTopLevelSetting(content, key);
      return settingHasDesiredValue(setting, value);
    });
    return {
      restored: false,
      markerPreserved: existsSync(paths.nativeMarkerPath),
      incomplete,
      ...paths
    };
  }

  let content = readOptionalCodexConfig(paths.codexConfigPath);
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

function boundBlockSeparator(binding) {
  return `\n<!-- fable-ous:codex-style:boundary:${binding} -->\n`;
}

function writeMarker(paths, marker) {
  atomicWrite(paths.markerPath, `${JSON.stringify(marker)}\n`);
}

function writeStyleWithMarker(paths, content, marker) {
  const markerExisted = existsSync(paths.markerPath);
  const previousMarker = markerExisted ? readOptionalText(paths.markerPath) : null;
  const managedMarker = `${JSON.stringify(marker)}\n`;
  writeMarker(paths, marker);
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
  const legacyStart = start - MANAGED_BLOCK_SEPARATOR.length;
  if (legacyStart >= 0 && content.slice(legacyStart, start) === MANAGED_BLOCK_SEPARATOR) {
    return { start, end, removalStart: legacyStart, boundary: "legacy", binding: null };
  }
  const before = content.slice(0, start);
  const bound = /\n<!-- fable-ous:codex-style:boundary:([0-9a-f]{32}) -->\n$/u.exec(before);
  return bound
    ? { start, end, removalStart: start - bound[0].length, boundary: "bound", binding: bound[1] }
    : { start, end, removalStart: start, boundary: null, binding: null };
}

function withoutManagedBlock(content, managed) {
  const { end, removalStart = managed.start } = managed;
  return `${content.slice(0, removalStart)}${content.slice(end + MANAGED_BLOCK_END.length)}`;
}

function provableLegacyBackup(paths, content, managed) {
  const backupPath = `${paths.agentsPath}.fable-ous.bak`;
  try {
    const stat = lstatSync(backupPath);
    if (!stat.isFile() || stat.isSymbolicLink()) return null;
    const bytes = readFileSync(backupPath);
    const original = decodeUtf8(bytes, backupPath);
    const block = content.slice(managed.start, managed.end + MANAGED_BLOCK_END.length);
    return content === `${original.trimEnd()}\n\n${block}\n` ? bytes : null;
  } catch {
    return null;
  }
}

export function ensureCodexStyleLayer(options = {}) {
  const paths = resolvePaths(options);
  requireRegularFileOrAbsent(paths.agentsPath);
  requireRegularFileOrAbsent(paths.markerPath);
  const existed = existsSync(paths.agentsPath);
  const content = options.existingContent ?? readOptionalText(paths.agentsPath);

  const managed = managedBlockBounds(content);
  const ownership = styleOwnership(paths, content, managed, {
    allowLegacyMarker: options.allowLegacyMigration === true
  });
  if (managed && !ownership.owned) {
    throw new Error("Cannot safely update an unowned Fable-ous marker example in AGENTS.md.");
  }
  if (!managed && markdownPositionIsInsideFence(content, content.length)) {
    throw new Error("Cannot safely install Fable-ous inside an open Markdown fence in AGENTS.md.");
  }
  const binding = ownership.binding || randomBytes(16).toString("hex");
  const marker = {
    schema: 3,
    source: "managed",
    binding,
    targetBinding: managedTargetBinding(paths.agentsPath)
  };
  if (managed) {
    const { start: managedStart, end: managedEnd } = managed;
    const oldBlock = content.slice(managedStart, managedEnd + MANAGED_BLOCK_END.length);
    let next = content;
    if (ownership.legacyBackup) {
      const original = decodeUtf8(ownership.legacyBackup, `${paths.agentsPath}.fable-ous.bak`);
      next = `${original}${boundBlockSeparator(binding)}${MANAGED_CODEX_CONTRACT}`;
    } else if (ownership.legacy) {
      next = `${content.slice(0, managed.removalStart)}${boundBlockSeparator(binding)}${MANAGED_CODEX_CONTRACT}${content.slice(managedEnd + MANAGED_BLOCK_END.length)}`;
    } else if (oldBlock !== MANAGED_CODEX_CONTRACT) {
      next = `${content.slice(0, managedStart)}${MANAGED_CODEX_CONTRACT}${content.slice(managedEnd + MANAGED_BLOCK_END.length)}`;
    }
    const changed = next !== content || ownership.legacy;
    if (changed || (options.existingContent !== undefined && !existed)) {
      writeStyleWithMarker(paths, next, marker);
    } else {
      writeMarker(paths, marker);
    }
    return { active: true, changed, source: "managed", ...paths };
  }

  const next = `${content}${boundBlockSeparator(binding)}${MANAGED_CODEX_CONTRACT}`;
  writeStyleWithMarker(paths, next, marker);
  return { active: true, changed: true, source: "managed", ...paths };
}

export function isCodexStyleLayerActive(options = {}) {
  const paths = resolvePaths(options);
  requireRegularFileOrAbsent(paths.agentsPath);
  requireRegularFileOrAbsent(paths.markerPath);
  const content = readOptionalText(paths.agentsPath);
  const managed = managedBlockBounds(content);
  const ownership = styleOwnership(paths, content, managed, { allowLegacyMarker: true });
  return Boolean(managed)
    && ownership.owned
    && !ownership.legacy
    && content.slice(managed.start, managed.end + MANAGED_BLOCK_END.length) === MANAGED_CODEX_CONTRACT;
}

export function removeCodexStyleLayer(options = {}) {
  const paths = resolvePaths(options);
  requireRegularFileOrAbsent(paths.agentsPath);
  requireRegularFileOrAbsent(paths.markerPath);
  const content = readOptionalText(paths.agentsPath);
  const managed = managedBlockBounds(content);
  const ownership = styleOwnership(paths, content, managed, { allowOrphanMarker: true });
  if (!ownership.owned) return { removed: false, ...paths };
  let removed = false;

  if (managed) {
    const legacyBackup = ownership.legacyBackup;
    atomicWrite(paths.agentsPath, legacyBackup || withoutManagedBlock(content, managed));
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
        removeOwnedPath(snapshot.path, { force: true });
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
  rollbackMessage = "Fable-ous style-off failed and its owned-file rollback was incomplete.",
  safety = {}
) {
  if (activeOwnedTransaction) throw new Error("Nested Fable-ous communication transactions are not supported.");
  const paths = assertSafeCodexCommunicationPaths(options, safety);
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
    },
    assertAllCurrent() {
      for (const [path, expected] of this.expectedStates) {
        if (!sameOwnedPathState(ownedPathState(path), expected)) {
          throw new Error(`Concurrent change detected before completing managed transaction: ${path}`);
        }
      }
    }
  };

  try {
    activeOwnedTransaction = transaction;
    const result = operation();
    transaction.assertAllCurrent();
    return result;
  } catch (error) {
    activeOwnedTransaction = null;
    try {
      restoreOwnedSnapshots(snapshots, transaction.producedStates, paths);
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        `${rollbackMessage} Cause: ${error?.message || "managed filesystem transaction failed"}`
      );
    }
    throw error;
  } finally {
    if (activeOwnedTransaction === transaction) activeOwnedTransaction = null;
  }
}

export function ensureCodexCommunicationLayer(options = {}) {
  const allowLegacyMigration = options.allowLegacyMigration === true;
  return runCodexCommunicationTransaction(options, () => {
    const nativePreferences = ensureNativeCodexPreferences(options);
    const style = ensureCodexStyleLayer(options);
    return { style, nativePreferences };
  }, "Fable-ous install failed and its owned-file rollback was incomplete.", {
    allowLegacyNativeMarker: allowLegacyMigration,
    allowLegacyStyleMarker: allowLegacyMigration
  });
}

export function removeCodexCommunicationLayer(options = {}) {
  return runCodexCommunicationTransaction(options, () => {
    const nativePreferences = removeNativeCodexPreferences(options);
    if (nativePreferences.markerPreserved || nativePreferences.incomplete) {
      throw new Error("Fable-ous could not safely restore native preferences because rollback evidence is missing or invalid.");
    }
    const style = removeCodexStyleLayer(options);
    return { style, nativePreferences };
  }, "Fable-ous style-off failed and its owned-file rollback was incomplete.", {
    allowOrphanStyleMarker: true,
    allowOpenFenceWithoutManaged: true
  });
}
