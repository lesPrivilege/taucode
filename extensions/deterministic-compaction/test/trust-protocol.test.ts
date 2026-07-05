import { describe, it, expect, afterEach } from "vitest";
import { resolveConfig } from "../src/extension.ts";

// V2-TP baseline discipline: the trust protocol is entirely behind
// ECODE_TRUST_PROTOCOL, which MUST default off (packet 禁区: "flag 默认值不得为 on").
describe("ECODE_TRUST_PROTOCOL flag", () => {
	const orig = process.env.ECODE_TRUST_PROTOCOL;
	afterEach(() => {
		if (orig === undefined) delete process.env.ECODE_TRUST_PROTOCOL;
		else process.env.ECODE_TRUST_PROTOCOL = orig;
	});

	it("defaults OFF when the env var is unset", () => {
		delete process.env.ECODE_TRUST_PROTOCOL;
		expect(resolveConfig().trustProtocolEnabled).toBe(false);
	});

	it("turns ON with ECODE_TRUST_PROTOCOL=1", () => {
		process.env.ECODE_TRUST_PROTOCOL = "1";
		expect(resolveConfig().trustProtocolEnabled).toBe(true);
	});
});
