import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DeclarationRecord, SummaryRecord } from "./semantic-ledger.js";
import type { SemanticToolEvent } from "./semantic-events.js";

export type PersistableLedgerRecord =
	| { kind: "view"; path: string; hash: string; turn: number }
	| { kind: "edit"; path: string; hash: string; diffstat: string; turn: number }
	| { kind: "edit_failed"; path: string; turn: number }
	| { kind: "test"; command: string; result: string; turn: number }
	| DeclarationRecord
	| SummaryRecord;

export interface LedgerPersistRow {
	session_id: string;
	timestamp: string;
	record: PersistableLedgerRecord;
}

export class LedgerPersistSink {
	private readonly ledgerDir: string;

	constructor(
		private readonly cwd: string,
		private readonly sessionId: string,
	) {
		this.ledgerDir = join(cwd, ".taucode", "ledger");
	}

	append(record: PersistableLedgerRecord): string {
		mkdirSync(this.ledgerDir, { recursive: true });
		ensureLedgerGitignore(this.cwd);
		const file = join(this.ledgerDir, `${this.sessionId}.jsonl`);
		const row: LedgerPersistRow = {
			session_id: this.sessionId,
			timestamp: new Date().toISOString(),
			record,
		};
		appendFileSync(file, `${JSON.stringify(row)}\n`, "utf-8");
		return file;
	}
}

export function persistableFromSemanticEvent(event: SemanticToolEvent): PersistableLedgerRecord {
	if (event.kind === "read") {
		return { kind: "view", path: event.path, hash: event.hash, turn: event.turn };
	}
	if (event.kind === "edit") {
		return { kind: "edit", path: event.path, hash: event.hash, diffstat: event.diffstat, turn: event.turn };
	}
	return event;
}

function ensureLedgerGitignore(cwd: string): void {
	const path = join(cwd, ".gitignore");
	const entry = ".taucode/ledger/";
	if (!existsSync(path)) {
		writeFileSync(path, `${entry}\n`, "utf-8");
		return;
	}
	const current = readFileSync(path, "utf-8");
	if (current.split(/\r?\n/).includes(entry)) return;
	const sep = current.endsWith("\n") || current.length === 0 ? "" : "\n";
	writeFileSync(path, `${current}${sep}${entry}\n`, "utf-8");
}
