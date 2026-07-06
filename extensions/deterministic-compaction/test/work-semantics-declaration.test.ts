import { describe, expect, it } from "vitest";
import { SemanticLedger } from "../src/semantic-ledger.ts";
import {
	canonicalJson,
	declarationId,
	DECLARE_WORK_SEMANTICS_TOOL,
	parseWorkSemanticsDeclaration,
	registerWorkSemanticsDeclarationTool,
	type WorkSemanticsDeclarationInput,
} from "../src/work-semantics-declaration.ts";

describe("work-semantics declaration canonicalization", () => {
	it("serializes object keys in sorted order", () => {
		expect(canonicalJson({ b: 2, a: { d: 4, c: 3 } })).toBe('{"a":{"c":3,"d":4},"b":2}');
	});

	it("gives semantically identical declarations with different key order the same decl_id", () => {
		const a = {
			items: [
				{
					path: "src/a.ts",
					hash: "abcd1234",
					retention: "semantic",
					semantic_complete: true,
					summary: "Enough to continue.",
				},
			],
			pending: ["OUT.md"],
			decisions: ["Use the parser."],
		} satisfies WorkSemanticsDeclarationInput;
		const b = {
			decisions: ["Use the parser."],
			pending: ["OUT.md"],
			items: [
				{
					summary: "Enough to continue.",
					semantic_complete: true,
					retention: "semantic",
					hash: "abcd1234",
					path: "src/a.ts",
				},
			],
		} satisfies WorkSemanticsDeclarationInput;

		expect(declarationId(a)).toBe(declarationId(b));
	});
});

describe("parseWorkSemanticsDeclaration", () => {
	it("creates declaration records with decl_id and path#hash verification", () => {
		const ledger = new SemanticLedger();
		ledger.recordView("src/a.ts", "abcd1234", 1);

		const parsed = parseWorkSemanticsDeclaration(
			{
				items: [
					{
						path: "src/a.ts",
						hash: "abcd1234",
						retention: "semantic",
						semantic_complete: true,
						summary: "The route map is complete.",
					},
					{ path: "src/b.ts", hash: "ffff0000", retention: "routing" },
				],
			},
			ledger,
			2,
		);

		expect(parsed.matched).toBe(1);
		expect(parsed.unverified).toBe(1);
		expect(parsed.records).toEqual([
			{
				kind: "declaration",
				id: parsed.id,
				path: "src/a.ts",
				hash: "abcd1234",
				retention: "semantic",
				semanticComplete: true,
				summary: "The route map is complete.",
				verified: true,
				turn: 2,
				author: "model-inband",
			},
			{
				kind: "declaration",
				id: parsed.id,
				path: "src/b.ts",
				hash: "ffff0000",
				retention: "routing",
				verified: false,
				turn: 2,
				author: "model-inband",
			},
		]);
	});

	it("rejects semantic declarations without a summary", () => {
		expect(() =>
			parseWorkSemanticsDeclaration(
				{ items: [{ path: "src/a.ts", hash: "h", retention: "semantic" }] },
				new SemanticLedger(),
				1,
			),
		).toThrow(/semantic declarations require summary/);
	});
});

describe("registerWorkSemanticsDeclarationTool", () => {
	it("registers capture-only tool that records declarations and returns one-line ack", async () => {
		const ledger = new SemanticLedger();
		ledger.recordView("src/a.ts", "abcd1234", 1);
		const tools = new Map<string, any>();

		registerWorkSemanticsDeclarationTool(
			{ registerTool: (tool) => tools.set(tool.name, tool) },
			ledger,
			() => 2,
		);

		const tool = tools.get(DECLARE_WORK_SEMANTICS_TOOL);
		expect(tool).toBeDefined();
		const result = await tool.execute(
			"tc1",
			{
				items: [
					{
						path: "src/a.ts",
						hash: "abcd1234",
						retention: "semantic",
						semantic_complete: true,
						summary: "The route map is complete.",
					},
				],
			},
			undefined,
			undefined,
			{},
		);

		const id = result.details.id;
		expect(result.content).toEqual([
			{ type: "text", text: `[ws] recorded 1 declarations (1 matched, 0 unverified) id ${id}` },
		]);
		expect(ledger.declarationsFor("src/a.ts", "abcd1234")).toEqual([
			{
				kind: "declaration",
				id,
				path: "src/a.ts",
				hash: "abcd1234",
				retention: "semantic",
				semanticComplete: true,
				summary: "The route map is complete.",
				verified: true,
				turn: 2,
				author: "model-inband",
			},
		]);
	});
});
