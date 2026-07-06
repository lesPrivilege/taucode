import { createHash } from "node:crypto";
import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type DeclarationRecord, type Retention, type SemanticLedger } from "./semantic-ledger.js";

export const DECLARE_WORK_SEMANTICS_TOOL = "declare_work_semantics";

const RETENTIONS = new Set<Retention>(["verbatim", "semantic", "routing", "disposable"]);

export interface DeclarationItemInput {
	path: string;
	hash: string;
	retention: Retention;
	semantic_complete?: boolean;
	summary?: string;
	reason?: string;
}

export interface WorkSemanticsDeclarationInput {
	items: DeclarationItemInput[];
	pending?: string[];
	decisions?: string[];
}

export interface ParsedDeclarationBlock {
	id: string;
	canonicalJson: string;
	records: DeclarationRecord[];
	matched: number;
	unverified: number;
}

export const declarationParameters = Type.Object({
	items: Type.Array(Type.Object({
		path: Type.String({ description: "Workspace-relative path this declaration refers to." }),
		hash: Type.String({ description: "The content hash observed from read/edit evidence." }),
		retention: Type.Union([
			Type.Literal("verbatim"),
			Type.Literal("semantic"),
			Type.Literal("routing"),
			Type.Literal("disposable"),
		]),
		semantic_complete: Type.Optional(Type.Boolean()),
		summary: Type.Optional(Type.String()),
		reason: Type.Optional(Type.String()),
	})),
	pending: Type.Optional(Type.Array(Type.String())),
	decisions: Type.Optional(Type.Array(Type.String())),
});

export function canonicalJson(value: unknown): string {
	return JSON.stringify(sortForCanonicalJson(value));
}

export function declarationId(input: WorkSemanticsDeclarationInput): string {
	return createHash("sha256").update(canonicalJson(input)).digest("hex").slice(0, 12);
}

export function parseWorkSemanticsDeclaration(
	input: WorkSemanticsDeclarationInput,
	ledger: SemanticLedger,
	turn: number,
): ParsedDeclarationBlock {
	const normalized = normalizeDeclarationInput(input);
	const id = declarationId(normalized);
	const records = normalized.items.map((item) => {
		const verified = ledger.get(item.path)?.hash === item.hash;
		const record: DeclarationRecord = {
			kind: "declaration",
			id,
			path: item.path,
			hash: item.hash,
			retention: item.retention,
			verified,
			turn,
			author: "model-inband",
		};
		if (item.semantic_complete !== undefined) record.semanticComplete = item.semantic_complete;
		if (item.summary !== undefined) record.summary = item.summary;
		return record;
	});
	return {
		id,
		canonicalJson: canonicalJson(normalized),
		records,
		matched: records.filter((r) => r.verified).length,
		unverified: records.filter((r) => !r.verified).length,
	};
}

export function registerWorkSemanticsDeclarationTool(
	pi: Pick<ExtensionAPI, "registerTool">,
	ledger: SemanticLedger,
	getTurn: () => number,
	onRecord?: (record: DeclarationRecord, ctx: ExtensionContext) => void,
): void {
	pi.registerTool(defineTool({
		name: DECLARE_WORK_SEMANTICS_TOOL,
		label: "declare work semantics",
		description: "Declare retention intent for files you have read or edited.",
		parameters: declarationParameters,
		executionMode: "sequential",
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const parsed = parseWorkSemanticsDeclaration(params as WorkSemanticsDeclarationInput, ledger, getTurn());
			for (const record of parsed.records) {
				ledger.recordDeclaration(record);
				onRecord?.(record, ctx);
			}
			return {
				content: [{ type: "text", text: `[ws] recorded ${parsed.records.length} declarations (${parsed.matched} matched, ${parsed.unverified} unverified) id ${parsed.id}` }],
				details: {
					id: parsed.id,
					matched: parsed.matched,
					unverified: parsed.unverified,
				},
			};
		},
	}));
}

function normalizeDeclarationInput(input: WorkSemanticsDeclarationInput): WorkSemanticsDeclarationInput {
	if (!input || !Array.isArray(input.items)) throw new Error("work semantics declaration requires items[]");
	const items = input.items.map((item) => {
		if (typeof item.path !== "string" || item.path.length === 0) throw new Error("declaration item path is required");
		if (typeof item.hash !== "string" || item.hash.length === 0) throw new Error("declaration item hash is required");
		if (!RETENTIONS.has(item.retention)) throw new Error(`unknown retention: ${String(item.retention)}`);
		if (item.retention === "semantic" && (typeof item.summary !== "string" || item.summary.length === 0)) {
			throw new Error("semantic declarations require summary");
		}
		const normalized: DeclarationItemInput = {
			path: item.path,
			hash: item.hash,
			retention: item.retention,
		};
		if (item.semantic_complete !== undefined) normalized.semantic_complete = Boolean(item.semantic_complete);
		if (item.summary !== undefined) normalized.summary = item.summary;
		if (item.reason !== undefined) normalized.reason = item.reason;
		return normalized;
	});
	const normalized: WorkSemanticsDeclarationInput = { items };
	if (input.pending !== undefined) normalized.pending = input.pending.filter((p): p is string => typeof p === "string");
	if (input.decisions !== undefined) normalized.decisions = input.decisions.filter((d): d is string => typeof d === "string");
	return normalized;
}

function sortForCanonicalJson(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortForCanonicalJson);
	if (value && typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const key of Object.keys(value as Record<string, unknown>).sort()) {
			const v = (value as Record<string, unknown>)[key];
			if (v !== undefined) out[key] = sortForCanonicalJson(v);
		}
		return out;
	}
	return value;
}
