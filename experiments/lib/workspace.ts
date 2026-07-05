/**
 * workspace.ts — the cheap, per-run half of the snapshot protocol: copy a frozen
 * snapshot (built once by prepare-snapshot.ts) into a fresh per-run working
 * directory, and read back the snapshot's manifest for provenance.
 *
 * This deliberately lives in a shared module (not inline in run.ts) so the
 * determinism check exercises the EXACT copy mechanism run.ts uses — the "all four
 * arms start byte-identical" guarantee is only meaningful if the code under test is
 * the code that ships.
 */

import { cpSync, existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve as resolvePath } from "node:path";

export interface SnapshotManifest {
	name: string;
	source: string;
	createdAt: string;
	manifestHash: string;
	fileCount: number;
	installed: boolean;
	installCmd: string | null;
	stripped: string[];
	hashScope: string;
}

/** Resolve a snapshot dir: accept either the snapshot root or its `workspace/`. */
export function resolveSnapshotDir(snapshotDir: string, repoRoot = process.cwd()): { root: string; workspace: string } {
	const abs = isAbsolute(snapshotDir) ? snapshotDir : resolvePath(repoRoot, snapshotDir);
	// If the given dir contains workspace/ + manifest.json it's the snapshot root.
	if (existsSync(join(abs, "workspace")) && existsSync(join(abs, "manifest.json"))) {
		return { root: abs, workspace: join(abs, "workspace") };
	}
	// If it IS a workspace dir with a sibling manifest one level up, use that.
	return { root: abs, workspace: abs };
}

/** Read a snapshot's manifest.json if present (for provenance in the JSONL). */
export function readSnapshotManifest(snapshotRoot: string): SnapshotManifest | null {
	const p = join(snapshotRoot, "manifest.json");
	if (!existsSync(p)) return null;
	try {
		return JSON.parse(readFileSync(p, "utf8")) as SnapshotManifest;
	} catch {
		return null;
	}
}

/**
 * Copy a snapshot's `workspace/` into `dest` byte-faithfully and deterministically.
 * Uses fs.cpSync with dereference:false so symlinks are preserved verbatim (a
 * node_modules tree is full of them). This is the single copy primitive both
 * run.ts and the determinism test call — nothing here depends on arm identity, so
 * two copies of the same snapshot are byte-identical by construction.
 */
export function copyWorkspaceFrom(snapshotDir: string, dest: string, repoRoot = process.cwd()): {
	source: string;
	manifestHash: string | null;
	manifest: SnapshotManifest | null;
} {
	const { root, workspace } = resolveSnapshotDir(snapshotDir, repoRoot);
	if (!existsSync(workspace)) throw new Error(`Snapshot workspace not found: ${workspace}`);
	cpSync(workspace, dest, { recursive: true, dereference: false });
	const manifest = readSnapshotManifest(root);
	return { source: snapshotDir, manifestHash: manifest?.manifestHash ?? null, manifest };
}
