import { describe, expect, it } from "vitest";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, ToolResultMessage, UserMessage } from "@earendil-works/pi-ai";
import { projectContext } from "../src/projection.js";
import { SemanticLedger } from "../src/semantic-ledger.ts";
import { applyFormSubstitutions, buildProjectionPolicy } from "../src/projection-policy.ts";

const BIG_READ = Array.from({ length: 120 }, (_, i) => `line ${i}: export const v${i} = ${i};`).join("\n");

function userMsg(text: string): UserMessage {
	return { role: "user", content: text, timestamp: 1000 };
}

function assistantRead(toolCallId: string, path: string, ts = 1001): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "toolCall", id: toolCallId, name: "read", arguments: { path } }],
		api: "anthropic-messages",
		provider: "mock",
		model: "mock",
		usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
		stopReason: "toolUse",
		timestamp: ts,
	};
}

function toolResult(toolCallId: string, text: string): ToolResultMessage {
	return {
		role: "toolResult",
		toolName: "read",
		toolCallId,
		content: [{ type: "text", text }],
		isError: false,
		timestamp: 1002,
	};
}

function trailing(ts: number): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text: `turn ${ts}` }],
		api: "anthropic-messages",
		provider: "mock",
		model: "mock",
		usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
		stopReason: "stop",
		timestamp: ts,
	};
}

function readTranscript(path: string): AgentMessage[] {
	return [
		userMsg(`read ${path}`),
		assistantRead("read-1", path),
		toolResult("read-1", BIG_READ),
		trailing(2000),
		trailing(2001),
		trailing(2002),
		trailing(2003),
	];
}

describe("WS-4 projection policy", () => {
	it("protects verified verbatim declarations for the bounded turn window", () => {
		const ledger = new SemanticLedger();
		ledger.recordView("src/a.ts", "h1", 1);
		ledger.recordDeclaration({
			kind: "declaration",
			id: "decl-v",
			path: "src/a.ts",
			hash: "h1",
			retention: "verbatim",
			verified: true,
			turn: 2,
			author: "model-inband",
		});

		const active = buildProjectionPolicy(ledger, 9, { enabled: true, verbatimWindow: 8 });
		expect([...active.protectPaths]).toEqual(["src/a.ts"]);
		expect(active.policyEvents).toContain("protect:decl-v:src/a.ts#h1");

		const expired = buildProjectionPolicy(ledger, 11, { enabled: true, verbatimWindow: 8 });
		expect([...expired.protectPaths]).toEqual([]);
	});

	it("skips protected read paths without altering the default off-state projection", () => {
		const messages = readTranscript("src/a.ts");
		const base = projectContext(messages, { compactAfterInputTokens: 0, compactionOptions: { keepRecentAssistantMessages: 3 } });
		expect(base.projected).toBe(true);
		expect(base.compaction?.diffs.map((d) => d.path)).toContain("src/a.ts");

		const protectedRun = projectContext(messages, {
			compactAfterInputTokens: 0,
			compactionOptions: { keepRecentAssistantMessages: 3 },
			compactionInjection: { protectedPaths: new Set(["src/a.ts"]) },
		});
		expect(protectedRun.projected).toBe(false);
		expect(protectedRun.messages).toBe(messages);
	});

	it("forms substitution from semantic declarations without changing compaction diffs", () => {
		const ledger = new SemanticLedger();
		ledger.recordView("src/a.ts", "h1", 1);
		ledger.recordDeclaration({
			kind: "declaration",
			id: "decl-s",
			path: "src/a.ts",
			hash: "h1",
			retention: "semantic",
			semanticComplete: true,
			summary: "The routing table was fully captured.",
			verified: true,
			turn: 2,
			author: "model-inband",
		});
		const policy = buildProjectionPolicy(ledger, 5, { enabled: true, verbatimWindow: 8 });
		const outcome = projectContext(readTranscript("src/a.ts"), { compactAfterInputTokens: 0, compactionOptions: { keepRecentAssistantMessages: 3 } });
		const messages = applyFormSubstitutions(outcome.messages, outcome.compaction!.diffs, policy.formSubstitutions);

		expect(outcome.compaction!.diffs).toHaveLength(1);
		expect(messages).not.toBe(outcome.messages);
		const sent = messages.find((m): m is ToolResultMessage => m.role === "toolResult" && (m as ToolResultMessage).toolCallId === "read-1")!;
		const text = sent.content.map((block) => (block.type === "text" ? block.text : "")).join("");
		expect(text).toContain("[work-semantics declaration]");
		expect(text).toContain("The routing table was fully captured.");
		expect(outcome.compaction!.diffs).toHaveLength(1);
	});

	it("suppresses semantic declaration substitution after an online reread contradiction", () => {
		const ledger = new SemanticLedger();
		ledger.recordView("src/a.ts", "h1", 1);
		ledger.recordDeclaration({
			kind: "declaration",
			id: "decl-s",
			path: "src/a.ts",
			hash: "h1",
			retention: "semantic",
			semanticComplete: true,
			summary: "Complete.",
			verified: true,
			turn: 2,
			author: "model-inband",
		});
		ledger.recordView("src/a.ts", "h1", 3);

		const policy = buildProjectionPolicy(ledger, 4, { enabled: true, verbatimWindow: 8 });
		expect([...policy.formSubstitutions.values()]).toEqual([]);
	});

	it("allows sideband summaries to provide the same form-only substitution", () => {
		const ledger = new SemanticLedger();
		ledger.recordView("src/a.ts", "h1", 1);
		ledger.recordSummary({
			kind: "summary",
			id: "summary-1",
			path: "src/a.ts",
			hash: "h1",
			text: "Sideband captured the API surface.",
			sourceHashes: ["h1"],
			turn: 2,
			author: "sideband",
		});

		const policy = buildProjectionPolicy(ledger, 4, { enabled: true, verbatimWindow: 8 });
		expect(policy.formSubstitutions.get("src/a.ts")).toMatchObject({
			source: "summary",
			text: "Sideband captured the API surface.",
		});
	});
});
