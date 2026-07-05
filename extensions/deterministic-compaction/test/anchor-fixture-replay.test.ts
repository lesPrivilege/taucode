/**
 * V3-WS task 5 — mock replay of the "投影后模型失向" scenario.
 *
 * Reconstructs the g2-round1 E1-C failure shape: the model explores + edits + runs
 * tests, context grows until a projection fires and compacts the raw file contents
 * away, and the required artifact (SUBSYSTEM-MAP.md) is never produced. WITHOUT the
 * anchor the projected context has lost the work semantics — the model can no
 * longer see what it did or what it still owes. WITH ECODE_SEMANTIC_ANCHOR the
 * projected model input carries a deterministic [work-anchor] block re-stating the
 * mechanically verifiable facts, including the pending acceptance target.
 *
 * Also verifies coexistence with the V2-TP stale-view hint: when both fire on a
 * projected turn, order (hint before anchor) and volume (one of each) are pinned.
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, ToolResultMessage, UserMessage } from "@earendil-works/pi-ai";
import { installDeterministicCompaction, type DeterministicCompactionConfig } from "../src/extension.ts";
import { hashContent } from "../src/trust-ledger.ts";

type Handler = (...args: any[]) => any;
interface MockPi {
	handlers: Map<string, Handler[]>;
	on(event: string, handler: Handler): void;
	fire(event: string, ...args: any[]): any;
}
function createMockPi(): MockPi {
	const handlers = new Map<string, Handler[]>();
	return {
		handlers,
		on(event, handler) {
			const list = handlers.get(event) ?? [];
			list.push(handler);
			handlers.set(event, list);
		},
		fire(event, ...args) {
			const list = handlers.get(event) ?? [];
			let result: any;
			for (const h of list) result = h(...args);
			return result;
		},
	};
}
function mockCtx(cwd: string) {
	return { sessionManager: { getCwd: () => cwd, getSessionId: () => "replay-session" }, ui: {} };
}

const BIG_READ = Array.from({ length: 120 }, (_, i) => `line ${i + 1}: const v_${i} = f(${i});`).join("\n");

function userMsg(text: string): UserMessage {
	return { role: "user", content: text, timestamp: 1000 };
}
function readCall(id: string, path: string): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "toolCall", id, name: "read", arguments: { path } }],
		api: "anthropic-messages",
		provider: "anthropic",
		model: "mock",
		usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
		stopReason: "toolUse",
		timestamp: 1001,
	};
}
function readResult(id: string, body: string): ToolResultMessage {
	return { role: "toolResult", toolCallId: id, toolName: "read", content: [{ type: "text", text: body }], isError: false, timestamp: 1002 };
}
function tail(text: string, ts: number): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		api: "anthropic-messages",
		provider: "anthropic",
		model: "mock",
		usage: { input: 5, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 10, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
		stopReason: "stop",
		timestamp: ts,
	};
}
function toolResult(over: Record<string, unknown>) {
	return { type: "tool_result", isError: false, details: undefined, ...over };
}
function last(result: any): any {
	return result.messages[result.messages.length - 1];
}
function anchorConfig(over: Partial<DeterministicCompactionConfig> = {}): DeterministicCompactionConfig {
	return {
		compactAfterInputTokens: 0,
		compactionOptions: { keepRecentAssistantMessages: 3 },
		seamBEnabled: false,
		trustProtocolEnabled: false,
		semanticAnchorEnabled: true,
		...over,
	};
}
/** A transcript that WILL project (big read pushed out of the keepRecent window). */
function projectingMessages(): AgentMessage[] {
	return [
		userMsg("map the subsystem"),
		readCall("big-1", "src/big.ts"),
		readResult("big-1", BIG_READ),
		tail("a", 2000),
		tail("b", 2001),
		tail("c", 2002),
		tail("d", 2003),
	];
}

