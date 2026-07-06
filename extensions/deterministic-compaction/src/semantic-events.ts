import { readFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";
import { parseTestResult } from "./anchor.js";
import { type SemanticLedger } from "./semantic-ledger.js";
import { hashContent, parseDiffstat } from "./trust-ledger.js";

export type SemanticToolEvent =
	| { kind: "test"; command: string; result: string; turn: number }
	| { kind: "read"; path: string; text: string; hash: string; turn: number }
	| { kind: "edit"; path: string; text: string; hash: string; diffstat: string; turn: number }
	| { kind: "edit_failed"; path: string; turn: number };

export interface ToolResultLike {
	toolName: string;
	input: unknown;
	content: Array<{ type: string; text?: unknown }>;
	isError: boolean;
	details?: unknown;
}

export interface SemanticToolEventOptions {
	turn: number;
	semanticAnchorEnabled: boolean;
	getCwd?: () => string;
}

export interface SemanticRecordTargets {
	recordFactsEnabled: boolean;
	trustProtocolEnabled: boolean;
	semanticAnchorEnabled: boolean;
	ledger: SemanticLedger;
	onRecord?: (event: SemanticToolEvent) => void;
}

function patchFromDetails(details: unknown): string | undefined {
	if (typeof details !== "object" || details === null || !("patch" in details)) return undefined;
	const patch = (details as { patch?: unknown }).patch;
	return typeof patch === "string" ? patch : undefined;
}

function textContent(event: ToolResultLike): string {
	return event.content
		.filter((b): b is { type: "text"; text: string } => b.type === "text")
		.map((b) => b.text)
		.join("\n");
}

export function semanticToolEventsFromResult(
	event: ToolResultLike,
	options: SemanticToolEventOptions,
): SemanticToolEvent[] {
	const turn = options.turn;
	const input = event.input as Record<string, unknown>;

	// Preserve the original V3-WS wiring rule: when the anchor is on, bash is
	// consumed as a possible test signal before generic error/path handling.
	if (options.semanticAnchorEnabled && event.toolName === "bash") {
		const command = typeof input.command === "string" ? input.command : "";
		const rec = parseTestResult(command, textContent(event), event.isError);
		return rec ? [{ kind: "test", command: rec.command, result: rec.result, turn }] : [];
	}

	const path = typeof input.path === "string" ? input.path : undefined;

	if (event.isError) {
		return options.semanticAnchorEnabled && path && (event.toolName === "edit" || event.toolName === "write")
			? [{ kind: "edit_failed", path, turn }]
			: [];
	}

	if (!path) return [];

	if (event.toolName === "read") {
		const text = textContent(event);
		return text ? [{ kind: "read", path, text, hash: hashContent(text), turn }] : [];
	}

	if (event.toolName === "edit") {
		const cwd = options.getCwd?.() ?? process.cwd();
		const abs = pathResolve(cwd, path);
		try {
			const text = readFileSync(abs, "utf-8");
			const patch = patchFromDetails(event.details);
			const diffstat = patch ? parseDiffstat(patch) : "edited";
			return [{ kind: "edit", path, text, hash: hashContent(text), diffstat, turn }];
		} catch {
			// File disappeared between tool write and event — skip.
			return [];
		}
	}

	if (event.toolName === "write") {
		const text = typeof input.content === "string" ? input.content : undefined;
		if (!text) return [];
		const lines = text.split("\n").length;
		return [{ kind: "edit", path, text, hash: hashContent(text), diffstat: `+${lines}`, turn }];
	}

	return [];
}

export function recordSemanticToolEvents(events: SemanticToolEvent[], targets: SemanticRecordTargets): void {
	for (const event of events) {
		if (event.kind === "test") {
			if (targets.semanticAnchorEnabled) targets.ledger.recordTest(event.command, event.result, event.turn);
			targets.onRecord?.(event);
			continue;
		}
		if (event.kind === "edit_failed") {
			if (targets.semanticAnchorEnabled) targets.ledger.recordEditFailure(event.path, event.turn);
			targets.onRecord?.(event);
			continue;
		}
		if (event.kind === "read") {
			if (targets.recordFactsEnabled) {
				targets.ledger.recordView(event.path, event.hash, event.turn);
			}
			targets.onRecord?.(event);
			continue;
		}
		if (targets.recordFactsEnabled) {
			targets.ledger.recordEdit(event.path, event.hash, event.turn, event.diffstat);
		}
		targets.onRecord?.(event);
	}
}

export function recordSemanticToolResult(
	event: ToolResultLike,
	options: SemanticToolEventOptions,
	targets: SemanticRecordTargets,
): void {
	recordSemanticToolEvents(semanticToolEventsFromResult(event, options), targets);
}
