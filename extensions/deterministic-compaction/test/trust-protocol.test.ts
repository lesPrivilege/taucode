import { describe, it, expect, afterEach } from "vitest";
import { resolveConfig } from "../src/extension.ts";

// V2-TP baseline discipline: the trust protocol is entirely behind
// TAUCODE_TRUST_PROTOCOL, which MUST default off (packet 禁区: "flag 默认值不得为 on").
describe("TAUCODE_TRUST_PROTOCOL flag", () => {
	const orig = process.env.TAUCODE_TRUST_PROTOCOL;
	afterEach(() => {
		if (orig === undefined) delete process.env.TAUCODE_TRUST_PROTOCOL;
		else process.env.TAUCODE_TRUST_PROTOCOL = orig;
	});

	it("defaults OFF when the env var is unset", () => {
		delete process.env.TAUCODE_TRUST_PROTOCOL;
		expect(resolveConfig().trustProtocolEnabled).toBe(false);
	});

	it("turns ON with TAUCODE_TRUST_PROTOCOL=1", () => {
		process.env.TAUCODE_TRUST_PROTOCOL = "1";
		expect(resolveConfig().trustProtocolEnabled).toBe(true);
	});
});

describe("TAUCODE_WS_DECLARATION flag", () => {
	const orig = process.env.TAUCODE_WS_DECLARATION;
	afterEach(() => {
		if (orig === undefined) delete process.env.TAUCODE_WS_DECLARATION;
		else process.env.TAUCODE_WS_DECLARATION = orig;
	});

	it("defaults OFF when the env var is unset", () => {
		delete process.env.TAUCODE_WS_DECLARATION;
		expect(resolveConfig().workSemanticsDeclarationEnabled).toBe(false);
	});

	it("turns ON with TAUCODE_WS_DECLARATION=1", () => {
		process.env.TAUCODE_WS_DECLARATION = "1";
		expect(resolveConfig().workSemanticsDeclarationEnabled).toBe(true);
	});
});

describe("TAUCODE_SIDEBAND_SUMMARY flag", () => {
	const origFlag = process.env.TAUCODE_SIDEBAND_SUMMARY;
	const origMin = process.env.TAUCODE_SIDEBAND_MIN_TOKENS;
	const origModel = process.env.TAUCODE_SIDEBAND_MODEL;
	afterEach(() => {
		if (origFlag === undefined) delete process.env.TAUCODE_SIDEBAND_SUMMARY;
		else process.env.TAUCODE_SIDEBAND_SUMMARY = origFlag;
		if (origMin === undefined) delete process.env.TAUCODE_SIDEBAND_MIN_TOKENS;
		else process.env.TAUCODE_SIDEBAND_MIN_TOKENS = origMin;
		if (origModel === undefined) delete process.env.TAUCODE_SIDEBAND_MODEL;
		else process.env.TAUCODE_SIDEBAND_MODEL = origModel;
	});

	it("defaults OFF with a local min-token gate", () => {
		delete process.env.TAUCODE_SIDEBAND_SUMMARY;
		delete process.env.TAUCODE_SIDEBAND_MIN_TOKENS;
		delete process.env.TAUCODE_SIDEBAND_MODEL;
		const config = resolveConfig();
		expect(config.sidebandSummaryEnabled).toBe(false);
		expect(config.sidebandSummaryMinTokens).toBe(2000);
		expect(config.sidebandSummaryModel).toBe("sideband-summary");
	});

	it("turns ON and parses local gate/model env vars", () => {
		process.env.TAUCODE_SIDEBAND_SUMMARY = "1";
		process.env.TAUCODE_SIDEBAND_MIN_TOKENS = "1234";
		process.env.TAUCODE_SIDEBAND_MODEL = "cheap";
		const config = resolveConfig();
		expect(config.sidebandSummaryEnabled).toBe(true);
		expect(config.sidebandSummaryMinTokens).toBe(1234);
		expect(config.sidebandSummaryModel).toBe("cheap");
	});
});

describe("TAUCODE_LEDGER_PERSIST flag", () => {
	const orig = process.env.TAUCODE_LEDGER_PERSIST;
	afterEach(() => {
		if (orig === undefined) delete process.env.TAUCODE_LEDGER_PERSIST;
		else process.env.TAUCODE_LEDGER_PERSIST = orig;
	});

	it("defaults OFF when unset", () => {
		delete process.env.TAUCODE_LEDGER_PERSIST;
		expect(resolveConfig().ledgerPersistEnabled).toBe(false);
	});

	it("turns ON with TAUCODE_LEDGER_PERSIST=1", () => {
		process.env.TAUCODE_LEDGER_PERSIST = "1";
		expect(resolveConfig().ledgerPersistEnabled).toBe(true);
	});
});

