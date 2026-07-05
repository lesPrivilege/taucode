/**
 * workspace.ts tests — the per-run snapshot copy must be byte-faithful and
 * deterministic: copying ONE snapshot into two separate arm dirs yields two
 * byte-identical trees (the "all arms start identical" invariant), independent of
 * arm identity. This is the automated form of the G1d "hardest check", run against
 * a small synthetic snapshot (with a symlink, mirroring node_modules) so it is fast
 * and self-contained — the same copy primitive run.ts uses is under test.
 */

import { spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { copyWorkspaceFrom, readSnapshotManifest, resolveSnapshotDir } from "../lib/workspace.js";

let root: string;
let snapshotRoot: string;

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "ecode-ws-"));
	// Build a synthetic snapshot: <root>/snap/{workspace, manifest.json}.
	snapshotRoot = join(root, "snap");
	const workspace = join(snapshotRoot, "workspace");
	mkdirSync(join(workspace, "pkg", "src"), { recursive: true });
	writeFileSync(join(workspace, "pkg", "src", "index.ts"), "export const x = 1;\n", "utf8");
	writeFileSync(join(workspace, "pkg", "package.json"), '{"name":"pkg"}\n', "utf8");
	mkdirSync(join(workspace, "node_modules"), { recursive: true });
	// A symlink like pnpm's workspace links — must be copied as a symlink, verbatim.
	symlinkSync("../pkg", join(workspace, "node_modules", "pkg"));
	writeFileSync(
		join(snapshotRoot, "manifest.json"),
		JSON.stringify({
			name: "snap",
			source: "/synthetic",
			createdAt: "2026-01-01T00:00:00.000Z",
			manifestHash: "deadbeef",
			fileCount: 2,
			installed: false,
			installCmd: null,
			stripped: [".git", "results", "node_modules"],
			hashScope: "source-tree-excluding-node_modules",
		}) + "\n",
		"utf8",
	);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("resolveSnapshotDir", () => {
	it("resolves a snapshot ROOT (with workspace/ + manifest.json) to its workspace", () => {
		const r = resolveSnapshotDir(snapshotRoot);
		expect(r.workspace).toBe(join(snapshotRoot, "workspace"));
		expect(r.root).toBe(snapshotRoot);
	});
});

describe("copyWorkspaceFrom is byte-faithful and deterministic (the hardest check)", () => {
	it("two copies of ONE snapshot into two arm dirs are byte-identical", () => {
		const armA = join(root, "armA");
		const armB = join(root, "armB");
		const a = copyWorkspaceFrom(snapshotRoot, armA, root);
		const b = copyWorkspaceFrom(snapshotRoot, armB, root);

		// Provenance came through and matches the manifest.
		expect(a.manifestHash).toBe("deadbeef");
		expect(b.manifestHash).toBe("deadbeef");

		// diff -r --no-dereference: compare symlinks AS symlinks (avoids following
		// node_modules link loops), report only real content differences.
		const res = spawnSync("diff", ["-r", "--no-dereference", armA, armB], { encoding: "utf8" });
		// GNU diff supports --no-dereference and exits 0 for identical trees.
		if (/(unrecognized|illegal) option/.test(res.stderr || "")) {
			// BSD fallback: plain diff, ignore only "Directory loop detected" warnings.
			const r2 = spawnSync("diff", ["-r", armA, armB], { encoding: "utf8" });
			const realDiffs = (r2.stdout || "").split("\n").filter(Boolean);
			expect(realDiffs).toEqual([]);
		} else {
			expect(res.stdout).toBe("");
			expect(res.status).toBe(0);
		}
	});

	it("preserves the symlink as a symlink (not a dereferenced copy)", () => {
		const arm = join(root, "arm");
		copyWorkspaceFrom(snapshotRoot, arm, root);
		const st = lstatSync(join(arm, "node_modules", "pkg"));
		expect(st.isSymbolicLink()).toBe(true);
	});
});

describe("readSnapshotManifest", () => {
	it("reads the manifest json", () => {
		const m = readSnapshotManifest(snapshotRoot);
		expect(m?.manifestHash).toBe("deadbeef");
		expect(m?.stripped).toContain("node_modules");
	});

	it("returns null when there is no manifest", () => {
		expect(readSnapshotManifest(join(root, "nope"))).toBeNull();
	});
});
