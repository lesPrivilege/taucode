/**
 * packet.ts — turn a human-authored G2 task packet (`docs/g2-task-packets.md`)
 * into a runnable `Scenario`.
 *
 * This is the ecode-side equivalent of taucode's
 * `scripts/dogfood-task.mjs prompt --packet` (the missing bridge the 2026-07-05
 * harness review flagged): a packet `.md` had no way to become a `Scenario` with a
 * real prompt, so none of the six G2 packets could run through `run.ts --scenario`.
 *
 * PARSING is a semantic mirror of dogfood-task.mjs's
 * `extractSection`/`extractListItems`/`extractPacketMetadata` (fields:
 * Goal/Read first/Allowed/Non-goals/Validation) and `acceptanceLines`/
 * `parseAcceptance` (the static-check grammar), RECONCILED for the two format
 * differences ecode's packets actually have vs taucode's template — verified
 * against the real doc, not assumed:
 *
 *   1. Fullwidth colon. ecode headings use `：` (U+FF1A) and put the field VALUE
 *      inline on the same line (`Goal：把 910 行…`), whereas taucode uses ASCII `:`
 *      with the value on the following line(s). Both are accepted here.
 *   2. Packet sectioning. taucode packets are one file each, titled `# Dogfood
 *      Task: <slug>`. ecode ships all six in ONE doc, each a `## G2-<id> · <title>`
 *      section, and `Acceptance：` is a fullwidth-colon FIELD line, not a
 *      `## Acceptance` ATX heading. So a packet is addressed by id (`G2-R2`) and
 *      sliced out of the shared doc; the acceptance list is the bullet run that
 *      follows the `Acceptance：` line up to the next `##` (or a later field line).
 *
 * The acceptance grammar itself is byte-for-byte the same as taucode's:
 *   file-exists / not-file-exists <path>
 *   contains / not-contains <path> :: <text>
 *   regex / not-regex <path> :: <pattern>
 *   command: <cmd>
 * `command:` checks are parsed and carried but NEVER executed here (see the
 * acceptance-runner and the human decision in G2-D1's 裁定).
 */

import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve as resolvePath } from "node:path";
import type { Scenario } from "./scenario.js";

/** Default location of the shared six-packet doc, relative to the repo root. */
export const DEFAULT_PACKETS_DOC = "docs/g2-task-packets.md";

// --- acceptance-check model (mirrors dogfood-task.mjs parseAcceptance) ---------

export type StaticCheckKind =
	| "file-exists"
	| "not-file-exists"
	| "contains"
	| "not-contains"
	| "regex"
	| "not-regex";

export interface FileExistsCheck {
	kind: "file-exists" | "not-file-exists";
	path: string;
	raw: string;
}
export interface ContainsCheck {
	kind: "contains" | "not-contains";
	path: string;
	text: string;
	raw: string;
}
export interface RegexCheck {
	kind: "regex" | "not-regex";
	path: string;
	pattern: string;
	raw: string;
}
export interface CommandCheck {
	kind: "command";
	command: string;
	raw: string;
}
export interface UnknownCheck {
	kind: "unknown";
	raw: string;
}

export type AcceptanceCheck = FileExistsCheck | ContainsCheck | RegexCheck | CommandCheck | UnknownCheck;

/** A parsed packet's structured metadata (mirrors extractPacketMetadata). */
export interface PacketMetadata {
	/** Packet id, e.g. "G2-R2". */
	id: string;
	/** Full section title, e.g. "G2-R2 · 补 artifacts 与 compaction-report 的单元测试". */
	title: string;
	goal: string;
	readFirst: string[];
	allowed: string[];
	nonGoals: string[];
	validation: string[];
}

/**
 * A packet-loaded Scenario. It IS a `Scenario` (satisfies everything run.ts's
 * getScenario-equivalent consumes: id, description, prompt, optional steps) plus a
 * superset carrying the parsed metadata and acceptance checks the acceptance
 * runner needs. `steps` is intentionally absent — a real model chooses its own
 * actions; the mock defaults it to `[]`.
 */
