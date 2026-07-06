import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { CompactionDiffEntry } from "./compaction-core.js";
import type { DeclarationRecord, SemanticLedger, SummaryRecord } from "./semantic-ledger.js";

export interface ProjectionPolicyConfig {
	enabled: boolean;
	verbatimWindow: number;
}

export interface FormSubstitution {
	path: string;
	hash: string;
	text: string;
	recordId: string;
	source: "declaration" | "summary";
}

export interface ProjectionPolicyDecision {
	protectPaths: Set<string>;
	formSubstitutions: Map<string, FormSubstitution>;
	policyEvents: string[];
}

export function buildProjectionPolicy(
	ledger: SemanticLedger | undefined,
	turn: number,
	config: ProjectionPolicyConfig,
): ProjectionPolicyDecision {
	const decision: ProjectionPolicyDecision = {
		protectPaths: new Set(),
		formSubstitutions: new Map(),
		policyEvents: [],
	};
	if (!config.enabled || !ledger) return decision;

	const contradictedDecls = new Set(ledger.calibrationSnapshot().map((event) => event.declId));
	for (const decl of ledger.declarationsSnapshot()) {
		if (!isCurrentlyVerified(ledger, decl)) continue;
		if (decl.retention === "verbatim" && turn - decl.turn <= config.verbatimWindow) {
			decision.protectPaths.add(decl.path);
			decision.policyEvents.push(`protect:${decl.id}:${decl.path}#${decl.hash}`);
			continue;
		}
		if (
			decl.retention === "semantic" &&
			decl.semanticComplete === true &&
			decl.summary &&
			!contradictedDecls.has(decl.id) &&
			!decision.formSubstitutions.has(decl.path)
		) {
			decision.formSubstitutions.set(decl.path, {
				path: decl.path,
				hash: decl.hash,
				text: decl.summary,
				recordId: decl.id,
				source: "declaration",
			});
			decision.policyEvents.push(`substitute:declaration:${decl.id}:${decl.path}#${decl.hash}`);
		}
	}

	for (const summary of ledger.summariesSnapshot()) {
		if (!isCurrentSummary(ledger, summary)) continue;
		if (decision.formSubstitutions.has(summary.path)) continue;
		decision.formSubstitutions.set(summary.path, {
			path: summary.path,
			hash: summary.hash,
			text: summary.text,
			recordId: summary.id,
			source: "summary",
		});
		decision.policyEvents.push(`substitute:summary:${summary.id}:${summary.path}#${summary.hash}`);
	}

	return decision;
}

export function applyFormSubstitutions(
	messages: AgentMessage[],
	diffs: CompactionDiffEntry[],
	substitutions: Map<string, FormSubstitution>,
): AgentMessage[] {
	if (substitutions.size === 0 || diffs.length === 0) return messages;
	const byToolCall = new Map<string, FormSubstitution>();
	for (const diff of diffs) {
		if (diff.kind !== "tool_result" || diff.toolName !== "read" || !diff.path) continue;
		const subst = substitutions.get(diff.path);
		if (subst) byToolCall.set(diff.toolCallId, subst);
	}
	if (byToolCall.size === 0) return messages;

	let changed = false;
	const next = messages.map((message) => {
		const toolCallId = (message as { toolCallId?: unknown }).toolCallId;
		if (typeof toolCallId !== "string") return message;
		const subst = byToolCall.get(toolCallId);
		if (!subst) return message;
		const replaced = replaceToolResultText(message, formatSubstitution(subst));
		if (replaced !== message) changed = true;
		return replaced;
	});
	return changed ? next : messages;
}

function isCurrentlyVerified(ledger: SemanticLedger, decl: DeclarationRecord): boolean {
	return decl.verified && ledger.get(decl.path)?.hash === decl.hash;
}

function isCurrentSummary(ledger: SemanticLedger, summary: SummaryRecord): boolean {
	return ledger.get(summary.path)?.hash === summary.hash;
}

function formatSubstitution(subst: FormSubstitution): string {
	return `[work-semantics ${subst.source}]\n${subst.path}#${subst.hash}\n${subst.text}`;
}

function replaceToolResultText(message: AgentMessage, text: string): AgentMessage {
	if ((message as { role?: string }).role === "toolResult") {
		const blocks = (message as { content?: unknown }).content;
		if (!Array.isArray(blocks)) return message;
		return {
			...message,
			content: blocks.map((block) =>
				typeof block === "object" && block !== null && (block as { type?: unknown }).type === "text"
					? { ...block, text }
					: block,
			),
		} as AgentMessage;
	}
	if ((message as { role?: string }).role === "tool") {
		return { ...message, content: text } as AgentMessage;
	}
	return message;
}
