import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "ecode-preflight-"));
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

function rows(path: string): Record<string, unknown>[] {
	return readFileSync(path, "utf8")
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter((l) => l && !l.startsWith("#"))
		.map((l) => JSON.parse(l) as Record<string, unknown>);
}

describe("R2-preflight harness wiring", () => {
	it("injects file-exists acceptance targets into ECODE_ANCHOR_ACCEPTANCE when the anchor flag is on", () => {
		const out = join(dir, "e1-c.jsonl");
		execFileSync(
			process.execPath,
			[
				"--no-warnings",
				"--experimental-transform-types",
				"--import",
				resolve("lib/register.mjs"),
				resolve("run.ts"),
				"--provider",
				"mock",
				"--scenario",
				"G2-E1",
				"--arm",
				"C",
				"--context-window",
				"12345",
				"--out",
				out,
			],
			{ cwd: resolve("."), encoding: "utf8", env: { ...process.env, ECODE_SEMANTIC_ANCHOR: "1" } },
		);

		const meta = rows(out).find((r) => r.type === "meta")!;
		const mechanism = meta.mechanism as Record<string, unknown>;
		expect(mechanism.provider_context_window).toBe(12345);
		expect(mechanism.anchor_acceptance_targets).toBe("SUBSYSTEM-MAP.md");
		expect(mechanism.extension_flags).toMatchObject({ semantic_anchor: true });
	});

	it("records EXP-WS addon flags for C-SB arms", () => {
		const out = join(dir, "e1-csb.jsonl");
		execFileSync(
			process.execPath,
			[
				"--no-warnings",
				"--experimental-transform-types",
				"--import",
				resolve("lib/register.mjs"),
				resolve("run.ts"),
				"--provider",
				"mock",
				"--scenario",
				"G2-E1",
				"--arm",
				"C-SB",
				"--out",
				out,
			],
			{ cwd: resolve("."), encoding: "utf8", env: { ...process.env } },
		);

		const meta = rows(out).find((r) => r.type === "meta")!;
		expect(meta.arm).toBe("C-SB");
		const mechanism = meta.mechanism as Record<string, unknown>;
		expect(mechanism.anchor_acceptance_targets).toBe("SUBSYSTEM-MAP.md");
		expect(mechanism.extension_flags).toEqual({
			semantic_anchor: true,
			ws_declaration: false,
			sideband_summary: true,
			ws_policy: true,
			placebo_token_matching: false,
			compact_nudge_tail: false,
		});
	});

	it("records C+PL placebo token target for dry-run balancing", () => {
		const out = join(dir, "e1-cpl.jsonl");
		execFileSync(
			process.execPath,
			[
				"--no-warnings",
				"--experimental-transform-types",
				"--import",
				resolve("lib/register.mjs"),
				resolve("run.ts"),
				"--provider",
				"mock",
				"--scenario",
				"G2-E1",
				"--arm",
				"C+PL",
				"--out",
				out,
			],
			{ cwd: resolve("."), encoding: "utf8", env: { ...process.env } },
		);

		const meta = rows(out).find((r) => r.type === "meta")!;
		expect(meta.arm).toBe("C+PL");
		const mechanism = meta.mechanism as Record<string, unknown>;
		expect(mechanism.extension_flags).toMatchObject({ placebo_token_matching: true });
		expect(mechanism.placebo_tail_target_tokens).toBe(120);
	});

	it("records OBS-TAIL nudge evidence on projected C+N turns", () => {
		const out = join(dir, "refactor-cn.jsonl");
		execFileSync(
			process.execPath,
			[
				"--no-warnings",
				"--experimental-transform-types",
				"--import",
				resolve("lib/register.mjs"),
				resolve("run.ts"),
				"--provider",
				"mock",
				"--scenario",
				"refactor",
				"--arm",
				"C+N",
				"--compact-after",
				"0",
				"--out",
				out,
			],
			{ cwd: resolve("."), encoding: "utf8", env: { ...process.env } },
		);

		const meta = rows(out).find((r) => r.type === "meta")!;
		const mechanism = meta.mechanism as Record<string, unknown>;
		expect(mechanism.extension_flags).toMatchObject({ compact_nudge_tail: true });
		const projected = rows(out).find((r) => r.type === "turn" && r.projected === true)!;
		expect(projected).toMatchObject({
			anchor_lines: 0,
			anchor_hash: null,
		});
		expect(projected.tail_blocks).toEqual([
			expect.objectContaining({ source: "nudge", line_count: 2, content_hash: expect.any(String) }),
		]);
	});

	it("records OBS-TAIL placebo evidence on projected C+PL turns", () => {
		const out = join(dir, "refactor-cpl.jsonl");
		execFileSync(
			process.execPath,
			[
				"--no-warnings",
				"--experimental-transform-types",
				"--import",
				resolve("lib/register.mjs"),
				resolve("run.ts"),
				"--provider",
				"mock",
				"--scenario",
				"refactor",
				"--arm",
				"C+PL",
				"--compact-after",
				"0",
				"--out",
				out,
			],
			{ cwd: resolve("."), encoding: "utf8", env: { ...process.env } },
		);

		const projected = rows(out).find((r) => r.type === "turn" && r.projected === true)!;
		expect(projected).toMatchObject({
			anchor_lines: 0,
			anchor_hash: null,
		});
		expect(projected.tail_blocks).toEqual([
			expect.objectContaining({ source: "placebo", line_count: expect.any(Number), content_hash: expect.any(String) }),
		]);
	});

	it("records sideband provider-cost rows for projected C-SB turns", () => {
		const out = join(dir, "refactor-csb.jsonl");
		execFileSync(
			process.execPath,
			[
				"--no-warnings",
				"--experimental-transform-types",
				"--import",
				resolve("lib/register.mjs"),
				resolve("run.ts"),
				"--provider",
				"mock",
				"--scenario",
				"refactor",
				"--arm",
				"C-SB",
				"--compact-after",
				"0",
				"--out",
				out,
			],
			{ cwd: resolve("."), encoding: "utf8", env: { ...process.env } },
		);

		const allRows = rows(out);
		const sideband = allRows.find((r) => r.type === "sideband")!;
		expect(sideband).toMatchObject({
			path: expect.any(String),
			hash: expect.any(String),
			record_id: expect.any(String),
			model: expect.stringContaining(":sideband-mock"),
			input_tokens: expect.any(Number),
			output_tokens: expect.any(Number),
			text_hash: expect.any(String),
		});
		const summary = allRows.find((r) => r.type === "summary")!;
		expect(summary.sideband_calls).toBeGreaterThan(0);
		expect(summary.sideband_input_tokens).toBeGreaterThan(0);
		expect(summary.sideband_output_tokens).toBeGreaterThan(0);
	});
});
