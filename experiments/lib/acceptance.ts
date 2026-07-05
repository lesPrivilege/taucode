/**
 * acceptance.ts — run a packet's STATIC acceptance checks against a workspace and
 * produce machine-readable results for the run's JSONL.
 *
 * Mirrors the static branches of taucode dogfood-task.mjs `runCheck`
 * (file-exists/not-file-exists, contains/not-contains, regex/not-regex) evaluated
 * relative to a given workspace root. `command:` checks are DELIBERATELY not
 * executed: they are recorded with status "pending" and carried untouched into the
 * JSONL, deferred to compare/human review. This is the codified form of the
 * G2-D1 裁定 (command checks stay manual for now) — this module never spawns a
 * process, so there is no allowlist to extend and no way for a command check to run.
 */

import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve as resolvePath } from "node:path";
import type { AcceptanceCheck } from "./packet.js";

/** One check's outcome. `pass` is null for pending (unexecuted) command checks. */
export interface AcceptanceResult {
	/** The exact acceptance line, verbatim from the packet. */
	check: string;
	/** Check kind (file-exists / contains / regex / … / command / unknown). */
	kind: string;
	/** true = passed, false = failed, null = pending/not-evaluated. */
	pass: boolean | null;
	/** "pass" | "fail" | "pending" — redundant with pass, for easy reading. */
	status: "pass" | "fail" | "pending";
	/** Short human detail (empty on pass). */
	detail: string;
}

/** Resolve a check's path against the workspace root. */
function underWorkspace(workspace: string, p: string): string {
	return isAbsolute(p) ? p : resolvePath(workspace, p);
}

/** Evaluate ONE acceptance check against the workspace. Never spawns a process. */
export function runAcceptanceCheck(check: AcceptanceCheck, workspace: string): AcceptanceResult {
	const base = { check: check.raw, kind: check.kind } as const;
	const pass = (detail = ""): AcceptanceResult => ({ ...base, pass: true, status: "pass", detail });
	const fail = (detail: string): AcceptanceResult => ({ ...base, pass: false, status: "fail", detail });

	switch (check.kind) {
		case "file-exists":
		case "not-file-exists": {
			const exists = existsSync(underWorkspace(workspace, check.path));
			const ok = check.kind === "file-exists" ? exists : !exists;
			return ok ? pass() : fail(exists ? "file unexpectedly exists" : "file not found");
		}

		case "contains":
		case "not-contains": {
			const abs = underWorkspace(workspace, check.path);
			if (!existsSync(abs)) return fail("file not found");
			const found = readFileSync(abs, "utf8").includes(check.text);
			const ok = check.kind === "contains" ? found : !found;
			return ok ? pass() : fail(found ? "unexpected text found" : "text not found");
		}

		case "regex":
		case "not-regex": {
			const abs = underWorkspace(workspace, check.path);
			if (!existsSync(abs)) return fail("file not found");
			let matched: boolean;
			try {
				matched = new RegExp(check.pattern, "m").test(readFileSync(abs, "utf8"));
			} catch (e) {
				return fail(`invalid regex: ${e instanceof Error ? e.message : String(e)}`);
			}
			const ok = check.kind === "regex" ? matched : !matched;
			return ok ? pass() : fail(matched ? "unexpected regex match" : "regex did not match");
		}

		case "command":
			// NEVER executed — recorded as pending, deferred to compare/human review.
			return { ...base, pass: null, status: "pending", detail: "command check not auto-executed" };

		default:
			return { ...base, pass: null, status: "pending", detail: "unsupported acceptance check" };
	}
}

/** Roll-up shape written into the run JSONL as a single `type:"accept"` row. */
export interface AcceptanceRow {
	type: "accept";
	packet: string;
	workspace: string;
	/** Static checks that were evaluated (file-exists/contains/regex families). */
	static_total: number;
	static_passed: number;
	/** command/unknown checks recorded as pending (not evaluated). */
	pending_total: number;
	results: AcceptanceResult[];
}

/**
 * Run all of a packet's checks against `workspace` and assemble the JSONL row.
 * Static checks are evaluated; command checks are recorded pending. The result is
 * machine-readable and self-describing (each entry carries the raw check string).
 */
export function runAcceptance(checks: AcceptanceCheck[], packet: string, workspace: string): AcceptanceRow {
	const results = checks.map((c) => runAcceptanceCheck(c, workspace));
	let staticTotal = 0;
	let staticPassed = 0;
	let pendingTotal = 0;
	for (const r of results) {
		if (r.status === "pending") pendingTotal++;
		else {
			staticTotal++;
			if (r.pass) staticPassed++;
		}
	}
	return {
		type: "accept",
		packet,
		workspace,
		static_total: staticTotal,
		static_passed: staticPassed,
		pending_total: pendingTotal,
		results,
	};
}