describe("V3-WS replay: projection loses work semantics; anchor restores them (flag-on)", () => {
	let dir: string;
	beforeEach(() => {
		dir = join(tmpdir(), `anchor-replay-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(join(dir, "src"), { recursive: true });
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it("the projected model input carries edits, tests, and the UNPRODUCED acceptance target", () => {
		const pi = createMockPi();
		installDeterministicCompaction(
			pi as any,
			anchorConfig({ anchorAcceptanceTargets: ["SUBSYSTEM-MAP.md"] }),
			{ observability: false, telemetry: { disabled: true } },
		);
		const ctx = mockCtx(dir);

		pi.fire("context", { messages: [] }, ctx); // turn 1

		// Exploration work — all fed via tool_result events (the anchor's only source).
		writeFileSync(join(dir, "src/index.ts"), "patched\n");
		pi.fire("tool_result", toolResult({ toolName: "edit", input: { path: "src/index.ts" }, content: [{ type: "text", text: "OK" }], details: { patch: "--- a\n+++ b\n@@ -1 +1 @@\n-orig\n+patched\n" } }), ctx);
		pi.fire("tool_result", toolResult({ toolName: "bash", input: { command: "npm test" }, content: [{ type: "text", text: "Tests  5 passed (5)" }] }), ctx);

		// Many projected turns later — context has grown; this turn projects.
		const result = pi.fire("context", { messages: projectingMessages() }, ctx);

		expect(result?.messages).toBeDefined();
		const block = last(result).content as string;
		expect(block).toContain("[work-anchor]");
		expect(block).toContain("edits: src/index.ts +1 -1 hash");
		expect(block).toContain("tests: npm test → 5/5 pass");
		// The crux of the E1-C failure: the artifact was never written, so it stays pending.
		expect(block).toContain("pending: SUBSYSTEM-MAP.md");
	});

	it("flag-off replay: NO anchor block — the model is left disoriented (the bug)", () => {
		const pi = createMockPi();
		installDeterministicCompaction(
			pi as any,
			anchorConfig({ semanticAnchorEnabled: false, anchorAcceptanceTargets: ["SUBSYSTEM-MAP.md"] }),
			{ observability: false, telemetry: { disabled: true } },
		);
		const ctx = mockCtx(dir);

		pi.fire("context", { messages: [] }, ctx);
		writeFileSync(join(dir, "src/index.ts"), "patched\n");
		pi.fire("tool_result", toolResult({ toolName: "edit", input: { path: "src/index.ts" }, content: [{ type: "text", text: "OK" }], details: { patch: "--- a\n+++ b\n@@ -1 +1 @@\n-orig\n+patched\n" } }), ctx);

		const result = pi.fire("context", { messages: projectingMessages() }, ctx);
		expect(result?.messages.some((m: any) => typeof m.content === "string" && m.content.includes("[work-anchor]"))).toBe(false);
	});

	it("pending clears once the artifact is actually produced (no false nag)", () => {
		const pi = createMockPi();
		installDeterministicCompaction(
			pi as any,
			anchorConfig({ anchorAcceptanceTargets: ["SUBSYSTEM-MAP.md"] }),
			{ observability: false, telemetry: { disabled: true } },
		);
		const ctx = mockCtx(dir);

		pi.fire("context", { messages: [] }, ctx);
		pi.fire("tool_result", toolResult({ toolName: "write", input: { path: "SUBSYSTEM-MAP.md", content: "# Subsystems\n\nA, B, C\n" }, content: [{ type: "text", text: "OK" }] }), ctx);

		const result = pi.fire("context", { messages: projectingMessages() }, ctx);
		const block = last(result).content as string;
		expect(block).toContain("[work-anchor]");
		expect(block).toContain("edits: SUBSYSTEM-MAP.md");
		expect(block).not.toContain("pending:");
	});
});

describe("V3-WS + V2-TP coexistence on a projected turn (both flags on)", () => {
	let dir: string;
	beforeEach(() => {
		dir = join(tmpdir(), `anchor-coexist-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(join(dir, "src"), { recursive: true });
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it("emits exactly one stale-view hint THEN one anchor block, in that order", () => {
		const pi = createMockPi();
		installDeterministicCompaction(
			pi as any,
			anchorConfig({ trustProtocolEnabled: true, anchorAcceptanceTargets: ["SUBSYSTEM-MAP.md"] }),
			{ observability: false, telemetry: { disabled: true } },
		);
		const ctx = mockCtx(dir);

		pi.fire("context", { messages: [] }, ctx); // turn 1

		// Read app.ts (v1) then edit it (disk → v2): populates BOTH the ledger (stale
		// detection) and the anchor (edit record).
		pi.fire("tool_result", toolResult({ toolName: "read", input: { path: "src/app.ts" }, content: [{ type: "text", text: "export const version = 1;\n" }] }), ctx);
		writeFileSync(join(dir, "src/app.ts"), "export const version = 2;\n");
		pi.fire("tool_result", toolResult({ toolName: "edit", input: { path: "src/app.ts" }, content: [{ type: "text", text: "OK" }], details: { patch: "--- a\n+++ b\n@@ -1 +1 @@\n-export const version = 1;\n+export const version = 2;\n" } }), ctx);

		// Projecting turn whose transcript STILL contains the stale (v1) read of app.ts.
		const messages: AgentMessage[] = [
			userMsg("what changed?"),
			readCall("app-1", "src/app.ts"),
			readResult("app-1", "export const version = 1;\n"),
			readCall("big-1", "src/big.ts"),
			readResult("big-1", BIG_READ),
			tail("a", 2000),
			tail("b", 2001),
			tail("c", 2002),
			tail("d", 2003),
		];
		const result = pi.fire("context", { messages }, ctx);

		const msgs = result.messages as any[];
		const staleIdxs = msgs.map((m, i) => (typeof m.content === "string" && m.content.includes("[stale-view]") ? i : -1)).filter((i) => i >= 0);
		const anchorIdxs = msgs.map((m, i) => (typeof m.content === "string" && m.content.includes("[work-anchor]") ? i : -1)).filter((i) => i >= 0);

		// Volume: exactly one of each.
		expect(staleIdxs).toHaveLength(1);
		expect(anchorIdxs).toHaveLength(1);
		// Order: the two are the final two messages, hint then anchor.
		expect(anchorIdxs[0]).toBe(msgs.length - 1);
		expect(staleIdxs[0]).toBe(msgs.length - 2);

		// Both carry the truthful hashes (proving they came from real ledger/anchor state).
		expect(msgs[staleIdxs[0]].content).toContain(hashContent("export const version = 2;\n"));
		expect(msgs[anchorIdxs[0]].content).toContain("edits: src/app.ts");
	});
});