export interface PacketScenario extends Scenario {
	metadata: PacketMetadata;
	/** Static + command checks, in packet order (command checks are never run). */
	acceptance: AcceptanceCheck[];
	/** Raw markdown of just this packet's section (fed verbatim into the prompt). */
	packetMarkdown: string;
	/** Source doc + id this was loaded from (recorded for provenance). */
	source: { doc: string; id: string };
}

// --- section slicing -----------------------------------------------------------

/** Strip a wrapping single-backtick code fence (mirrors stripCodeFence). */
function stripCodeFence(value: string): string {
	const trimmed = value.trim();
	if (trimmed.startsWith("`") && trimmed.endsWith("`") && trimmed.length >= 2) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

/**
 * Clean a single LIST item (a file path / non-goal clause). Beyond stripCodeFence,
 * ecode list items often carry a leading backtick-fenced path followed by a
 * parenthetical annotation, e.g. `` `foo.ts`（风格基准） ``. Prefer the fenced
 * path when present; otherwise drop a trailing （…） annotation. Falls back to the
 * fence-stripped whole. This only tidies the STRUCTURED fields — the verbatim
 * packet markdown still reaches the model in full.
 */
function cleanListItem(value: string): string {
	const trimmed = value.trim();
	// Leading `path` fence with trailing annotation -> keep the path.
	const leadFence = trimmed.match(/^`([^`]+)`\s*(.*)$/);
	if (leadFence) return leadFence[1].trim();
	// Trailing （…） or (…) annotation on an otherwise-plain item -> drop it.
	const noAnno = trimmed.replace(/\s*[（(][^）)]*[）)]\s*$/, "").trim();
	return stripCodeFence(noAnno || trimmed);
}

/** True for a line that opens a new `## …` packet section. */
function isPacketHeading(line: string): boolean {
	return /^##\s+\S/.test(line);
}

/**
 * Slice out the markdown for one packet id from the shared doc. A packet section
 * runs from its `## …<id>…` heading up to the next `## ` heading (or EOF). The
 * `---` horizontal rules between packets are left in the slice harmlessly.
 */
function slicePacketSection(markdown: string, id: string): string | undefined {
	const lines = markdown.split(/\r?\n/);
	// The heading text contains the id (e.g. "## G2-R2 · …"); match on a word
	// boundary so "G2-R2" doesn't also match a hypothetical "G2-R22".
	const idPattern = new RegExp(`(?:^|[^\\w-])${escapeRegExp(id)}(?![\\w-])`);
	let start = -1;
	for (let i = 0; i < lines.length; i++) {
		if (isPacketHeading(lines[i]) && idPattern.test(lines[i])) {
			start = i;
			break;
		}
	}
	if (start < 0) return undefined;
	let end = lines.length;
	for (let i = start + 1; i < lines.length; i++) {
		if (isPacketHeading(lines[i])) {
			end = i;
			break;
		}
	}
	return lines.slice(start, end).join("\n").trim();
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Every `## G2-…` packet id present in the doc, in document order. */
export function listPacketIds(markdown: string): string[] {
	const ids: string[] = [];
	for (const line of markdown.split(/\r?\n/)) {
		if (!isPacketHeading(line)) continue;
		const m = line.match(/(G2-[A-Za-z0-9]+)/);
		if (m) ids.push(m[1]);
	}
	return ids;
}

// --- field extraction (mirrors extractSection / extractListItems) --------------

/**
 * A field-heading matcher. ecode fields are `<Name>：<value…>` (fullwidth colon,
 * value inline); taucode's are `<Name>:` / `## <Name>` (value on next lines). This
 * matches both styles and, for the ecode style, captures the inline remainder.
 *
 * `names` is an alternation of accepted heading spellings, e.g.
 * `Read first|Read` — matched case-insensitively.
 */
function fieldRegex(names: string): RegExp {
	// Optional leading "## ", the name, then either a fullwidth or ASCII colon.
	// Group 1 = the inline remainder (ecode style) or "" (taucode style).
	return new RegExp(`^(?:#{1,3}\\s*)?(?:${names})\\s*[:：]\\s*(.*)$`, "i");
}

/** Lines that terminate a field's body: a new heading, or another field line. */
const ANY_FIELD_NAMES = "Goal|Read first|Read|Allowed files|Allowed|Non-goals|Validation|Acceptance|Review";
const FIELD_TERMINATOR = new RegExp(`^(?:#{1,3}\\s+\\S|(?:${ANY_FIELD_NAMES})\\s*[:：])`, "i");

/**
 * Extract a field's text. Returns the inline remainder (ecode style) joined with
 * any following body lines up to the next field/heading (taucode style). Mirrors
 * extractSection but colon-and-inline aware.
 */
function extractField(markdown: string, names: string): string {
	const lines = markdown.split(/\r?\n/);
	const head = fieldRegex(names);
	const start = lines.findIndex((l) => head.test(l));
	if (start < 0) return "";
	const inline = (lines[start].match(head)?.[1] ?? "").trim();
	const body: string[] = [];
	if (inline) body.push(inline);
	for (let i = start + 1; i < lines.length; i++) {
		if (FIELD_TERMINATOR.test(lines[i])) break;
		body.push(lines[i]);
	}
	return body.join("\n").trim();
}

/**
 * Extract a field as a list. ecode packets write list-style fields two ways:
 *   - inline, delimiter-separated: `Read first：a、b、c` (Chinese comma 、 or ,)
 *   - bullet lines: `- a` / `- b`
 * Both are supported; each item is code-fence-stripped. Mirrors extractListItems.
 */
function extractFieldList(markdown: string, names: string): string[] {
	const section = extractField(markdown, names);
	if (!section) return [];
	const lines = section.split(/\r?\n/);
	const bullets = lines.filter((l) => /^\s*-\s+/.test(l));
	if (bullets.length > 0) {
		return bullets.map((l) => cleanListItem(l.replace(/^\s*-\s+/, ""))).filter(Boolean);
	}
	// No bullets: split the (possibly inline) text on Chinese/ASCII list delimiters.
	// Semicolons (；/;) separate Non-goals clauses; 、 and , separate file lists.
	return section
		.split(/[、,；;]|\s{2,}/)
		.map((s) => cleanListItem(s))
		.filter(Boolean);
}

// --- acceptance parsing (mirrors acceptanceLines / parseAcceptance) ------------

/**
 * The bullet run under the `Acceptance：` field, up to the next `##` heading. In
 * ecode's doc `Acceptance：` is a field line (fullwidth colon), not `## Acceptance`,
 * so this keys on the field line then collects the following `- …` bullets — the
 * semantic equivalent of taucode's acceptanceLines.
 */
function acceptanceLines(packetMarkdown: string): string[] {
	const lines = packetMarkdown.split(/\r?\n/);
	const head = fieldRegex("Acceptance");
	const start = lines.findIndex((l) => head.test(l));
	if (start < 0) return [];
	const items: string[] = [];
	// An inline value on the Acceptance line itself (rare) is also honoured.
	const inline = (lines[start].match(head)?.[1] ?? "").trim();
	if (inline) items.push(inline);
	for (let i = start + 1; i < lines.length; i++) {
		const line = lines[i];
		if (isPacketHeading(line)) break;
		const m = line.match(/^\s*-\s+(.+?)\s*$/);
		if (m) items.push(m[1].trim());
	}
	return items;
}

/** Parse one acceptance line into a check (mirrors parseAcceptance exactly). */
export function parseAcceptance(line: string): AcceptanceCheck {
	const command = line.match(/^command:\s*(.+)$/i);
	if (command) return { kind: "command", command: stripCodeFence(command[1]), raw: line };

	const fileExists = line.match(/^(file-exists|not-file-exists)\s+(.+)$/i);
	if (fileExists) {
		return { kind: fileExists[1].toLowerCase() as FileExistsCheck["kind"], path: stripCodeFence(fileExists[2]), raw: line };
	}

	const regex = line.match(/^(regex|not-regex)\s+(.+?)\s+::\s+(.+)$/i);
	if (regex) {
		return {
			kind: regex[1].toLowerCase() as RegexCheck["kind"],
			path: stripCodeFence(regex[2]),
			pattern: stripCodeFence(regex[3]),
			raw: line,
		};
	}

	const contains = line.match(/^(contains|not-contains)\s+(.+?)\s+::\s+(.+)$/i);
	if (contains) {
		return {
			kind: contains[1].toLowerCase() as ContainsCheck["kind"],
			path: stripCodeFence(contains[2]),
			text: stripCodeFence(contains[3]),
			raw: line,
		};
	}

	return { kind: "unknown", raw: line };
}

function extractMetadata(packetMarkdown: string, id: string): PacketMetadata {
	const titleMatch = packetMarkdown.match(/^##\s+(.+)$/m);
	return {
		id,
		title: titleMatch ? titleMatch[1].trim() : id,
		goal: extractField(packetMarkdown, "Goal"),
		readFirst: extractFieldList(packetMarkdown, "Read first|Read"),
		allowed: extractFieldList(packetMarkdown, "Allowed files|Allowed"),
		nonGoals: extractFieldList(packetMarkdown, "Non-goals"),
		validation: extractFieldList(packetMarkdown, "Validation"),
	};
}

// --- prompt assembly (semantic equivalent of dogfood-task.mjs cmdPrompt) -------

/**
 * Build the opening user turn for a packet. Semantically equivalent to
 * dogfood-task.mjs `cmdPrompt`: title, goal, read-first list, allowed list,
 * non-goals list, then the full raw packet markdown, then a closing "run the
 * acceptance checks before reporting done" instruction. The closing section is
 * ADAPTED — it references this harness's own acceptance runner (run.ts records the
 * static checks automatically post-run) instead of taucode's `dogfood-task.mjs
 * status/check`, which does not exist for these packets.
 */
export function buildPacketPrompt(meta: PacketMetadata, packetMarkdown: string): string {
	const s: string[] = [];
	s.push(`任务包: ${meta.id}`);
	s.push("");
	s.push(`标题: ${meta.title}`);
	s.push("");

	if (meta.goal) {
		s.push("目标:");
		s.push(meta.goal);
		s.push("");
	}
	if (meta.readFirst.length > 0) {
		s.push("先读这些文件:");
		for (const f of meta.readFirst) s.push(`  - ${f}`);
		s.push("");
	}
	if (meta.allowed.length > 0) {
		s.push("允许修改的文件:");
		for (const f of meta.allowed) s.push(`  - ${f}`);
		s.push("");
	}
	if (meta.nonGoals.length > 0) {
		s.push("不要做:");
		for (const g of meta.nonGoals) s.push(`  - ${g}`);
		s.push("");
	}

	s.push("完整任务包内容:");
	s.push("---");
	s.push(packetMarkdown.trim());
	s.push("---");
	s.push("");

	// Adapted closing section: the harness's acceptance runner replaces taucode's
	// dogfood-task.mjs status/check invocations (which don't exist here).
	s.push("完成前:");
	s.push("  - 只修改 Allowed 列出的文件，不要触碰 Non-goals 禁止的范围。");
	s.push("  - 运行结束后 harness 会自动执行本包 Acceptance 里的静态检查");
	s.push("    (file-exists / contains / regex 及其否定式) 并记录每条 {check, pass}。");
	s.push("  - command: 类检查不自动执行，留给人工/compare 复核。");
	s.push("");
	s.push("报告只包含: (1) 修改文件列表 (2) acceptance 结果 (3) 运行过的验证命令。");

	return s.join("\n");
}

// --- public loaders ------------------------------------------------------------

/** Load + parse a packet section out of already-read markdown. */
export function parsePacket(markdown: string, id: string, source: { doc: string; id: string }): PacketScenario {
	const packetMarkdown = slicePacketSection(markdown, id);
	if (packetMarkdown === undefined) {
		const known = listPacketIds(markdown).join(", ");
		throw new Error(`Packet "${id}" not found in ${source.doc}. Known packet ids: ${known || "(none)"}`);
	}
	const metadata = extractMetadata(packetMarkdown, id);
	const acceptance = acceptanceLines(packetMarkdown).map(parseAcceptance);
	if (acceptance.length === 0) {
		throw new Error(`Packet "${id}" has no Acceptance checks (${source.doc}).`);
	}
	return {
		id,
		description: metadata.title,
		prompt: buildPacketPrompt(metadata, packetMarkdown),
		// steps intentionally omitted: a real model chooses its own actions.
		metadata,
		acceptance,
		packetMarkdown,
		source,
	};
}

/**
 * Load a packet by id from the shared doc (default `docs/g2-task-packets.md`), or
 * from a standalone single-packet `.md` file.
 *
 * `spec` forms:
 *   - "G2-R2"                      → slice G2-R2 out of `docParam ?? DEFAULT_PACKETS_DOC`
 *   - "packet:G2-R2"              → same, the `packet:` prefix run.ts uses on --scenario
 *   - "/abs/or/rel/path.md"       → treat the file as one packet (first `##`/`#` section)
 *   - "/path.md#G2-R2"            → a specific id inside an explicit file
 *
 * `repoRoot` anchors relative doc/file paths (default process.cwd()).
 */
export function loadPacket(spec: string, opts: { repoRoot?: string; doc?: string } = {}): PacketScenario {
	const repoRoot = opts.repoRoot ?? process.cwd();
	let raw = spec.startsWith("packet:") ? spec.slice("packet:".length) : spec;

	// Explicit "file#id" form.
	let fileHint: string | undefined;
	let idHint: string | undefined;
	const hash = raw.lastIndexOf("#");
	if (hash > 0 && raw.slice(hash + 1).startsWith("G2-")) {
		idHint = raw.slice(hash + 1);
		raw = raw.slice(0, hash);
	}

	if (raw.endsWith(".md")) {
		fileHint = isAbsolute(raw) ? raw : resolvePath(repoRoot, raw);
	}

	// Case 1: a standalone packet file.
	if (fileHint) {
		if (!existsSync(fileHint)) throw new Error(`Packet file not found: ${fileHint}`);
		const markdown = readFileSync(fileHint, "utf8");
		const id = idHint ?? listPacketIds(markdown)[0] ?? firstSectionId(markdown);
		if (!id) throw new Error(`Could not determine a packet id in ${fileHint}; pass "<file>#<id>".`);
		return parsePacket(markdown, id, { doc: fileHint, id });
	}

	// Case 2: an id addressed into the shared doc.
	const doc = opts.doc ?? DEFAULT_PACKETS_DOC;
	const docPath = isAbsolute(doc) ? doc : resolvePath(repoRoot, doc);
	if (!existsSync(docPath)) throw new Error(`Packets doc not found: ${docPath}`);
	const markdown = readFileSync(docPath, "utf8");
	return parsePacket(markdown, idHint ?? raw, { doc: docPath, id: idHint ?? raw });
}

/** First `#`/`##` section's heading text, used as an id fallback for lone files. */
function firstSectionId(markdown: string): string | undefined {
	const m = markdown.match(/^#{1,2}\s+(.+)$/m);
	return m ? m[1].trim() : undefined;
}

/** Does `spec` look like a packet reference (vs a fixture id like "refactor")? */
export function isPacketSpec(spec: string): boolean {
	return spec.startsWith("packet:") || spec.endsWith(".md") || /^G2-[A-Za-z0-9]+/.test(spec);
}
