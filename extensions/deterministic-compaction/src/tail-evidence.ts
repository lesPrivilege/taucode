import { createHash } from "node:crypto";

export type TailEvidenceSource =
	| "trust_hint"
	| "anchor"
	| "placebo"
	| "nudge"
	| "substitution";

export interface TailEvidenceBlock {
	source: TailEvidenceSource;
	line_count: number;
	content_hash: string;
}

export interface TailEvidence {
	turn: number;
	anchor_lines: number;
	anchor_hash: string | null;
	tail_blocks: TailEvidenceBlock[];
}

export function evidenceBlock(source: TailEvidenceSource, content: string): TailEvidenceBlock {
	return {
		source,
		line_count: content.length === 0 ? 0 : content.split(/\r?\n/).length,
		content_hash: hashText(content),
	};
}

export function hashText(content: string): string {
	return createHash("sha256").update(content).digest("hex").slice(0, 16);
}
