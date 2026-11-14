// Model checks every spec in specs/, then checks a set of mutants: copies of a
// spec with one realistic bug planted. A spec passes only if tla-ts finds no
// error, and a mutant passes only if tla-ts reports one of the properties it
// lists in `expect` (the checker stops at the first one it finds).
// That keeps the properties honest: each one is shown to catch a real bug.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const cli = join(root, "node_modules/tla-ts/dist/cli.js");

const MUTANTS = [
  {
    spec: "execution.ts",
    name: "nulls the failing field instead of the nearest nullable ancestor",
    find: "const target = nearestNullable(field);",
    replace: "const target = field as Parent;",
    expect: "nonNullNeverNull",
  },
  {
    spec: "execution.ts",
    name: "treats null in a Non-Null position as a value, not a field error",
    find: 'result === "error" || (result === "null" && nonNull[field])',
    replace: 'result === "error"',
    expect: "nonNullNeverNull",
  },
  {
    spec: "execution.ts",
    name: "drops a Non-Null field's error instead of propagating it to the parent",
    find: 'slot[target as Field] = "null";',
    replace: 'if (target === field) slot[target as Field] = "null";',
    expect: "matchesSpec",
  },
  {
    spec: "execution.ts",
    name: "reports an error once per bubbling step instead of once per field",
    find: "errors.add(field);",
    replace: "errors.add(field);\n    if (nonNull[field] && parentOf[field] !== \"root\") errors.add(parentOf[field] as Field);",
    expect: "errorsAreReal",
  },
  {
    spec: "mutation.ts",
    name: "executes mutation root fields in parallel, like a query",
    find: "const SERIAL = true;",
    replace: "const SERIAL = false;",
    expect: "oneAtATime",
  },
  {
    spec: "defer.ts",
    name: "propagates a deferred field error past the fragment boundary",
    find: 'if (fragment === "Profile") errors.add("profile");',
    replace: 'if (fragment === "Profile") {\n      errors.add("profile");\n      data.me = "null";\n    }',
    expect: "dataIsNeverRetracted announcedUnderLiveParent",
  },
  {
    spec: "defer.ts",
    name: "delivers a failed fragment's Non-Null field as null",
    find: 'if (fragment === "Avatar") errors.add("avatar");',
    replace: 'if (fragment === "Avatar") {\n      errors.add("avatar");\n      data.avatar = "null";\n    }',
    expect: "nonNullNeverNull fieldsArriveWithTheirFragment",
  },
  {
    spec: "defer.ts",
    name: "announces a fragment whose parent was nulled",
    find: 'if (data.me === "value") announced.add("Profile");',
    replace: 'announced.add("Profile");',
    expect: "announcedUnderLiveParent",
  },
  {
    spec: "defer.ts",
    name: "forgets to announce a nested fragment",
    find: 'announced.add("Avatar");',
    replace: "",
    expect: "noFragmentLeftBehind",
  },
  {
    spec: "defer.ts",
    name: "computes hasNext before announcing the nested fragment",
    find: 'announced.add("Avatar");',
    replace: 'hasNext = hasOutstanding();\n        announced.add("Avatar");\n        return;',
    expect: "hasNextIsHonest",
  },
];

const run = (file) => {
  const child = spawnSync(process.execPath, [cli, "-workers", "1", basename(file)], {
    cwd: resolve(file, ".."),
    encoding: "utf8",
  });
  return { status: child.status, output: `${child.stdout}${child.stderr}` };
};

const firstError = (output) =>
  output.split("\n").find((line) => line.startsWith("Error:") || line.includes("Error")) ?? "";

let failures = 0;
const report = (ok, label, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? `\n    ${detail}` : ""}`);
  if (!ok) failures++;
};

const only = process.argv[2];
const specs = readdirSync(join(root, "specs"))
  .filter((f) => f.endsWith(".ts") && (!only || f.startsWith(only)))
  .sort();

console.log("Specs");
for (const spec of specs) {
  const { status, output } = run(join(root, "specs", spec));
  const states = output.match(/(\d[\d,]*) distinct states found/)?.[1];
  report(
    status === 0 && output.includes("No error has been found"),
    `${spec}${states ? ` (${states} distinct states)` : ""}`,
    status === 0 ? "" : firstError(output),
  );
}

console.log("\nMutants");
for (const mutant of MUTANTS.filter((m) => specs.includes(m.spec))) {
  const source = readFileSync(join(root, "specs", mutant.spec), "utf8");
  if (!source.includes(mutant.find)) {
    report(false, `${mutant.spec}: ${mutant.name}`, `can't find: ${mutant.find}`);
    continue;
  }
  const dir = mkdtempSync(join(tmpdir(), "graphql-tla-"));
  try {
    const file = join(dir, mutant.spec);
    writeFileSync(file, source.replace(mutant.find, mutant.replace));
    const { output } = run(file);
    const caughtBy = output.match(
      /(?:Invariant|Action property|Temporal properties?) (\w+) (?:is|was) violated/,
    )?.[1];
    const caught = caughtBy !== undefined && mutant.expect.split(" ").includes(caughtBy);
    report(
      caught,
      `${mutant.spec}: ${mutant.name} → caught by ${caughtBy ?? "nothing"}`,
      caught ? "" : firstError(output) || "no error found",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
