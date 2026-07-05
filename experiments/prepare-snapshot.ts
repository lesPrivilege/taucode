/**
 * prepare-snapshot — build a reusable, frozen snapshot of `../taucode` for the
 * R/D-class G2 packets to run against.
 *
 * WHY this is a SEPARATE script (the human architectural call, see the G1d packet):
 *   Building a snapshot is expensive — copy the tree, strip `.git`/`results`/
 *   `node_modules`, `npm`/`pnpm install` (network + minutes) — and happens ONCE per
 *   packet-class, ahead of a batch of runs. It therefore does NOT belong inside a
 *   `run.ts` invocation (whose whole job is producing one clean metrics JSONL).
 *   run.ts's `--workspace-from` does only the cheap, per-run half: copy this frozen
 *   snapshot into a fresh working dir and record which snapshot + content hash it
 *   started from. This split is what turns "all four arms started byte-identical"
 *   from a protocol promise into an auditable field.
 *
 * WHAT it produces: `experiments/snapshots/<name>/` containing
 *   - `workspace/`      the installed, ready-to-copy tree (source + node_modules)
 *   - `manifest.json`   { name, source, createdAt, manifestHash, fileCount,
 *                         installed, installCmd, stripped, hashScope }
 *   The manifestHash is a SHA-256 over the SOURCE tree only (node_modules excluded)
 *   — npm/pnpm installs are not byte-reproducible, but the source a run starts from
 *   IS, and that is the invariant worth auditing.
 *
 * Invoke (run-once, standalone — NOT called by run.ts):
 *   node --import ./lib/register.mjs prepare-snapshot.ts --name r2 \
 *        [--source ../taucode] [--install-cmd "pnpm install"] [--no-install] [--force]
 *
 * (register.mjs is unnecessary here — this script has no pi imports — but keeping a
 * single invocation convention avoids a footgun; plain `node prepare-snapshot.ts`
 * works too.)
 */

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, isAbsolute, join, relative, resolve as resolvePath } from "node:path";

// Anchor to the script's own location so the output dir is correct regardless of
// the invoking cwd (repo root OR experiments/). experiments/prepare-snapshot.ts ->
// experimentsDir is this file's dir; repoRoot is one level up.
const EXPERIMENTS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolvePath(EXPERIMENTS_DIR, "..");
const SNAPSHOTS_DIR = join(EXPERIMENTS_DIR, "snapshots");

/** Top-level entries stripped from the copy (never part of a clean start). */
const STRIP = [".git", "results", "node_modules"];

interface Args {
	name: string;
	source: string;
	installCmd: string | null;
	install: boolean;
	force: boolean;
}

function parseArgs(argv: string[]): Args {
	const flags: Record<string, string | boolean> = {};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (!a.startsWith("--")) continue;
		const key = a.slice(2);
		const next = argv[i + 1];
		if (next === undefined || next.startsWith("--")) flags[key] = true;
		else {
			flags[key] = next;
			i++;
		}
	}
	if (typeof flags.name !== "string" || !flags.name) {
		throw new Error("Missing --name <snapshot-name> (e.g. --name r2).");
	}
	return {
		name: flags.name.replace(/[^a-z0-9-]/gi, "-").toLowerCase(),
		// Default source = taucode as a SIBLING of the ecode repo root ("../taucode"
		// from REPO_ROOT). Relative --source values also resolve against REPO_ROOT.
		source: typeof flags.source === "string" ? flags.source : "../taucode",
		installCmd: typeof flags["install-cmd"] === "string" ? flags["install-cmd"] : null,
		install: flags["no-install"] !== true,
		force: flags.force === true,
	};
}

/** Pick the install command from the source's lockfile if not overridden. */
function detectInstallCmd(sourceDir: string): string {
	if (existsSync(join(sourceDir, "pnpm-lock.yaml"))) return "pnpm install";
	if (existsSync(join(sourceDir, "package-lock.json"))) return "npm install";
	if (existsSync(join(sourceDir, "yarn.lock"))) return "yarn install";
	// The G1d packet phrases this generically as "npm install"; default to it when
	// no lockfile pins a manager.
	return "npm install";
}

/**
 * Deterministic SHA-256 over a directory tree, excluding the given top-level dir
 * names (used to exclude node_modules). Entries are visited in sorted order; each
 * file contributes its relative path + contents; each SYMLINK contributes its
 * relative path + link target string (NOT followed — a symlink to a directory must
 * not be read as a file, and following could escape the tree or loop).
 */
