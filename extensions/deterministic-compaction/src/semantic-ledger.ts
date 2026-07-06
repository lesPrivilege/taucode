import type { AnchorEditRecord, AnchorReadRecord, AnchorSnapshot, AnchorTestRecord } from "./anchor.js";

export type Author = "harness" | "model-inband" | "sideband";
export type Retention = "verbatim" | "semantic" | "routing" | "disposable";

export interface LedgerEntry {
	/** SHA-256/8-hex of the content at record time (the current authoritative hash). */
	hash: string;
	/** Turn the entry was recorded. */
	turn: number;
	/** Present on edit/write records — the model's physical evidence of its own change. */
	diffstat?: string;
}

interface ViewRecord extends AnchorReadRecord {
	author: Author;
}

interface EditRecord extends AnchorEditRecord {
	author: Author;
}

interface TestRecord extends AnchorTestRecord {
	author: Author;
}

export interface DeclarationRecord {
	kind: "declaration";
	id: string;
	path: string;
	hash: string;
	retention: Retention;
	semanticComplete?: boolean;
	summary?: string;
	verified: boolean;
	turn: number;
	author: "model-inband";
}

export interface SummaryProviderCost {
	model: string;
	inputTokens: number;
	outputTokens: number;
}

export interface SummaryRecord {
	kind: "summary";
	id: string;
	path: string;
	hash: string;
	text: string;
	sourceHashes: string[];
	turn: number;
	author: Author;
	providerCost?: SummaryProviderCost;
}

export type CalibrationMetric =
	| "declared_disposable_reread"
	| "declared_semantic_verbatim_reread";

export interface CalibrationEvent {
	metric: CalibrationMetric;
	declId: string;
	path: string;
	hash: string;
	declaredTurn: number;
	rereadTurn: number;
}

/**
 * WS-1 semantic ledger: the single session-scoped path/hash authority used by
 * both the stale-view trust hint and the deterministic work anchor.
 *
 * Storage discipline: harness records store hashes, turns, diffstats, failures,
 * and test outcomes. They do not store read prose. The only prose-bearing
 * records are explicit declaration/summary records for WS-2/WS-3.
 */
export class SemanticLedger {
	private readonly currentByPath = new Map<string, LedgerEntry>();
	private readonly reads = new Map<string, ViewRecord>();
	private readonly edits = new Map<string, EditRecord>();
	private readonly tests: TestRecord[] = [];
	private readonly declarations = new Map<string, DeclarationRecord[]>();
	private readonly declarationIds = new Set<string>();
	private readonly summaries = new Map<string, SummaryRecord[]>();
	private readonly calibrationEvents: CalibrationEvent[] = [];

	/** Record a read view by hash. */
	recordView(path: string, hash: string, turn: number): void {
		this.currentByPath.set(path, { hash, turn });
		this.reads.set(path, { path, hash, turn, author: "harness" });
		this.recordReadCalibration(path, hash, turn);
	}

	/** Record a successful edit/write by post-write hash + diffstat. */
	recordEdit(path: string, hash: string, turn: number, diffstat: string): void {
		const prior = this.edits.get(path)?.hash ?? this.reads.get(path)?.hash;
		this.currentByPath.set(path, { hash, turn, diffstat });
		this.edits.set(path, {
			path,
			hash,
			diffstat,
			priorHash: prior ?? undefined,
			turn,
			failed: false,
			author: "harness",
		});
	}

	/** Record a failed edit/write honestly — no hash, no diffstat. */
	recordEditFailure(path: string, turn: number): void {
		this.edits.set(path, {
			path,
			hash: null,
			diffstat: null,
			turn,
			failed: true,
			author: "harness",
		});
	}

	/** Record a test run. */
	recordTest(command: string, result: string, turn: number): void {
		this.tests.push({ command, result, turn, author: "harness" });
	}

	/** Store a model-authored retention declaration. No policy effect in the ledger. */
	recordDeclaration(record: DeclarationRecord): void {
		if (this.declarationIds.has(record.id)) return;
		const key = keyFor(record.path, record.hash);
		const list = this.declarations.get(key) ?? [];
		list.push(record);
		this.declarations.set(key, list);
		this.declarationIds.add(record.id);
	}

	/** Store an explicit prose summary. Summaries are inert until WS-4 policy reads them. */
	recordSummary(record: SummaryRecord): void {
		const key = keyFor(record.path, record.hash);
		const list = this.summaries.get(key) ?? [];
		list.push(record);
		this.summaries.set(key, list);
	}

	/** Trust-hint surface: latest authoritative path entry. */
	get(path: string): LedgerEntry | undefined {
		return this.currentByPath.get(path);
	}

	/** Anchor-renderer surface, stripped of storage-only author metadata. */
	snapshot(): AnchorSnapshot {
		return {
			reads: [...this.reads.values()].map(({ author: _author, ...r }) => r),
			edits: [...this.edits.values()].map(({ author: _author, ...e }) => e),
			tests: this.tests.map(({ author: _author, ...t }) => t),
		};
	}

	declarationsFor(path: string, hash: string): DeclarationRecord[] {
		return [...(this.declarations.get(keyFor(path, hash)) ?? [])];
	}

	declarationsSnapshot(): DeclarationRecord[] {
		return [...this.declarations.values()].flatMap((records) => records.map((record) => ({ ...record })));
	}

	summariesFor(path: string, hash: string): SummaryRecord[] {
		return [...(this.summaries.get(keyFor(path, hash)) ?? [])];
	}

	summariesSnapshot(): SummaryRecord[] {
		return [...this.summaries.values()].flatMap((records) => records.map((record) => ({ ...record })));
	}

	calibrationSnapshot(): CalibrationEvent[] {
		return [...this.calibrationEvents];
	}

	private recordReadCalibration(path: string, hash: string, turn: number): void {
		for (const decl of this.declarations.get(keyFor(path, hash)) ?? []) {
			if (decl.turn >= turn) continue;
			if (decl.retention === "disposable" || decl.retention === "routing") {
				this.calibrationEvents.push({
					metric: "declared_disposable_reread",
					declId: decl.id,
					path,
					hash,
					declaredTurn: decl.turn,
					rereadTurn: turn,
				});
			} else if (decl.retention === "semantic" && decl.semanticComplete === true) {
				this.calibrationEvents.push({
					metric: "declared_semantic_verbatim_reread",
					declId: decl.id,
					path,
					hash,
					declaredTurn: decl.turn,
					rereadTurn: turn,
				});
			}
		}
	}
}

function keyFor(path: string, hash: string): string {
	return `${path}#${hash}`;
}
