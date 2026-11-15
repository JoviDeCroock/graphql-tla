// Runs the kit against every implementation in conformance/implementations.json
// and writes conformance/reports/<key>.json, then rebuilds the sheets.
// Implementations whose adapter isn't built are skipped (their old report
// stays). Pass keys to run only those.
//
// Usage: node scripts/conformance-reports.mjs [key ...] [--random N]

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const argv = process.argv.slice(2);
const i = argv.indexOf("--random");
const random = i === -1 ? "1500" : argv.splice(i, 2)[1];
const { implementations } = JSON.parse(readFileSync(join(root, "conformance/implementations.json"), "utf8"));
for (const impl of implementations.filter((x) => argv.length === 0 || argv.includes(x.key))) {
  if (impl.build && !existsSync(join(root, impl.build))) {
    console.log(`- ${impl.key}: not built (${impl.build}), skipped`);
    continue;
  }
  const env = { ...process.env };
  for (const [k, v] of Object.entries(impl.env ?? {})) env[k] = v.replace(/^~/, homedir());
  console.log(`- ${impl.key}`);
  // --strict, so SHOULDs count; the kit's exit code is ignored, since a
  // failing implementation is still a report.
  spawnSync(
    "node",
    ["kit/cli.mjs", "run", "execution", "--adapter", impl.adapter, "--strict", "--random", random, "--report", `conformance/reports/${impl.key}.json`],
    { cwd: root, env, stdio: ["ignore", "inherit", "inherit"] },
  );
}
spawnSync("node", ["scripts/conformance-sheet.mjs"], { cwd: root, stdio: "inherit" });
