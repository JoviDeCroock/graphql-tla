// Runs the kit against every implementation in conformance/implementations.json,
// in every area its adapter claims, and writes conformance/reports/<key>.json
// (execution) and <key>.<area>.json (the other areas), then rebuilds the
// sheets.
// Implementations whose adapter isn't built are skipped (their old report
// stays). Pass keys to run only those.
//
// Usage: node scripts/conformance-reports.mjs [key ...] [--random N]

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AREAS } from "../kit/areas.mjs";

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
  for (const area of AREAS) {
    const report = `conformance/reports/${impl.key}${area === "execution" ? "" : `.${area}`}.json`;
    const args = ["kit/cli.mjs", "run", area, "--adapter", impl.adapter, "--strict", "--report", report];
    if (area === "execution") args.push("--random", random);
    const { status } = spawnSync("node", args, { cwd: root, env, stdio: ["ignore", "inherit", "inherit"] });
    // 3: the adapter doesn't claim the area, so any old report is stale.
    if (status === 3) rmSync(join(root, report), { force: true });
  }
}
spawnSync("node", ["scripts/conformance-sheet.mjs"], { cwd: root, stdio: "inherit" });
