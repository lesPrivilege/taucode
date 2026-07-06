import { createHash } from "node:crypto";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { CompactionDiffEntry } from "./compaction-core.js";
import { hashContent } from "./trust-ledger.js";
import type { SemanticLedger, SummaryProviderCost } from "./semantic-ledger.js";
import { canonicalJson } from "./work-semantics-declaration.js";

export interface SidebandSummaryInput {
	path: string;
	hash: string;
	content: string;
	rawTokens: number;
	turn: number;
	model: string;
}

export interface SidebandSummaryOutput {
	text: string;
	providerCost: SummaryProviderCost;
}

export type SidebandSummarizer = (input: SidebandSummaryInput) => Promise<SidebandSummaryOutput>;

export interface ScheduleSidebandSummariesOptions {
	messages: AgentMessage[];
	diffs: readonly CompactionDiffEntry[];
	ledger: SemanticLedger;
	turn: number;
	minTokens: number;
	model: string;
	summarize?: SidebandSummarizer;
	onSummary?: (record: Parameters<SemanticLedger["recordSummary"]>[0]) => void;
	onTask?: (task: Promise<void>) => void;
}

export interface SidebandScheduleResult {
	scheduled: number;
}

export function summaryId(input: {
	path: string;
	hash: string;
	text: string;
	sourceHashes: string[];
	model: string;
}): string {
	return createHash("sha256").update(canonicalJson(input)).digest("hex").slice(0, 12);
}

export function scheduleSidebandSummaries(options: ScheduleSidebandSummariesOptions): SidebandScheduleResult {
	if (!options.summarize) return { scheduled: 0 };
	const views = readViewsByToolCallId(options.messages);
	let scheduled = 0;
	for (const diff of options.diffs) {
		if (diff.toolName !== "read" || !diff.path || diff.rawTokens < options.minTokens) continue;
		const view = views.get(diff.toolCallId);
		if (!view) continue;
		const hash = hashContent(view);
		const input: SidebandSummaryInput = {
			path: diff.path,
			hash,
			content: view,
			rawTokens: diff.rawTokens,
			turn: options.turn,
			model: options.model,
		};
		scheduled++;
		const task = options.summarize(input)
			.then((out) => {
				const sourceHashes = [hash];
				const record = {
					kind: "summary",
					id: summaryId({ path: diff.path!, hash, text: out.text, sourceHashes, model: out.providerCost.model }),
					path: diff.path!,
					hash,
					text: out.text,
					sourceHashes,
					turn: options.turn,
					author: "sideband",
					providerCost: out.providerCost,
				} as const;
				options.ledger.recordSummary(record);
				options.onSummary?.(record);
			})
			.catch(() => {
				// Sideband is best-effort and off the critical path.
			});
		options.onTask?.(task);
	}
	return { scheduled };
}

function readViewsByToolCallId(messages: AgentMessage[]): Map<string, string> {
	const out = new Map<string, string>();
	for (const msg of messages) {
		const m = msg as { role?: string; toolName?: string; toolCallId?: string; content?: unknown };
		if (m.role !== "toolResult" || m.toolName !== "read" || typeof m.toolCallId !== "string") continue;
		const content = m.content;
		if (typeof content === "string") {
			out.set(m.toolCallId, content);
			continue;
		}
		if (Array.isArray(content)) {
			const text = content
				.filter((b): b is { type: "text"; text: string } =>
					typeof b === "object" && b !== null && (b as { type?: unknown }).type === "text" && typeof (b as { text?: unknown }).text === "string",
				)
				.map((b) => b.text)
				.join("\n");
			if (text) out.set(m.toolCallId, text);
		}
	}
	return out;
}
