/**
 * FP-1 — failure-fingerprint detectors over run JSONL (design:
 * docs/fingerprint-detectors-design-2026-07-08.md). Same discipline as the
 * gates: pure functions, boolean + machine-readable reasons, no editorialising.
 *
 * Two fixture layers:
 *   - contrived JSONL in a temp dir pinning exact per-class semantics and the
 *     provisional parameter boundaries;
 *   - verbatim copies of four REAL runs under test/fixtures/fingerprints/
 *     (provenance in their `# source:` header line) as golden anchors, chosen
 *     by corpus scan, not narrative memory.
 */

import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FINGERPRINT_PARAMS_PROVISIONAL, fingerprintFile } from "../lib/fingerprints.js";

const FIXDIR = fileURLToPath(new URL("./fixtures/fingerprints/", import.meta.url));
const RESULTS = fileURLToPath(new URL("../results/", import.meta.url));

let dir: string;
beforeAll(() => {
	dir = mkdtempSync(join(tmpdir(), "ecode-fingerprints-"));
});
afterAll(() => {
	rmSync(dir, { recursive: true, force: true });
});

function fixture(name: string, rows: object[]): string {
	const p = join(dir, name);
	writeFileSync(p, rows.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf-8");
	return p;
}

function meta(arm: string, mech: { native?: boolean; seamA?: boolean; seamB?: boolean }) {
	return {
		type: "meta",
		arm,
		arm_label: `arm ${arm}`,
		scenario: "fx",
		provider: "mock",
		mechanism: {
			native_compaction_enabled: mech.native ?? false,
			seam_a_installed: mech.seamA ?? false,
			seam_b_installed: mech.seamB ?? false,
		},
		data_kind: "synthetic-smoke-fixture",
	};
}

/** Minimal turn row; override the fields a case cares about. */
function turn(n: number, over: Record<string, unknown> = {}) {
	return {
		type: "turn",
		turn: n,
		input_tokens: 1000,
		output_tokens: 50,
		tool_calls: 1,
		read_calls: 0,
		re_reads: 0,
		compacted_path_re_reads: 0,
		projected: false,
		cache_read_tokens: null,
		...over,
	};
}

describe("(a) information-gap", () => {
	it("triggers when any compacted-path re-read happened, locating the gap turns", () => {
		const p = fixture("a-pos.jsonl", [
			meta("C", { seamA: true }),
			turn(1),
			turn(2, { read_calls: 2, re_reads: 1, compacted_path_re_reads: 1 }),
			turn(3),
			turn(4, { read_calls: 1, re_reads: 1, compacted_path_re_reads: 1 }),
		]);
		const r = fingerprintFile(p).a;
		expect(r.triggered).toBe(true);
		expect(r.proxy).toBe(false);
		expect(r.evidence.totalCompactedPathReReads).toBe(2);
		expect(r.evidence.gapTurns).toEqual([2, 4]);
	});

	it("does not trigger with zero compacted-path re-reads", () => {
		const p = fixture("a-neg.jsonl", [meta("C", { seamA: true }), turn(1, { read_calls: 3, re_reads: 2 })]);
		expect(fingerprintFile(p).a.triggered).toBe(false);
	});
});

describe("(b) summary-defect", () => {
	it("reports signal-absent (and never triggers) when no failed-edit fields exist", () => {
		const p = fixture("b-absent.jsonl", [meta("C", { seamA: true }), turn(1), turn(2)]);
		const r = fingerprintFile(p).b;
		expect(r.triggered).toBe(false);
		expect(r.signalAbsent).toBe(true);
	});

	it("triggers when failed_edits_on_compacted_paths > 0 (future schema increment)", () => {
		const p = fixture("b-pos.jsonl", [
			meta("C", { seamA: true }),
			turn(1, { failed_edit_calls: 1, failed_edits_on_compacted_paths: 1 }),
		]);
		const r = fingerprintFile(p).b;
		expect(r.signalAbsent).toBe(false);
		expect(r.triggered).toBe(true);
		expect(r.evidence.failedEditsOnCompactedPaths).toBe(1);
	});

	it("signal present but zero failed edits does not trigger", () => {
		const p = fixture("b-zero.jsonl", [
			meta("C", { seamA: true }),
			turn(1, { failed_edit_calls: 0, failed_edits_on_compacted_paths: 0 }),
		]);
		const r = fingerprintFile(p).b;
		expect(r.signalAbsent).toBe(false);
		expect(r.triggered).toBe(false);
	});
});

describe("(c) loop-pathology (PROXY)", () => {
	const allReRead = (n: number) => turn(n, { read_calls: 1, re_reads: 1 });

	it("triggers at a streak of loopStreakMin consecutive all-re-read turns and is marked proxy", () => {
		const p = fixture("c-pos.jsonl", [meta("C", { seamA: true }), allReRead(1), allReRead(2), allReRead(3), allReRead(4)]);
		const r = fingerprintFile(p).c;
		expect(r.triggered).toBe(true);
		expect(r.proxy).toBe(true);
		expect(r.evidence.maxStreak).toBe(4);
		expect(r.evidence.streakTurns).toEqual([1, 4]);
	});

	it("streak of loopStreakMin-1 does not trigger", () => {
		const p = fixture("c-boundary.jsonl", [meta("C", { seamA: true }), allReRead(1), allReRead(2), allReRead(3)]);
		expect(fingerprintFile(p).c.triggered).toBe(false);
	});

	it("a fresh read (or a no-read turn) breaks the streak", () => {
		const p = fixture("c-broken.jsonl", [
			meta("C", { seamA: true }),
			allReRead(1),
			allReRead(2),
			turn(3, { read_calls: 2, re_reads: 1 }), // one fresh read → not an all-re-read turn
			allReRead(4),
			allReRead(5),
			turn(6), // no reads → also breaks
			allReRead(7),
		]);
		const r = fingerprintFile(p).c;
		expect(r.triggered).toBe(false);
		expect(r.evidence.maxStreak).toBe(2);
	});
});

describe("(d) confirmation-spiral", () => {
	it("triggers on doubt re-reads >= spiralDoubtMin with cp share <= spiralCpShareMax", () => {
		const p = fixture("d-pos.jsonl", [
			meta("D", { native: true, seamA: true, seamB: true }),
			turn(1, { read_calls: 2, re_reads: 2 }),
			turn(2, { read_calls: 1, re_reads: 1 }),
			turn(3),
		]);
		const r = fingerprintFile(p).d;
		expect(r.triggered).toBe(true);
		expect(r.evidence.doubtReReads).toBe(3);
		expect(r.evidence.cpShare).toBe(0);
		expect(r.evidence.doubtTurns).toEqual([1, 2]);
		expect(r.evidence.vacuousBaseline).toBe(false);
	});

	it("doubt re-reads below the minimum do not trigger", () => {
		const p = fixture("d-boundary.jsonl", [
			meta("C", { seamA: true }),
			turn(1, { read_calls: 2, re_reads: 2 }),
		]);
		expect(fingerprintFile(p).d.triggered).toBe(false);
	});

	it("gap-dominated re-reads (high cp share) do not trigger", () => {
		const p = fixture("d-gap.jsonl", [
			meta("C", { seamA: true }),
			turn(1, { read_calls: 4, re_reads: 4, compacted_path_re_reads: 4 }),
			turn(2, { read_calls: 4, re_reads: 4, compacted_path_re_reads: 2 }),
		]);
		const r = fingerprintFile(p).d;
		// doubt = 2, share = 6/8 = 0.75 — both conditions fail
		expect(r.triggered).toBe(false);
	});

	it("annotates vacuousBaseline when no compaction mechanism was engaged (arm A)", () => {
		const p = fixture("d-vacuous.jsonl", [
			meta("A", {}),
			turn(1, { read_calls: 2, re_reads: 2 }),
			turn(2, { read_calls: 1, re_reads: 1 }),
		]);
		const r = fingerprintFile(p).d;
		expect(r.triggered).toBe(true);
		expect(r.evidence.vacuousBaseline).toBe(true);
		expect(r.reasons.join(" ")).toContain("vacuous");
	});

	it("annotates doubt-window cache-hit ratio when the signal exists, and reasoning absence", () => {
		const p = fixture("d-cache.jsonl", [
			meta("C", { seamA: true }),
			turn(1, { read_calls: 2, re_reads: 2, input_tokens: 1000, cache_read_tokens: 500 }),
			turn(2, { read_calls: 1, re_reads: 1, input_tokens: 1000, cache_read_tokens: 250 }),
		]);
		const r = fingerprintFile(p).d;
		expect(r.evidence.cacheHitRatioDoubtWindow).toBeCloseTo(750 / 2000, 5);
		expect(r.evidence.reasoningSignal).toBe("absent");
	});
});

describe("degenerate input", () => {
	it("a file with no turn rows yields four non-triggered results with an explicit reason", () => {
		const p = fixture("empty.jsonl", [meta("C", { seamA: true })]);
		const rep = fingerprintFile(p);
		for (const r of [rep.a, rep.b, rep.c, rep.d]) {
			expect(r.triggered).toBe(false);
			expect(r.reasons.join(" ")).toContain("no turn rows");
		}
	});
});

describe("golden fixtures (verbatim real runs)", () => {
	it("(a) golden — D1-C low-threshold run recovers compacted views heavily", () => {
		const rep = fingerprintFile(join(FIXDIR, "gap-d1-c.jsonl"));
		expect(rep.mechanismEngaged).toBe(true);
		expect(rep.a.triggered).toBe(true);
		expect(rep.a.evidence.totalCompactedPathReReads).toBe(22);
		expect((rep.a.evidence.gapTurns as number[]).length).toBe(16);
		// gap-dominated: not a confirmation spiral
		expect(rep.d.triggered).toBe(false);
	});

	it("(d) golden — D1-D run re-reads 31 times with zero compacted-path re-reads", () => {
		const rep = fingerprintFile(join(FIXDIR, "spiral-d1-d.jsonl"));
		expect(rep.mechanismEngaged).toBe(true);
		expect(rep.d.triggered).toBe(true);
		expect(rep.d.evidence.doubtReReads).toBe(31);
		expect(rep.d.evidence.cpShare).toBe(0);
		expect(rep.d.evidence.vacuousBaseline).toBe(false);
		// its 10-turn all-re-read streak also fires the (c) proxy
		expect(rep.c.triggered).toBe(true);
		expect(rep.c.evidence.maxStreak).toBe(10);
	});

	it("(d) vacuous-context golden — baseline arm A fires the shape but carries the annotation", () => {
		const rep = fingerprintFile(join(FIXDIR, "vacuous-d1-a.jsonl"));
		expect(rep.mechanismEngaged).toBe(false);
		expect(rep.d.triggered).toBe(true);
		expect(rep.d.evidence.vacuousBaseline).toBe(true);
	});

	it("negative golden — quiet R1-C run triggers nothing; (b) reports signal-absent", () => {
		const rep = fingerprintFile(join(FIXDIR, "quiet-r1-c.jsonl"));
		expect(rep.a.triggered).toBe(false);
		expect(rep.b.triggered).toBe(false);
		expect(rep.b.signalAbsent).toBe(true);
		expect(rep.c.triggered).toBe(false);
		expect(rep.d.triggered).toBe(false);
	});
});

describe("corpus smoke", () => {
	it("fingerprints every committed run JSONL without throwing", () => {
		if (!existsSync(RESULTS)) return; // fresh-checkout safety
		const files: string[] = [];
		const walk = (d: string) => {
			for (const e of readdirSync(d)) {
				const p = join(d, e);
				if (statSync(p).isDirectory()) walk(p);
				else if (e.endsWith(".jsonl")) files.push(p);
			}
		};
		walk(RESULTS);
		expect(files.length).toBeGreaterThan(0);
		for (const f of files) {
			expect(() => fingerprintFile(f), f).not.toThrow();
		}
	});
});

describe("provisional parameters", () => {
	it("exports the documented provisional defaults (ratification pending — 判权归人)", () => {
		expect(FINGERPRINT_PARAMS_PROVISIONAL).toEqual({
			loopStreakMin: 4,
			spiralDoubtMin: 3,
			spiralCpShareMax: 0.1,
		});
	});
});
