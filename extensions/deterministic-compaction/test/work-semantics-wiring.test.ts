import { describe, expect, it } from "vitest";
import {
	installDeterministicCompaction,
	type DeterministicCompactionConfig,
} from "../src/extension.ts";
import { DECLARE_WORK_SEMANTICS_TOOL } from "../src/work-semantics-declaration.ts";

type Handler = (...args: any[]) => any;

function createMockPi() {
	const handlers = new Map<string, Handler[]>();
	const tools = new Map<string, unknown>();
	return {
		handlers,
		tools,
		on(event: string, handler: Handler) {
			const list = handlers.get(event) ?? [];
			list.push(handler);
			handlers.set(event, list);
		},
		registerTool(tool: { name: string }) {
			tools.set(tool.name, tool);
		},
	};
}

function config(over: Partial<DeterministicCompactionConfig> = {}): DeterministicCompactionConfig {
	return {
		compactAfterInputTokens: 999999,
		seamBEnabled: false,
		trustProtocolEnabled: false,
		semanticAnchorEnabled: false,
		workSemanticsDeclarationEnabled: false,
		sidebandSummaryEnabled: false,
		ledgerPersistEnabled: false,
		workSemanticsDeclareNudge: "off",
		...over,
	};
}

describe("WS-2 wiring — declaration tool flag", () => {
	it("does not register the declaration tool when flag is off", () => {
		const pi = createMockPi();
		installDeterministicCompaction(pi as any, config(), { observability: false, telemetry: { disabled: true } });

		expect(pi.tools.has(DECLARE_WORK_SEMANTICS_TOOL)).toBe(false);
		expect(pi.handlers.get("tool_result")).toBeUndefined();
	});

	it("registers the declaration tool and fact-observation handler when flag is on", () => {
		const pi = createMockPi();
		installDeterministicCompaction(
			pi as any,
			config({ workSemanticsDeclarationEnabled: true }),
			{ observability: false, telemetry: { disabled: true } },
		);

		expect(pi.tools.has(DECLARE_WORK_SEMANTICS_TOOL)).toBe(true);
		expect(pi.handlers.get("tool_result")).toBeDefined();
	});

	it("does not register tool_result handler for sideband when flag is off", () => {
		const pi = createMockPi();
		installDeterministicCompaction(pi as any, config(), { observability: false, telemetry: { disabled: true } });

		expect(pi.handlers.get("tool_result")).toBeUndefined();
	});

	it("registers a fact-observation handler when sideband flag is on", () => {
		const pi = createMockPi();
		installDeterministicCompaction(
			pi as any,
			config({ sidebandSummaryEnabled: true }),
			{ observability: false, telemetry: { disabled: true } },
		);

		expect(pi.handlers.get("tool_result")).toBeDefined();
	});

	it("registers a fact-observation handler when ledger persistence is on", () => {
		const pi = createMockPi();
		installDeterministicCompaction(
			pi as any,
			config({ ledgerPersistEnabled: true }),
			{ observability: false, telemetry: { disabled: true } },
		);

		expect(pi.handlers.get("tool_result")).toBeDefined();
	});

	it("nudge flag appends a volatile tail while off-state remains identity", () => {
		const off = createMockPi();
		installDeterministicCompaction(off as any, config(), { observability: false, telemetry: { disabled: true } });
		expect(off.handlers.get("context")?.[0]?.({ messages: [{ role: "user", content: "hi", timestamp: 0 }] }, { ui: {}, sessionManager: { getCwd: () => process.cwd(), getSessionId: () => "s" } })).toBeUndefined();

		const on = createMockPi();
		installDeterministicCompaction(
			on as any,
			config({ workSemanticsDeclareNudge: "every-turn" }),
			{ observability: false, telemetry: { disabled: true } },
		);
		const result = on.handlers.get("context")?.[0]?.(
			{ messages: [{ role: "user", content: "hi", timestamp: 0 }] },
			{ ui: {}, sessionManager: { getCwd: () => process.cwd(), getSessionId: () => "s" } },
		);
		expect(result.messages.at(-1).content).toContain("declare_work_semantics");
	});

	it("records OBS-TAIL evidence for projected anchor and placebo tails", () => {
		const pi = createMockPi();
		const evidence: unknown[] = [];
		installDeterministicCompaction(
			pi as any,
			config({
				compactAfterInputTokens: 0,
				semanticAnchorEnabled: true,
				placeboTailEnabled: true,
				placeboTailTargetTokens: 16,
				compactionOptions: { keepRecentAssistantMessages: 0, minResultTokens: 1 },
			}),
			{
				observability: false,
				telemetry: { disabled: true },
				tailEvidence: { record: (row) => evidence.push(row) },
			},
		);
		const toolResult = pi.handlers.get("tool_result")?.[0]!;
		toolResult(
			{
				toolName: "read",
				input: { path: "src/a.ts" },
				content: [{ type: "text", text: "export const a = 1;\n".repeat(20) }],
				isError: false,
			},
			{ sessionManager: { getCwd: () => process.cwd(), getSessionId: () => "s" }, ui: {} },
		);
		const context = pi.handlers.get("context")?.[0]!;
		const result = context(
			{
				messages: [
					{ role: "assistant", content: [{ type: "toolCall", id: "r1", name: "read", arguments: { path: "src/a.ts" } }], timestamp: 0 },
					{ role: "toolResult", toolName: "read", toolCallId: "r1", content: [{ type: "text", text: "export const a = 1;\n".repeat(20) }], isError: false, timestamp: 1 },
				],
			},
			{ ui: {}, sessionManager: { getCwd: () => process.cwd(), getSessionId: () => "s" } },
		);

		expect(result.messages.length).toBeGreaterThan(2);
		expect(evidence).toHaveLength(1);
		expect(evidence[0]).toMatchObject({
			turn: 1,
			anchor_lines: expect.any(Number),
			anchor_hash: expect.any(String),
			tail_blocks: expect.arrayContaining([
				expect.objectContaining({ source: "anchor", content_hash: expect.any(String) }),
				expect.objectContaining({ source: "placebo", content_hash: expect.any(String) }),
			]),
		});
	});

	it("compact nudge tail is projected-only and records OBS-TAIL evidence", () => {
		const off = createMockPi();
		installDeterministicCompaction(off as any, config(), { observability: false, telemetry: { disabled: true } });
		expect(off.handlers.get("context")?.[0]?.({ messages: [{ role: "user", content: "hi", timestamp: 0 }] }, { ui: {}, sessionManager: { getCwd: () => process.cwd(), getSessionId: () => "s" } })).toBeUndefined();

		const pi = createMockPi();
		const evidence: unknown[] = [];
		installDeterministicCompaction(
			pi as any,
			config({
				compactAfterInputTokens: 0,
				compactNudgeTailEnabled: true,
				compactionOptions: { keepRecentAssistantMessages: 0, minResultTokens: 1 },
			}),
			{
				observability: false,
				telemetry: { disabled: true },
				tailEvidence: { record: (row) => evidence.push(row) },
			},
		);
		const context = pi.handlers.get("context")?.[0]!;
		const result = context(
			{
				messages: [
					{ role: "assistant", content: [{ type: "toolCall", id: "r1", name: "read", arguments: { path: "src/a.ts" } }], timestamp: 0 },
					{ role: "toolResult", toolName: "read", toolCallId: "r1", content: [{ type: "text", text: "export const a = 1;\n".repeat(20) }], isError: false, timestamp: 1 },
				],
			},
			{ ui: {}, sessionManager: { getCwd: () => process.cwd(), getSessionId: () => "s" } },
		);

		expect(result.messages.at(-1).content).toBe("[nudge]\nGoal; verify files; finish.");
		expect(evidence).toHaveLength(1);
		expect(evidence[0]).toMatchObject({
			tail_blocks: [expect.objectContaining({ source: "nudge", line_count: 2, content_hash: expect.any(String) })],
		});
	});
});
