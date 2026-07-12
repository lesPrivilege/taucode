/**
 * Env-var flags surface (design §4) — seven variables, same style as
 * deterministic-compaction's TAUCODE_* config. Default = master switch OFF /
 * official clear_tool_uses_20250919 defaults for everything else.
 *
 * Dual-read: TAUCODE_* is canonical; ECODE_* is accepted when the TAUCODE_
 * key is unset (identity rename taucode→taucode). See docs/env-var-compat.md.
 */

import type { ClearToolUsesConfig } from "./context-pruning.js";

export interface TrcFlags {
  enabled: boolean;
  config: ClearToolUsesConfig;
}

const DEFAULT_TRIGGER_TOKENS = 100_000;
const DEFAULT_KEEP = 3;

export type EnvLike = Record<string, string | undefined>;

/** TAUCODE_* primary; fall back to legacy ECODE_* when primary is unset. */
function envGet(env: EnvLike, tauName: string): string | undefined {
  const primary = env[tauName];
  if (primary !== undefined) return primary;
  if (tauName.startsWith("TAUCODE_")) {
    return env[`ECODE_${tauName.slice("TAUCODE_".length)}`];
  }
  return undefined;
}

function parseNumberOr(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function parseOptionalNumber(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function parseCommaList(raw: string | undefined): string[] | undefined {
  if (raw === undefined) return undefined;
  const items = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return items.length > 0 ? items : undefined;
}

function parseBool(raw: string | undefined): boolean {
  return raw === "1" || raw === "true";
}

function parseClearToolInputs(raw: string | undefined): boolean | string[] {
  if (raw === undefined || raw === "" || raw === "false" || raw === "0") return false;
  if (raw === "true" || raw === "1") return true;
  return parseCommaList(raw) ?? false;
}

export function parseTrcFlags(env: EnvLike): TrcFlags {
  const enabled = parseBool(envGet(env, "TAUCODE_TRC"));

  const triggerValue = parseNumberOr(envGet(env, "TAUCODE_TRC_TRIGGER_TOKENS"), DEFAULT_TRIGGER_TOKENS);
  const keepValue = parseNumberOr(envGet(env, "TAUCODE_TRC_KEEP"), DEFAULT_KEEP);
  const clearAtLeastValue = parseOptionalNumber(envGet(env, "TAUCODE_TRC_CLEAR_AT_LEAST"));
  const excludeTools = parseCommaList(envGet(env, "TAUCODE_TRC_EXCLUDE_TOOLS"));
  const clearToolInputs = parseClearToolInputs(envGet(env, "TAUCODE_TRC_CLEAR_TOOL_INPUTS"));
  const preserveErrorResults = parseBool(envGet(env, "TAUCODE_TRC_PRESERVE_ERRORS"));

  const config: ClearToolUsesConfig = {
    trigger: { type: "input_tokens", value: triggerValue },
    keep: { type: "tool_uses", value: keepValue },
    clearToolInputs,
    preserveErrorResults,
  };
  if (clearAtLeastValue !== undefined) {
    config.clearAtLeast = { type: "input_tokens", value: clearAtLeastValue };
  }
  if (excludeTools !== undefined) {
    config.excludeTools = excludeTools;
  }

  return { enabled, config };
}
