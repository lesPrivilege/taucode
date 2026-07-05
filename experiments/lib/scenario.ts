/**
 * Workload scenario type. A scenario is a deterministic script of assistant turns
 * (the same ScriptedStep shape G1b's mock provider replays) plus an opening user
 * prompt. The real pi agent loop executes each turn's tool calls against the real
 * built-in tools in a temp workspace, so reads/writes/edits genuinely round-trip.
 *
 * IMPORTANT: scenarios live under experiments/fixtures/ and are TEST FIXTURES for
 * proving the harness works — NOT stand-ins for real G2 experimental workloads
 * (those are human-defined later). Every scenario is tagged data_kind synthetic.
 */

import type { ScriptedStep } from "./compaction-core-adapter.js";

export interface Scenario {
	/** Stable id used in filenames and the JSONL meta row. */
	id: string;
	/** One-line description of what the script exercises. */
	description: string;
	/** Opening user prompt that kicks off the run. */
	prompt: string;
	/**
	 * The scripted assistant turns, replayed in order by the mock provider.
	 *
	 * OPTIONAL: only the mock provider consumes `steps` (it replays them by
	 * call-count). A scenario loaded from a real G2 packet for an autonomous
	 * provider has NO pre-scripted turns — a real model chooses its own actions —
	 * so packet-loaded scenarios omit this. The mock provider defaults a missing
	 * `steps` to `[]`; that is a narrow type change, not a behaviour change for the
	 * existing hand-written fixtures (which still set it).
	 */
	steps?: ScriptedStep[];
	/**
	 * Files the workspace should pre-create before the run (path -> content), so a
	 * `read` in step 1 has something to read. Written under the run's temp cwd.
	 */
	seedFiles?: Record<string, string>;
}