describe("TAUCODE_WS_DECLARE_NUDGE flag", () => {
	const orig = process.env.TAUCODE_WS_DECLARE_NUDGE;
	afterEach(() => {
		if (orig === undefined) delete process.env.TAUCODE_WS_DECLARE_NUDGE;
		else process.env.TAUCODE_WS_DECLARE_NUDGE = orig;
	});

	it("defaults off", () => {
		delete process.env.TAUCODE_WS_DECLARE_NUDGE;
		expect(resolveConfig().workSemanticsDeclareNudge).toBe("off");
	});

	it("accepts every-turn only", () => {
		process.env.TAUCODE_WS_DECLARE_NUDGE = "every-turn";
		expect(resolveConfig().workSemanticsDeclareNudge).toBe("every-turn");
		process.env.TAUCODE_WS_DECLARE_NUDGE = "other";
		expect(resolveConfig().workSemanticsDeclareNudge).toBe("off");
	});
});

describe("TAUCODE_WS_POLICY flag", () => {
	const origFlag = process.env.TAUCODE_WS_POLICY;
	const origWindow = process.env.TAUCODE_WS_VERBATIM_WINDOW;

	afterEach(() => {
		if (origFlag === undefined) delete process.env.TAUCODE_WS_POLICY;
		else process.env.TAUCODE_WS_POLICY = origFlag;
		if (origWindow === undefined) delete process.env.TAUCODE_WS_VERBATIM_WINDOW;
		else process.env.TAUCODE_WS_VERBATIM_WINDOW = origWindow;
	});

	it("defaults off with the standard verbatim window", () => {
		delete process.env.TAUCODE_WS_POLICY;
		delete process.env.TAUCODE_WS_VERBATIM_WINDOW;
		const config = resolveConfig();
		expect(config.workSemanticsPolicyEnabled).toBe(false);
		expect(config.workSemanticsVerbatimWindow).toBe(8);
	});

	it("turns on with an explicit window", () => {
		process.env.TAUCODE_WS_POLICY = "1";
		process.env.TAUCODE_WS_VERBATIM_WINDOW = "13";
		const config = resolveConfig();
		expect(config.workSemanticsPolicyEnabled).toBe(true);
		expect(config.workSemanticsVerbatimWindow).toBe(13);
	});
});

describe("TAUCODE_WS_PLACEBO flag", () => {
	const origFlag = process.env.TAUCODE_WS_PLACEBO;
	const origTokens = process.env.TAUCODE_WS_PLACEBO_TOKENS;

	afterEach(() => {
		if (origFlag === undefined) delete process.env.TAUCODE_WS_PLACEBO;
		else process.env.TAUCODE_WS_PLACEBO = origFlag;
		if (origTokens === undefined) delete process.env.TAUCODE_WS_PLACEBO_TOKENS;
		else process.env.TAUCODE_WS_PLACEBO_TOKENS = origTokens;
	});

	it("defaults off with the standard target", () => {
		delete process.env.TAUCODE_WS_PLACEBO;
		delete process.env.TAUCODE_WS_PLACEBO_TOKENS;
		const config = resolveConfig();
		expect(config.placeboTailEnabled).toBe(false);
		expect(config.placeboTailTargetTokens).toBe(120);
	});

	it("turns on with an explicit token target", () => {
		process.env.TAUCODE_WS_PLACEBO = "1";
		process.env.TAUCODE_WS_PLACEBO_TOKENS = "64";
		const config = resolveConfig();
		expect(config.placeboTailEnabled).toBe(true);
		expect(config.placeboTailTargetTokens).toBe(64);
	});
});

describe("TAUCODE_WS_NUDGE flag", () => {
	const origFlag = process.env.TAUCODE_WS_NUDGE;

	afterEach(() => {
		if (origFlag === undefined) delete process.env.TAUCODE_WS_NUDGE;
		else process.env.TAUCODE_WS_NUDGE = origFlag;
	});

	it("defaults off", () => {
		delete process.env.TAUCODE_WS_NUDGE;
		expect(resolveConfig().compactNudgeTailEnabled).toBe(false);
	});

	it("turns on explicitly", () => {
		process.env.TAUCODE_WS_NUDGE = "1";
		expect(resolveConfig().compactNudgeTailEnabled).toBe(true);
	});
});
