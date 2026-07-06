import { describe, expect, it } from "vitest";
import {
	NUDGE_TAIL_CONTENT,
	buildPlaceboText,
	compactNudgeTailMessage,
	estimatePlaceboTokens,
	placeboTailMessage,
	placeboTokenCount,
} from "../src/placebo-tail.ts";

describe("EXP-WS placebo tail", () => {
	it("builds fixed reminder text at or above the requested token target", () => {
		const text = buildPlaceboText(64);
		expect(estimatePlaceboTokens(text)).toBeGreaterThanOrEqual(64);
		expect(text).toContain("Maintain a concise working checklist");
	});

	it("reports the actual tail token count for dry-run balancing", () => {
		const message = placeboTailMessage(32);
		expect(message.role).toBe("system");
		expect(message.content).toContain("[placebo-reminder]");
		expect(placeboTokenCount(32)).toBe(estimatePlaceboTokens(message.content));
	});

	it("renders the Branch C compact nudge byte-for-byte", () => {
		expect(NUDGE_TAIL_CONTENT).toBe("[nudge]\nGoal; verify files; finish.");
		expect(estimatePlaceboTokens(NUDGE_TAIL_CONTENT)).toBeLessThanOrEqual(10);
		expect(compactNudgeTailMessage()).toEqual({
			role: "system",
			content: NUDGE_TAIL_CONTENT,
			timestamp: 0,
		});
	});
});
