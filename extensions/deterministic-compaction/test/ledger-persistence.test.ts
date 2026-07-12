import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LedgerPersistSink, persistableFromSemanticEvent } from "../src/ledger-persistence.ts";

describe("LedgerPersistSink — WS-5 write-only JSONL", () => {
	let dir: string;

	beforeEach(() => {
		dir = join(tmpdir(), `ledger-persist-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(dir, { recursive: true });
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it("appends records and ensures .taucode/ledger/ is gitignored", () => {
		const sink = new LedgerPersistSink(dir, "session-1");
		const file = sink.append({ kind: "view", path: "src/a.ts", hash: "abcd1234", turn: 1 });

		expect(file).toBe(join(dir, ".taucode", "ledger", "session-1.jsonl"));
		const rows = readFileSync(file, "utf-8").trim().split("\n").map((line) => JSON.parse(line));
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			session_id: "session-1",
			record: { kind: "view", path: "src/a.ts", hash: "abcd1234", turn: 1 },
		});
		expect(readFileSync(join(dir, ".gitignore"), "utf-8")).toContain(".taucode/ledger/");
	});

	it("persists read events as hash lines without prose", () => {
		const record = persistableFromSemanticEvent({
			kind: "read",
			path: "src/a.ts",
			text: "secret prose",
			hash: "abcd1234",
			turn: 1,
		});
		const sink = new LedgerPersistSink(dir, "session-1");
		sink.append(record);

		const raw = readFileSync(join(dir, ".taucode", "ledger", "session-1.jsonl"), "utf-8");
		expect(raw).toContain('"kind":"view"');
		expect(raw).toContain('"hash":"abcd1234"');
		expect(raw).not.toContain("secret prose");
	});

	it("does not create files until append is called", () => {
		expect(existsSync(join(dir, ".taucode", "ledger"))).toBe(false);
	});
});
