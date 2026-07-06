import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	recordSemanticToolEvents,
	semanticToolEventsFromResult,
	type ToolResultLike,
} from "../src/semantic-events.ts";
import { SemanticLedger } from "../src/semantic-ledger.ts";
import { hashContent } from "../src/trust-ledger.ts";

function toolResult(over: Partial<ToolResultLike>): ToolResultLike {
	return {
		toolName: "read",
		input: {},
		content: [],
		isError: false,
		...over,
	};
}

describe("semanticToolEventsFromResult — WS-0 tool_result extraction", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `semantic-events-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(join(tempDir, "src"), { recursive: true });
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("normalizes read results into path/hash/text facts", () => {
		const text = "export const x = 1;\n";
		const events = semanticToolEventsFromResult(
			toolResult({
				toolName: "read",
				input: { path: "src/a.ts" },
				content: [{ type: "text", text }],
			}),
			{ turn: 3, semanticAnchorEnabled: false },
		);

		expect(events).toEqual([{ kind: "read", path: "src/a.ts", text, hash: hashContent(text), turn: 3 }]);
	});

	it("normalizes edit results from post-write disk content and patch diffstat", () => {
		writeFileSync(join(tempDir, "src/a.ts"), "new\n");
		const patch = "--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new\n";

		const events = semanticToolEventsFromResult(
			toolResult({
				toolName: "edit",
				input: { path: "src/a.ts" },
				content: [{ type: "text", text: "OK" }],
				details: { patch },
			}),
			{ turn: 4, semanticAnchorEnabled: false, getCwd: () => tempDir },
		);

		expect(events).toEqual([
			{ kind: "edit", path: "src/a.ts", text: "new\n", hash: hashContent("new\n"), diffstat: "+1 -1", turn: 4 },
		]);
	});

	it("normalizes write results with line-count diffstat", () => {
		const text = "a\nb\n";
		const events = semanticToolEventsFromResult(
			toolResult({
				toolName: "write",
				input: { path: "out.txt", content: text },
				content: [{ type: "text", text: "OK" }],
			}),
			{ turn: 5, semanticAnchorEnabled: true },
		);

		expect(events).toEqual([
			{ kind: "edit", path: "out.txt", text, hash: hashContent(text), diffstat: "+3", turn: 5 },
		]);
	});

	it("normalizes failed edit/write only when the anchor flag is enabled", () => {
		const failed = toolResult({
			toolName: "edit",
			input: { path: "src/missing.ts" },
			content: [{ type: "text", text: "no match" }],
			isError: true,
		});

		expect(semanticToolEventsFromResult(failed, { turn: 6, semanticAnchorEnabled: false })).toEqual([]);
		expect(semanticToolEventsFromResult(failed, { turn: 6, semanticAnchorEnabled: true })).toEqual([
			{ kind: "edit_failed", path: "src/missing.ts", turn: 6 },
		]);
	});

	it("normalizes bash test runs before generic error handling when anchor is enabled", () => {
		const events = semanticToolEventsFromResult(
			toolResult({
				toolName: "bash",
				input: { command: "npm test" },
				content: [{ type: "text", text: "Tests  7 passed (7)" }],
				isError: true,
			}),
			{ turn: 7, semanticAnchorEnabled: true },
		);

		expect(events).toEqual([{ kind: "test", command: "npm test", result: "fail", turn: 7 }]);
	});
});

describe("recordSemanticToolEvents — compatibility writer", () => {
	it("feeds the unified SemanticLedger without changing renderer-facing surfaces", () => {
		const ledger = new SemanticLedger();
		const readText = "old\n";
		const editText = "new\n";

		recordSemanticToolEvents(
			[
				{ kind: "read", path: "src/a.ts", text: readText, hash: hashContent(readText), turn: 1 },
				{ kind: "edit", path: "src/a.ts", text: editText, hash: hashContent(editText), diffstat: "+1 -1", turn: 2 },
				{ kind: "test", command: "npm test", result: "1/1 pass", turn: 3 },
			],
			{ recordFactsEnabled: true, trustProtocolEnabled: true, semanticAnchorEnabled: true, ledger },
		);

		expect(ledger.get("src/a.ts")).toMatchObject({
			hash: hashContent(editText),
			turn: 2,
			diffstat: "+1 -1",
		});
		expect(ledger.snapshot()).toEqual({
			reads: [{ path: "src/a.ts", hash: hashContent(readText), turn: 1 }],
			edits: [
				{
					path: "src/a.ts",
					hash: hashContent(editText),
					diffstat: "+1 -1",
					priorHash: hashContent(readText),
					turn: 2,
					failed: false,
				},
			],
			tests: [{ command: "npm test", result: "1/1 pass", turn: 3 }],
		});
	});
});
