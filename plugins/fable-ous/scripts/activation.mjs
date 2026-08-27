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

export const MANAGED_CODEX_CONTRACT = `${MANAGED_BLOCK_START}
## Fable-ous communication

Lead with the outcome, judgment, or acknowledgement. Use warm, plain language and keep routine answers compact. Give one recommendation and why it matters.

Continue through safe, reversible, in-scope work without routine permission questions. Keep most work in the background; speak during execution only when a finding, risk, blocker, required decision, changed direction, or material proof changes what the user needs to know.

Do not repeat client tool receipts, command counts, file reads, or running-job inventories. Preserve failed verification, uncertainty, risk, missing proof, citations, and authorization boundaries. Exact-output requests apply only when they do not conflict with safety or authorization.
${MANAGED_BLOCK_END}`;

export function isClaudeHost(env = process.env) {
  return Boolean(env.CLAUDE_PLUGIN_ROOT) && !env.PLUGIN_ROOT;
}

export function isFableModel(model = "") {
  return /(?:^|[-_/])fable(?:[-_/]|$)/i.test(String(model));
}

export function decideActivation({ input = {}, env = process.env } = {}) {
  const host = isClaudeHost(env) ? "claude" : "codex";
  if (env.FABLE_OUS_FORCE === "off") {
    return { enabled: false, profile: "off", host, model: "", reason: "forced-off" };
  }

  if (host === "codex") return { enabled: true, profile: "full", host, reason: "codex" };

  const model = String(input.model || env.FABLE_OUS_MODEL || env.ANTHROPIC_MODEL || "").trim();
  if (!model) return { enabled: false, profile: "off", host, model: "", reason: "unknown-model" };

  return {
    enabled: true,
    profile: isFableModel(model) ? "quiet" : "full",
    host,
    model,
    reason: isFableModel(model) ? "native-fable-quiet" : "non-fable-model"
  };
}

function resolvePaths({ agentsPath, configDir, env = process.env } = {}) {
  const resolvedConfigDir = configDir || env.FABLE_OUS_CONFIG_DIR || join(homedir(), ".codex", "fable-ous");
  return {
    agentsPath: agentsPath || env.FABLE_OUS_AGENTS_PATH || join(homedir(), ".codex", "AGENTS.md"),
    configDir: resolvedConfigDir,
    markerPath: join(resolvedConfigDir, "standard.json")
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
    /do not ask[^.\n]*(?:routine|clarifying)|continue[^.\n]*safe[^.\n]*reversible/i,
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

function writeMarker(paths, source) {
  atomicWrite(paths.markerPath, `${JSON.stringify({ schema: 1, source })}\n`);
}

export function ensureCodexStyleLayer(options = {}) {
  const paths = resolvePaths(options);
  const existed = existsSync(paths.agentsPath);
  const content = options.existingContent ?? readText(paths.agentsPath);

  if (hasStrongCodexContract(content) || content.includes(MANAGED_BLOCK_START)) {
    if (options.existingContent !== undefined && !existed) atomicWrite(paths.agentsPath, content);
    const source = content.includes(MANAGED_BLOCK_START) ? "managed" : "existing";
    writeMarker(paths, source);
    return { active: true, changed: false, source, ...paths };
  }

  if (existed) {
    const backupPath = `${paths.agentsPath}.fable-ous.bak`;
    if (!existsSync(backupPath)) copyFileSync(paths.agentsPath, backupPath);
  }

  const prefix = content.trimEnd();
  const next = `${prefix ? `${prefix}\n\n` : ""}${MANAGED_CODEX_CONTRACT}\n`;
  atomicWrite(paths.agentsPath, next);
  writeMarker(paths, "managed");
  return { active: true, changed: true, source: "managed", ...paths };
}

export function isCodexStyleLayerActive(options = {}) {
  const paths = resolvePaths(options);
  if (!existsSync(paths.markerPath)) return false;
  const content = readText(paths.agentsPath);
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
