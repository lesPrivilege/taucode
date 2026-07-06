export const DEFAULT_PLACEBO_TARGET_TOKENS = 120;
export const NUDGE_TAIL_CONTENT = "[nudge]\nGoal; verify files; finish.";

const PLACEBO_SENTENCE =
	"Maintain a concise working checklist, verify file paths before relying on summaries, and preserve task-critical decisions.";

export function buildPlaceboText(targetTokens: number): string {
	const target = Math.max(1, Math.floor(targetTokens));
	const chunks: string[] = [];
	while (estimatePlaceboTokens(chunks.join(" ")) < target) chunks.push(PLACEBO_SENTENCE);
	return chunks.join(" ");
}

export function placeboTailMessage(targetTokens: number) {
	return {
		role: "system",
		content: `[placebo-reminder]\n${buildPlaceboText(targetTokens)}`,
		timestamp: Date.now(),
	};
}

export function placeboTokenCount(targetTokens: number): number {
	return estimatePlaceboTokens(placeboTailMessage(targetTokens).content);
}

export function compactNudgeTailMessage() {
	return {
		role: "system",
		content: NUDGE_TAIL_CONTENT,
		timestamp: 0,
	};
}

export function estimatePlaceboTokens(text: string): number {
	return Math.ceil(text.length / 4);
}
