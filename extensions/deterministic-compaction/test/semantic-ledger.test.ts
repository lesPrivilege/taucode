import { describe, expect, it } from "vitest";
import { SemanticLedger, type DeclarationRecord, type SummaryRecord } from "../src/semantic-ledger.ts";

describe("SemanticLedger — WS-1 unified path/hash authority", () => {
	it("exposes the trust-hint surface as latest path entry", () => {
		const ledger = new SemanticLedger();
		ledger.recordView("src/a.ts", "readhash", 1);
		expect(ledger.get("src/a.ts")).toEqual({ hash: "readhash", turn: 1 });

		ledger.recordEdit("src/a.ts", "edithash", 2, "+1 -1");
		expect(ledger.get("src/a.ts")).toEqual({ hash: "edithash", turn: 2, diffstat: "+1 -1" });
	});

	it("exposes the anchor snapshot with read/edit lineage and no prose", () => {
		const ledger = new SemanticLedger();
		ledger.recordView("src/a.ts", "readhash", 1);
		ledger.recordEdit("src/a.ts", "edithash", 2, "+1 -1");
		ledger.recordTest("npm test", "1/1 pass", 3);

		expect(ledger.snapshot()).toEqual({
			reads: [{ path: "src/a.ts", hash: "readhash", turn: 1 }],
			edits: [
				{
					path: "src/a.ts",
					hash: "edithash",
					diffstat: "+1 -1",
					priorHash: "readhash",
					turn: 2,
					failed: false,
				},
			],
			tests: [{ command: "npm test", result: "1/1 pass", turn: 3 }],
		});
	});

	it("keeps failed edits in the anchor snapshot without changing trust current hash", () => {
		const ledger = new SemanticLedger();
		ledger.recordView("src/a.ts", "readhash", 1);
		ledger.recordEditFailure("src/a.ts", 2);

		expect(ledger.get("src/a.ts")).toEqual({ hash: "readhash", turn: 1 });
		expect(ledger.snapshot().edits).toEqual([
			{ path: "src/a.ts", hash: null, diffstat: null, turn: 2, failed: true },
		]);
	});

	it("uses the previous edit hash as prior hash for repeated edits", () => {
		const ledger = new SemanticLedger();
		ledger.recordView("src/a.ts", "readhash", 1);
		ledger.recordEdit("src/a.ts", "edit1", 2, "+1 -1");
		ledger.recordEdit("src/a.ts", "edit2", 3, "+2 -0");

		expect(ledger.snapshot().edits).toEqual([
			{
				path: "src/a.ts",
				hash: "edit2",
				diffstat: "+2 -0",
				priorHash: "edit1",
				turn: 3,
				failed: false,
			},
		]);
	});

	it("stores declaration records without changing trust or anchor surfaces", () => {
		const ledger = new SemanticLedger();
		ledger.recordView("src/a.ts", "readhash", 1);
		const declaration: DeclarationRecord = {
			kind: "declaration",
			id: "decl-1",
			path: "src/a.ts",
			hash: "readhash",
			retention: "semantic",
			semanticComplete: true,
			summary: "The exported routing table was inspected.",
			verified: true,
			turn: 2,
			author: "model-inband",
		};

		ledger.recordDeclaration(declaration);

		expect(ledger.declarationsFor("src/a.ts", "readhash")).toEqual([declaration]);
		expect(ledger.get("src/a.ts")).toEqual({ hash: "readhash", turn: 1 });
		expect(ledger.snapshot()).toEqual({
			reads: [{ path: "src/a.ts", hash: "readhash", turn: 1 }],
			edits: [],
			tests: [],
		});
	});

	it("stores summary records as the only prose-bearing ledger record kind", () => {
		const ledger = new SemanticLedger();
		const summary: SummaryRecord = {
			kind: "summary",
			id: "summary-1",
			path: "src/a.ts",
			hash: "readhash",
			text: "Exports a small request router.",
			sourceHashes: ["readhash"],
			turn: 3,
			author: "sideband",
			providerCost: { model: "cheap-summary", inputTokens: 120, outputTokens: 24 },
		};

		ledger.recordSummary(summary);

		expect(ledger.summariesFor("src/a.ts", "readhash")).toEqual([summary]);
		expect(ledger.get("src/a.ts")).toBeUndefined();
		expect(ledger.snapshot()).toEqual({ reads: [], edits: [], tests: [] });
	});

	it("returns copies for declaration and summary queries", () => {
		const ledger = new SemanticLedger();
		const declaration: DeclarationRecord = {
			kind: "declaration",
			id: "decl-2",
			path: "src/a.ts",
			hash: "h",
			retention: "routing",
			verified: true,
			turn: 1,
			author: "model-inband",
		};
		const summary: SummaryRecord = {
			kind: "summary",
			id: "summary-2",
			path: "src/a.ts",
			hash: "h",
			text: "Routing only.",
			sourceHashes: ["h"],
			turn: 1,
			author: "sideband",
		};
		ledger.recordDeclaration(declaration);
		ledger.recordSummary(summary);

		ledger.declarationsFor("src/a.ts", "h").pop();
		ledger.summariesFor("src/a.ts", "h").pop();

		expect(ledger.declarationsFor("src/a.ts", "h")).toEqual([declaration]);
		expect(ledger.summariesFor("src/a.ts", "h")).toEqual([summary]);
	});

	it("deduplicates declaration records by decl_id", () => {
		const ledger = new SemanticLedger();
		const declaration: DeclarationRecord = {
			kind: "declaration",
			id: "same-decl",
			path: "src/a.ts",
			hash: "h",
			retention: "verbatim",
			verified: true,
			turn: 1,
			author: "model-inband",
		};

		ledger.recordDeclaration(declaration);
		ledger.recordDeclaration({ ...declaration, turn: 2 });

		expect(ledger.declarationsFor("src/a.ts", "h")).toEqual([declaration]);
	});

	it("records declaration calibration online when a path/hash is read again", () => {
		const ledger = new SemanticLedger();
		ledger.recordView("src/a.ts", "h", 1);
		ledger.recordDeclaration({
			kind: "declaration",
			id: "decl-disposable",
			path: "src/a.ts",
			hash: "h",
			retention: "disposable",
			verified: true,
			turn: 2,
			author: "model-inband",
		});
		ledger.recordDeclaration({
			kind: "declaration",
			id: "decl-semantic",
			path: "src/a.ts",
			hash: "h",
			retention: "semantic",
			semanticComplete: true,
			summary: "Enough to continue.",
			verified: true,
			turn: 2,
			author: "model-inband",
		});

		ledger.recordView("src/a.ts", "h", 3);

		expect(ledger.calibrationSnapshot()).toEqual([
			{
				metric: "declared_disposable_reread",
				declId: "decl-disposable",
				path: "src/a.ts",
				hash: "h",
				declaredTurn: 2,
				rereadTurn: 3,
			},
			{
				metric: "declared_semantic_verbatim_reread",
				declId: "decl-semantic",
				path: "src/a.ts",
				hash: "h",
				declaredTurn: 2,
				rereadTurn: 3,
			},
		]);
	});
});
