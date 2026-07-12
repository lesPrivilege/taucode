import { describe, it, expect } from "vitest";
import { parseTrcFlags } from "../src/flags.js";

describe("parseTrcFlags (design §4 — seven env vars, default OFF / official defaults)", () => {
  it("defaults: everything unset -> disabled, official trigger/keep defaults, no clearAtLeast/excludeTools, clearToolInputs=false, preserveErrorResults=false", () => {
    const flags = parseTrcFlags({});
    expect(flags.enabled).toBe(false);
    expect(flags.config).toEqual({
      trigger: { type: "input_tokens", value: 100_000 },
      keep: { type: "tool_uses", value: 3 },
      clearToolInputs: false,
      preserveErrorResults: false,
    });
    expect(flags.config.clearAtLeast).toBeUndefined();
    expect(flags.config.excludeTools).toBeUndefined();
    expect("clearAtLeast" in flags.config).toBe(false);
    expect("excludeTools" in flags.config).toBe(false);
  });

  it("TAUCODE_TRC master switch: only '1' or 'true' enable", () => {
    expect(parseTrcFlags({ TAUCODE_TRC: "1" }).enabled).toBe(true);
    expect(parseTrcFlags({ TAUCODE_TRC: "true" }).enabled).toBe(true);
    expect(parseTrcFlags({ TAUCODE_TRC: "0" }).enabled).toBe(false);
    expect(parseTrcFlags({ TAUCODE_TRC: "false" }).enabled).toBe(false);
    expect(parseTrcFlags({ TAUCODE_TRC: "yes" }).enabled).toBe(false);
    expect(parseTrcFlags({}).enabled).toBe(false);
  });

  it("TAUCODE_TRC_TRIGGER_TOKENS overrides trigger.value", () => {
    expect(parseTrcFlags({ TAUCODE_TRC_TRIGGER_TOKENS: "50000" }).config.trigger).toEqual({
      type: "input_tokens",
      value: 50_000,
    });
  });

  it("TAUCODE_TRC_KEEP overrides keep.value", () => {
    expect(parseTrcFlags({ TAUCODE_TRC_KEEP: "5" }).config.keep).toEqual({ type: "tool_uses", value: 5 });
  });

  it("TAUCODE_TRC_CLEAR_AT_LEAST sets clearAtLeast when present, omits the key when absent", () => {
    expect(parseTrcFlags({ TAUCODE_TRC_CLEAR_AT_LEAST: "2000" }).config.clearAtLeast).toEqual({
      type: "input_tokens",
      value: 2000,
    });
    expect("clearAtLeast" in parseTrcFlags({}).config).toBe(false);
  });

  it("TAUCODE_TRC_EXCLUDE_TOOLS splits on commas, trims, drops empties", () => {
    expect(parseTrcFlags({ TAUCODE_TRC_EXCLUDE_TOOLS: "a,b, c ,,d" }).config.excludeTools).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
    expect("excludeTools" in parseTrcFlags({ TAUCODE_TRC_EXCLUDE_TOOLS: "" }).config).toBe(false);
  });

  it("TAUCODE_TRC_CLEAR_TOOL_INPUTS tri-state: unset/false/0 -> false, true/1 -> true, else -> comma list", () => {
    expect(parseTrcFlags({}).config.clearToolInputs).toBe(false);
    expect(parseTrcFlags({ TAUCODE_TRC_CLEAR_TOOL_INPUTS: "false" }).config.clearToolInputs).toBe(false);
    expect(parseTrcFlags({ TAUCODE_TRC_CLEAR_TOOL_INPUTS: "0" }).config.clearToolInputs).toBe(false);
    expect(parseTrcFlags({ TAUCODE_TRC_CLEAR_TOOL_INPUTS: "true" }).config.clearToolInputs).toBe(true);
    expect(parseTrcFlags({ TAUCODE_TRC_CLEAR_TOOL_INPUTS: "1" }).config.clearToolInputs).toBe(true);
    expect(parseTrcFlags({ TAUCODE_TRC_CLEAR_TOOL_INPUTS: "read,write" }).config.clearToolInputs).toEqual([
      "read",
      "write",
    ]);
  });

  it("TAUCODE_TRC_PRESERVE_ERRORS: '1'/'true' -> true, else -> false", () => {
    expect(parseTrcFlags({ TAUCODE_TRC_PRESERVE_ERRORS: "1" }).config.preserveErrorResults).toBe(true);
    expect(parseTrcFlags({ TAUCODE_TRC_PRESERVE_ERRORS: "true" }).config.preserveErrorResults).toBe(true);
    expect(parseTrcFlags({ TAUCODE_TRC_PRESERVE_ERRORS: "0" }).config.preserveErrorResults).toBe(false);
    expect(parseTrcFlags({}).config.preserveErrorResults).toBe(false);
  });

  it("non-numeric numeric env values fall back to defaults rather than producing NaN", () => {
    expect(parseTrcFlags({ TAUCODE_TRC_TRIGGER_TOKENS: "not-a-number" }).config.trigger.value).toBe(100_000);
    expect(parseTrcFlags({ TAUCODE_TRC_KEEP: "not-a-number" }).config.keep.value).toBe(3);
    expect("clearAtLeast" in parseTrcFlags({ TAUCODE_TRC_CLEAR_AT_LEAST: "not-a-number" }).config).toBe(false);
  });

  it("legacy ECODE_* is dual-read when TAUCODE_* is unset", () => {
    expect(parseTrcFlags({ ECODE_TRC: "1" }).enabled).toBe(true);
    expect(parseTrcFlags({ ECODE_TRC_TRIGGER_TOKENS: "50000" }).config.trigger).toEqual({
      type: "input_tokens",
      value: 50000,
    });
  });

  it("TAUCODE_* wins over legacy ECODE_* when both are set", () => {
    expect(
      parseTrcFlags({ TAUCODE_TRC: "0", ECODE_TRC: "1" }).enabled,
    ).toBe(false);
    expect(
      parseTrcFlags({ TAUCODE_TRC_KEEP: "9", ECODE_TRC_KEEP: "2" }).config.keep.value,
    ).toBe(9);
  });
});
