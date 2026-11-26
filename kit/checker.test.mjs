// kit/checker.mjs: TLA_CHECKER and --checker choose the model checker, and
// runChecker runs it.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checker, runChecker, splitCommand } from "./checker.mjs";

const module = fileURLToPath(new URL("./checker.mjs", import.meta.url));

// A checker that records its arguments and prints them.
const fake = (dir) => {
  const script = join(dir, "fake-checker.mjs");
  writeFileSync(
    script,
    `import { writeFileSync } from "node:fs";
writeFileSync(${JSON.stringify(join(dir, "args.json"))}, JSON.stringify(process.argv.slice(2)));
console.log("<<\\"fake\\", " + process.argv.length + ">>");
process.exit(0);
`,
  );
  return script;
};

const withEnv = async (value, body) => {
  const old = process.env.TLA_CHECKER;
  if (value === undefined) delete process.env.TLA_CHECKER;
  else process.env.TLA_CHECKER = value;
  try {
    return await body();
  } finally {
    if (old === undefined) delete process.env.TLA_CHECKER;
    else process.env.TLA_CHECKER = old;
  }
};

test("splitCommand splits on whitespace, with quotes and backslashes grouping", () => {
  assert.deepEqual(splitCommand("java -cp tla2tools.jar tlc2.TLC"), ["java", "-cp", "tla2tools.jar", "tlc2.TLC"]);
  assert.deepEqual(splitCommand(`  a  "b c" 'd "e"' f\\ g "" `), ["a", "b c", 'd "e"', "f g", ""]);
  assert.deepEqual(splitCommand(`"a \\" b"`), ['a " b']);
  assert.throws(() => splitCommand(`a "b`), /unclosed/);
});

test("without TLA_CHECKER, the checker is the bundled tla-ts CLI, run with Node", () =>
  withEnv(undefined, () => {
    const c = checker();
    assert.equal(c.node, true);
    assert.match(c.words[0], /tla-ts[\\/]dist[\\/]cli\.js$/);
  }));

test("a .mjs checker runs with this Node, other commands as executables", () =>
  withEnv(undefined, async () => {
    const dir = mkdtempSync(join(tmpdir(), "graphql-tla-checker-"));
    try {
      const script = fake(dir);
      await withEnv(script, async () => {
        assert.equal(checker().node, true);
        const { status, output } = await runChecker(["-workers", "1", "M.tla"], { cwd: dir, stack: "large" });
        assert.equal(status, 0);
        assert.match(output, /"fake"/);
        assert.deepEqual(JSON.parse(readFileSync(join(dir, "args.json"), "utf8")), ["-workers", "1", "M.tla"]);
      });
      await withEnv(`"${process.execPath}" "${script}" --extra`, async () => {
        assert.equal(checker().node, false);
        const { status } = await runChecker(["-config", "M.cfg", "M.tla"], { cwd: dir, stack: "huge" });
        assert.equal(status, 0);
        assert.deepEqual(JSON.parse(readFileSync(join(dir, "args.json"), "utf8")), ["--extra", "-config", "M.cfg", "M.tla"]);
      });
      await withEnv("graphql-tla-no-such-checker", async () => {
        const { status, output } = await runChecker(["M.tla"], { cwd: dir });
        assert.equal(status, 127);
        assert.match(output, /^Error: can't run the checker/m);
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }));

test("--checker is taken out of argv and passed on as TLA_CHECKER", () => {
  const dir = mkdtempSync(join(tmpdir(), "graphql-tla-checker-"));
  try {
    // A script, as the CLI and scripts/ are, so argv[1] is its path.
    const probe = join(dir, "probe.mjs");
    writeFileSync(probe, `await import(${JSON.stringify(module)}); console.log(JSON.stringify([process.argv.slice(2), process.env.TLA_CHECKER ?? null]));\n`);
    const run = (...args) => {
      const env = { ...process.env };
      delete env.TLA_CHECKER;
      const r = spawnSync(process.execPath, [probe, ...args], { encoding: "utf8", env });
      assert.equal(r.status, 0, r.stderr);
      return JSON.parse(r.stdout);
    };
    assert.deepEqual(run("run", "--checker", "tlc --x", "--strict"), [["run", "--strict"], "tlc --x"]);
    assert.deepEqual(run("--checker=my-checker", "a"), [["a"], "my-checker"]);
    assert.deepEqual(run("a", "b"), [["a", "b"], null]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
