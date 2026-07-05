/**
 * acceptance.ts tests — the static-check runner must evaluate file-exists /
 * contains / regex families (and their negations) against a workspace, and record
 * command:-kind checks as pending WITHOUT executing them.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runAcceptance, runAcceptanceCheck } from "../lib/acceptance.js";
import { parseAcceptance } from "../lib/packet.js";

let ws: string;
beforeEach(() => {
	ws = mkdtempSync(join(tmpdir(), "ecode-accept-"));
	mkdirSync(join(ws, "src"), { recursive: true });
	writeFileSync(join(ws, "src", "present.ts"), "export function foo(): number { return 1; }\n// describe(\n", "utf8");
});
afterEach(() => rmSync(ws, { recursive: true, force: true }));

function run(line: string) {
	return runAcceptanceCheck(parseAcceptance(line), ws);
}

describe("static checks against a real workspace", () => {
	it("file-exists passes for a present file, fails for an absent one", () => {
		expect(run("file-exists src/present.ts")).toMatchObject({ pass: true, status: "pass" });
		expect(run("file-exists src/missing.ts")).toMatchObject({ pass: false, status: "fail", detail: "file not found" });
	});

	it("not-file-exists inverts file-exists", () => {
		expect(run("not-file-exists src/missing.ts")).toMatchObject({ pass: true });
		expect(run("not-file-exists src/present.ts")).toMatchObject({ pass: false, detail: "file unexpectedly exists" });
	});

	it("contains / not-contains read file content", () => {
		expect(run("contains src/present.ts :: export function foo")).toMatchObject({ pass: true });
		expect(run("contains src/present.ts :: not-here")).toMatchObject({ pass: false, detail: "text not found" });
		expect(run("not-contains src/present.ts :: not-here")).toMatchObject({ pass: true });
		expect(run("not-contains src/present.ts :: export function foo")).toMatchObject({ pass: false });
	});

	it("regex / not-regex match file content", () => {
		expect(run("regex src/present.ts :: describe\\(")).toMatchObject({ pass: true });
		expect(run("regex src/present.ts :: nomatch\\d+")).toMatchObject({ pass: false, detail: "regex did not match" });
		expect(run("not-regex src/present.ts :: nomatch\\d+")).toMatchObject({ pass: true });
	});

	it("a check on a missing file fails as file-not-found, not a crash", () => {
		expect(run("contains src/missing.ts :: x")).toMatchObject({ pass: false, detail: "file not found" });
		expect(run("regex src/missing.ts :: x")).toMatchObject({ pass: false, detail: "file not found" });
	});

	it("an invalid regex is reported, not thrown", () => {
		const r = run("regex src/present.ts :: [unterminated");
		expect(r.pass).toBe(false);
		expect(r.detail).toMatch(/invalid regex/);
	});
});

describe("command checks are pending, never executed", () => {
	it("records a command check as pending with pass=null", () => {
		const r = run("command: pnpm test");
		expect(r.status).toBe("pending");
		expect(r.pass).toBeNull();
		expect(r.kind).toBe("command");
	});
});

describe("runAcceptance roll-up", () => {
	it("splits static vs pending and counts passes", () => {
		const checks = [
			"file-exists src/present.ts",
			"file-exists src/missing.ts",
			"regex src/present.ts :: describe\\(",
			"command: pnpm test",
		].map(parseAcceptance);
		const row = runAcceptance(checks, "G2-X", ws);
		expect(row.type).toBe("accept");
		expect(row.packet).toBe("G2-X");
		expect(row.static_total).toBe(3);
		expect(row.static_passed).toBe(2); // present + regex pass; missing fails
		expect(row.pending_total).toBe(1);
		expect(row.results).toHaveLength(4);
		// Every result carries its verbatim check string for machine reading.
		expect(row.results.map((r) => r.check)).toContain("command: pnpm test");
	});
});
