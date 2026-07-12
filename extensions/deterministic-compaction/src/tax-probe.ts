import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type DeclareNudgeMode = "off" | "every-turn";

export interface TaxProbeTurn {
	type: "ws_tax_probe_turn";
	session_id: string;
	turn: number;
	output_tokens: number | null;
	reasoning_tokens: number | null;
	declaration_turn_overhead: boolean;
	nudge: "every-turn";
}

export class TaxProbeCollector {
	private readonly turns: Omit<TaxProbeTurn, "session_id">[] = [];

	recordAssistant(turn: number, message: { content?: unknown; usage?: Record<string, unknown> }): void {
		this.turns.push({
			type: "ws_tax_probe_turn",
			turn,
			output_tokens: numberOrNull(message.usage?.output),
			reasoning_tokens: numberOrNull(message.usage?.reasoning ?? message.usage?.reasoningTokens),
			declaration_turn_overhead: isDeclarationOnlyTurn(message.content),
			nudge: "every-turn",
		});
	}

	flush(sessionId: string, write: TaxProbeWriter = appendTaxProbeRow, cwd = process.cwd()): string[] {
		const paths: string[] = [];
		for (const turn of this.turns) {
			paths.push(write({ ...turn, session_id: sessionId }, cwd));
		}
		return paths;
	}
}

export type TaxProbeWriter = (row: TaxProbeTurn, cwd: string) => string;

export function appendTaxProbeRow(row: TaxProbeTurn, cwd: string): string {
	const dir = join(cwd, ".taucode", "ws-tax-probe");
	mkdirSync(dir, { recursive: true });
	ensureTaxProbeGitignore(cwd);
	const file = join(dir, `${row.session_id}.jsonl`);
	appendFileSync(file, `${JSON.stringify(row)}\n`, "utf-8");
	return file;
}

export function nudgeTailMessage(): { role: "user"; content: string; timestamp: number } {
	return {
		role: "user",
		content: "[work-semantics-nudge] If you have enough evidence this turn, call declare_work_semantics once with retention intent for the files you used.",
		timestamp: 0,
	};
}

function numberOrNull(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isDeclarationOnlyTurn(content: unknown): boolean {
	if (!Array.isArray(content) || content.length === 0) return false;
	const toolCalls = content.filter((b): b is { type: string; name: string } =>
		typeof b === "object" &&
		b !== null &&
		(b as { type?: unknown }).type === "toolCall" &&
		typeof (b as { name?: unknown }).name === "string",
	);
	if (toolCalls.length === 0) return false;
	const nonEmptyText = content.some((b) =>
		typeof b === "object" &&
		b !== null &&
		(b as { type?: unknown }).type === "text" &&
		typeof (b as { text?: unknown }).text === "string" &&
		((b as { text: string }).text.trim().length > 0),
	);
	return !nonEmptyText && toolCalls.every((tc) => tc.name === "declare_work_semantics");
}

function ensureTaxProbeGitignore(cwd: string): void {
	const path = join(cwd, ".gitignore");
	const entry = ".taucode/ws-tax-probe/";
	if (!existsSync(path)) {
		writeFileSync(path, `${entry}\n`, "utf-8");
		return;
	}
	const current = readFileSync(path, "utf-8");
	if (current.split(/\r?\n/).includes(entry)) return;
	const sep = current.endsWith("\n") || current.length === 0 ? "" : "\n";
	writeFileSync(path, `${current}${sep}${entry}\n`, "utf-8");
}
