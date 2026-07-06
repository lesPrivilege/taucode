import { describe, expect, it } from "vitest";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { SemanticLedger } from "../src/semantic-ledger.ts";
import {
	scheduleSidebandSummaries,
	summaryId,
	type SidebandSummarizer,
} from "../src/sideband-summary.ts";
import { hashContent } from "../src/trust-ledger.ts";

function readResult(toolCallId: string, text: string): AgentMessage {
	return {
		role: "toolResult",
		toolName: "read",
		toolCallId,
		content: [{ type: "text", text }],
		isError: false,
		timestamp: 0,
	} as AgentMessage;
}

describe("scheduleSidebandSummaries", () => {
	it("schedules async read summaries and records provider-token cost", async () => {
		const ledger = new SemanticLedger();
		const body = "export const route = 1;\n".repeat(20);
		const summarize: SidebandSummarizer = async (input) => ({
			text: `Summary for ${input.path} at ${input.hash}`,
			providerCost: { model: input.model, inputTokens: 120, outputTokens: 20 },
		});

		const result = scheduleSidebandSummaries({
			messages: [readResult("read-1", body)],
			diffs: [
				{
					messageId: "m1",
					messageIndex: 0,
					turn: 1,
					role: "tool",
					kind: "tool_result",
					toolName: "read",
					toolCallId: "read-1",
					path: "src/a.ts",
					rawTokens: 2500,
					compactedTokens: 100,
					tokensSaved: 2400,
				},
			],
			ledger,
			turn: 4,
			minTokens: 2000,
			model: "mock-sideband",
			summarize,
		});

		expect(result).toEqual({ scheduled: 1 });
		await new Promise((resolve) => setTimeout(resolve, 0));
		const hash = hashContent(body);
		const text = `Summary for src/a.ts at ${hash}`;
		expect(ledger.summariesFor("src/a.ts", hash)).toEqual([
			{
				kind: "summary",
				id: summaryId({ path: "src/a.ts", hash, text, sourceHashes: [hash], model: "mock-sideband" }),
				path: "src/a.ts",
				hash,
				text,
				sourceHashes: [hash],
				turn: 4,
				author: "sideband",
				providerCost: { model: "mock-sideband", inputTokens: 120, outputTokens: 20 },
			},
		]);
	});

	it("does nothing below the local min-token gate or without a summarizer", () => {
		const ledger = new SemanticLedger();
		const body = "small\n";
		const base = {
			messages: [readResult("read-1", body)],
			diffs: [
				{
					messageId: "m1",
					messageIndex: 0,
					turn: 1,
					role: "tool" as const,
					kind: "tool_result" as const,
					toolName: "read",
					toolCallId: "read-1",
					path: "src/a.ts",
					rawTokens: 100,
					compactedTokens: 20,
					tokensSaved: 80,
				},
			],
			ledger,
			turn: 1,
			model: "mock-sideband",
		};

		expect(scheduleSidebandSummaries({ ...base, minTokens: 2000, summarize: async () => {
			throw new Error("should not run");
		} })).toEqual({ scheduled: 0 });
		expect(scheduleSidebandSummaries({ ...base, minTokens: 0 })).toEqual({ scheduled: 0 });
		expect(ledger.summariesFor("src/a.ts", hashContent(body))).toEqual([]);
	});
});
