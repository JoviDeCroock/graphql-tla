// Regenerates every area's vectors from its TLA+ reference and fails if any
// kit/<area>/vectors.json differs (scripts/generate-vectors-<area>.mjs --check).
//
// Usage: node scripts/check-vectors.mjs

// Takes --checker out of argv and hands it to the runs below as TLA_CHECKER.
import "../kit/checker.mjs";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../..");
let failed = 0;
for (const script of readdirSync(join(root, "scripts")).filter((f) => /^generate-vectors-.*\.mjs$/.test(f)).sort()) {
  console.log(`- ${script} --check`);
  const { status } = spawnSync("node", [join("scripts", script), "--check"], { cwd: root, stdio: "inherit" });
  if (status !== 0) failed++;
}
if (failed) console.error(`✗ ${failed} vector file(s) out of date`);
process.exit(failed ? 1 : 0);
