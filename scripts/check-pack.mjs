// Checks what `npm publish` would ship: the files the kit reads at run time
// are in the package, and nothing that is only for developing it is.
//
// Usage: node scripts/check-pack.mjs

import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const [pack] = JSON.parse(execFileSync(npm, ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
const files = new Set(pack.files.map((f) => f.path));

const required = [
  "package.json",
  "README.md",
  "LICENSE",
  "kit/cli.mjs",
  "kit/checker.mjs",
  "kit/ndjson.mjs",
  "kit/protocol.schema.json",
  "kit/spec-sections.json",
  "kit/execution/Cases.tla",
  "kit/execution/controls.json",
  "kit/introspect/IntrospectChecks.tla",
  "adapters/graphql-js/adapter.mjs",
  "docs/conformance.md",
  // Every area's vectors.
  ...readdirSync(join(root, "kit"), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) => readdirSync(join(root, "kit", d.name)).filter((f) => f === "vectors.json").map((f) => `kit/${d.name}/${f}`)),
  // Every reference module and fixture.
  ...readdirSync(join(root, "specs")).filter((f) => f.endsWith(".tla")).map((f) => `specs/${f}`),
  ...readdirSync(join(root, "fixtures")).filter((f) => f.endsWith(".graphql")).map((f) => `fixtures/${f}`),
];
const forbidden = [/\.test\.mjs$/, /^scripts\//, /^website\//, /^conformance\//, /^node_modules\//, /^adapters\/(?!graphql-js\/)/, /^specs\/.*\.ts$/, /^\.github\//];

let failed = 0;
for (const f of required) {
  if (!files.has(f)) {
    console.error(`✗ missing from the package: ${f}`);
    failed++;
  }
}
for (const f of files) {
  if (forbidden.some((r) => r.test(f))) {
    console.error(`✗ shouldn't be in the package: ${f}`);
    failed++;
  }
}
const mb = (pack.size / 1e6).toFixed(1);
if (failed) {
  console.error(`✗ ${failed} problems in ${pack.filename} (${files.size} files)`);
  process.exit(1);
}
console.log(`✓ ${pack.filename}: ${files.size} files, ${mb} MB packed, ${(pack.unpackedSize / 1e6).toFixed(1)} MB unpacked`);
