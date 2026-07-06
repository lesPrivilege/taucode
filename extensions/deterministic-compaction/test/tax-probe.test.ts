import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendTaxProbeRow, nudgeTailMessage, TaxProbeCollector } from "../src/tax-probe.ts";

describe("TaxProbeCollector — WS-2.5", () => {
	it("records provider output/reasoning units and declaration-only overhead", () => {
		const collector = new TaxProbeCollector();
		collector.recordAssistant(3, {
			content: [{ type: "toolCall", id: "d1", name: "declare_work_semantics", arguments: {} }],
			usage: { output: 11, reasoning: 22 },
		});
		const rows: unknown[] = [];
		collector.flush("session-1", (row) => {
			rows.push(row);
			return "memory";
		});

		expect(rows).toEqual([
			{
				type: "ws_tax_probe_turn",
				session_id: "session-1",
				turn: 3,
				output_tokens: 11,
				reasoning_tokens: 22,
				declaration_turn_overhead: true,
				nudge: "every-turn",
			},
		]);
	});

	it("renders the volatile nudge tail", () => {
		expect(nudgeTailMessage()).toEqual({
			role: "user",
			content: expect.stringContaining("declare_work_semantics"),
			timestamp: 0,
		});
	});
});

describe("appendTaxProbeRow", () => {
	let dir: string;
	beforeEach(() => {
		dir = join(tmpdir(), `tax-probe-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(dir, { recursive: true });
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it("writes JSONL under .ecode/ws-tax-probe and gitignores it", () => {
		const file = appendTaxProbeRow(
			{
				type: "ws_tax_probe_turn",
				session_id: "s1",
				turn: 1,
				output_tokens: 10,
				reasoning_tokens: 20,
				declaration_turn_overhead: false,
				nudge: "every-turn",
			},
			dir,
		);

		expect(file).toBe(join(dir, ".ecode", "ws-tax-probe", "s1.jsonl"));
		expect(readFileSync(file, "utf-8")).toContain('"output_tokens":10');
		expect(readFileSync(join(dir, ".gitignore"), "utf-8")).toContain(".ecode/ws-tax-probe/");
		expect(existsSync(file)).toBe(true);
	});
});