function hashTree(root: string, excludeTop: Set<string>): { hash: string; fileCount: number } {
	interface Node {
		rel: string;
		kind: "file" | "symlink";
		abs: string;
	}
	const nodes: Node[] = [];
	const walk = (dir: string, top: boolean) => {
		for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
			if (top && excludeTop.has(entry.name)) continue;
			const abs = join(dir, entry.name);
			const rel = relative(root, abs).split("\\").join("/");
			if (entry.isSymbolicLink()) nodes.push({ rel, kind: "symlink", abs });
			else if (entry.isDirectory()) walk(abs, false);
			else if (entry.isFile()) nodes.push({ rel, kind: "file", abs });
			// sockets/fifos/etc are ignored.
		}
	};
	walk(root, true);
	nodes.sort((a, b) => (a.rel < b.rel ? -1 : 1));
	const h = createHash("sha256");
	let fileCount = 0;
	for (const n of nodes) {
		h.update(n.rel);
		h.update("\0");
		if (n.kind === "symlink") {
			h.update("symlink:");
			h.update(readlinkSync(n.abs));
		} else {
			// Guard against a race where a file became a dir/symlink between listing
			// and reading (shouldn't happen in a frozen copy, but be safe).
			const st = lstatSync(n.abs, { throwIfNoEntry: false });
			if (st?.isSymbolicLink()) {
				h.update("symlink:");
				h.update(readlinkSync(n.abs));
			} else {
				h.update("file:");
				h.update(readFileSync(n.abs));
			}
		}
		h.update("\0");
		fileCount++;
	}
	return { hash: h.digest("hex"), fileCount };
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	const sourceDir = isAbsolute(args.source) ? args.source : resolvePath(REPO_ROOT, args.source);
	if (!existsSync(sourceDir)) throw new Error(`Source not found: ${sourceDir}`);

	const outDir = join(SNAPSHOTS_DIR, args.name);
	const workspaceDir = join(outDir, "workspace");
	if (existsSync(outDir)) {
		if (!args.force) throw new Error(`Snapshot "${args.name}" already exists at ${outDir}. Use --force to rebuild.`);
		rmSync(outDir, { recursive: true, force: true });
	}
	mkdirSync(workspaceDir, { recursive: true });

	// 1. Copy the source tree, stripping the STRIP entries at the top level.
	// eslint-disable-next-line no-console
	console.log(`[prepare-snapshot] copying ${sourceDir} -> ${workspaceDir} (stripping ${STRIP.join(", ")})`);
	cpSync(sourceDir, workspaceDir, {
		recursive: true,
		dereference: false,
		filter: (src) => {
			const rel = relative(sourceDir, src);
			if (rel === "") return true;
			const topSeg = rel.split(/[\\/]/)[0];
			return !STRIP.includes(topSeg);
		},
	});

	// 2. Hash the SOURCE tree (post-strip, pre-install). This is the byte-identity
	//    invariant every arm's copy must reproduce; node_modules is excluded.
	const { hash: manifestHash, fileCount } = hashTree(workspaceDir, new Set(["node_modules"]));

	// 3. Install dependencies inside the copy (the expensive step).
	const installCmd = args.install ? (args.installCmd ?? detectInstallCmd(sourceDir)) : null;
	if (installCmd) {
		// eslint-disable-next-line no-console
		console.log(`[prepare-snapshot] installing deps: ${installCmd} (cwd=${workspaceDir})`);
		const [cmd, ...cmdArgs] = installCmd.split(/\s+/);
		execFileSync(cmd, cmdArgs, { cwd: workspaceDir, stdio: "inherit" });
	} else {
		// eslint-disable-next-line no-console
		console.log(`[prepare-snapshot] skipping dependency install (--no-install)`);
	}

	// 4. Write the manifest.
	const manifest = {
		name: args.name,
		source: sourceDir,
		createdAt: new Date().toISOString(),
		manifestHash,
		fileCount,
		installed: !!installCmd,
		installCmd: installCmd,
		stripped: STRIP,
		// The manifestHash covers the source tree with node_modules excluded.
		hashScope: "source-tree-excluding-node_modules",
	};
	writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");

	// eslint-disable-next-line no-console
	console.log(
		`[prepare-snapshot] done: ${outDir}\n` +
			`  manifestHash=${manifestHash}\n` +
			`  fileCount=${fileCount} installed=${manifest.installed}`,
	);
}

try {
	main();
} catch (e) {
	// eslint-disable-next-line no-console
	console.error(`prepare-snapshot error: ${e instanceof Error ? e.message : String(e)}`);
	process.exit(1);
}
