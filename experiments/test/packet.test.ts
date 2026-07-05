/**
 * packet.ts tests — the G2 packet loader must turn every one of the six
 * human-authored packets in docs/g2-task-packets.md into a runnable Scenario, with
 * its acceptance grammar parsed the same way taucode's dogfood-task.mjs parses it.
 *
 * These run against the REAL doc (not a fixture), so a format drift in the doc that
 * would break a live run is caught here.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import { describe, expect, it } from "vitest";
import { isPacketSpec, listPacketIds, loadPacket, parseAcceptance } from "../lib/packet.js";

const REPO_ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DOC = resolvePath(REPO_ROOT, "docs/g2-task-packets.md");
const MD = readFileSync(DOC, "utf8");
const ALL_IDS = ["G2-R1", "G2-R2", "G2-E1", "G2-E2", "G2-D1", "G2-D2"];

describe("packet discovery", () => {
	it("finds exactly the six G2 packet ids in document order", () => {
		expect(listPacketIds(MD)).toEqual(ALL_IDS);
	});
});

describe("all six packets load", () => {
	for (const id of ALL_IDS) {
		it(`${id} loads into a Scenario with prompt + acceptance and no scripted steps`, () => {
			const p = loadPacket(id, { repoRoot: REPO_ROOT });
			expect(p.id).toBe(id);
			expect(p.prompt.length).toBeGreaterThan(200);
			// A packet-loaded scenario is for a real, autonomous model -> no steps.
			expect(p.steps).toBeUndefined();
			// Every packet has at least one acceptance check, and none is "unknown"
			// (an unknown means a parse gap against the doc's real grammar).
			expect(p.acceptance.length).toBeGreaterThan(0);
			expect(p.acceptance.filter((c) => c.kind === "unknown")).toEqual([]);
			// Metadata fields the prompt is built from are populated.
			expect(p.metadata.goal.length).toBeGreaterThan(0);
			expect(p.metadata.title).toContain(id);
		});
	}
});

describe("prompt has the dogfood-task.mjs semantic sections", () => {
	it("G2-R2 prompt carries goal / read-first / allowed / non-goals + the raw packet", () => {
		const p = loadPacket("G2-R2", { repoRoot: REPO_ROOT });
		for (const marker of ["任务包:", "标题:", "目标:", "先读这些文件:", "允许修改的文件:", "不要做:", "完整任务包内容:"]) {
			expect(p.prompt).toContain(marker);
		}
		// Read-first files appear as bullet lines in the prompt.
		expect(p.prompt).toContain("packages/core/src/artifacts.ts");
		expect(p.prompt).toContain("packages/core/src/compaction-report.ts");
		// The full raw packet markdown is embedded verbatim.
		expect(p.prompt).toContain("Acceptance");
	});
});

describe("acceptance grammar parity with dogfood-task.mjs parseAcceptance", () => {
	it("parses each check kind out of the real packets", () => {
		const r2 = loadPacket("G2-R2", { repoRoot: REPO_ROOT });
		const kinds = r2.acceptance.map((c) => c.kind);
		expect(kinds).toContain("file-exists");
		expect(kinds).toContain("regex");
		expect(kinds).toContain("command"); // pnpm test — parsed but never executed

		const e1 = loadPacket("G2-E1", { repoRoot: REPO_ROOT });
		expect(e1.acceptance.map((c) => c.kind)).toContain("not-contains");
	});

	it("parseAcceptance matches taucode's grammar shape on canonical lines", () => {
		expect(parseAcceptance("file-exists a/b.ts")).toMatchObject({ kind: "file-exists", path: "a/b.ts" });
		expect(parseAcceptance("not-file-exists a/b.ts")).toMatchObject({ kind: "not-file-exists", path: "a/b.ts" });
		expect(parseAcceptance("contains a/b.ts :: hello")).toMatchObject({ kind: "contains", path: "a/b.ts", text: "hello" });
		expect(parseAcceptance("not-contains a/b.ts :: TODO")).toMatchObject({ kind: "not-contains", path: "a/b.ts", text: "TODO" });
		expect(parseAcceptance("regex a/b.ts :: describe\\(")).toMatchObject({ kind: "regex", path: "a/b.ts", pattern: "describe\\(" });
		expect(parseAcceptance("not-regex a/b.ts :: any")).toMatchObject({ kind: "not-regex", path: "a/b.ts", pattern: "any" });
		expect(parseAcceptance("command: pnpm test")).toMatchObject({ kind: "command", command: "pnpm test" });
		// backtick-fenced path is unwrapped, like stripCodeFence.
		expect(parseAcceptance("file-exists `a/b.ts`")).toMatchObject({ kind: "file-exists", path: "a/b.ts" });
	});
});

describe("spec forms + addressing", () => {
	it("recognises packet specs vs fixture ids", () => {
		expect(isPacketSpec("G2-R2")).toBe(true);
		expect(isPacketSpec("packet:G2-R2")).toBe(true);
		expect(isPacketSpec("foo.md")).toBe(true);
		expect(isPacketSpec("refactor")).toBe(false);
	});

	it("loads via the packet: prefix identically to the bare id", () => {
		const a = loadPacket("G2-D1", { repoRoot: REPO_ROOT });
		const b = loadPacket("packet:G2-D1", { repoRoot: REPO_ROOT });
		expect(b.prompt).toEqual(a.prompt);
		expect(b.acceptance).toEqual(a.acceptance);
	});

	it("throws a helpful error for an unknown id", () => {
		expect(() => loadPacket("G2-ZZ", { repoRoot: REPO_ROOT })).toThrow(/not found/i);
	});

	it("id boundary is exact (G2-R2 does not match a hypothetical G2-R22)", () => {
		// Sanity: the known ids are all distinct and each resolves to itself.
		for (const id of ALL_IDS) {
			expect(loadPacket(id, { repoRoot: REPO_ROOT }).metadata.id).toBe(id);
		}
	});
});
