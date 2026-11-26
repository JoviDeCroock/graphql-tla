// Reproduces graphql-js's conformance reports, in every area, and fails if
// they differ from the committed ones in conformance/reports (provenance
// aside). graphql-js runs are deterministic, so this pins down both the kit
// and graphql-js's known deviations: a change in either shows up here.
// Also checks that the sheets are up to date with the reports.
//
// Usage: node scripts/check-conformance.mjs

// Takes --checker out of argv and hands it to the runs below as TLA_CHECKER.
import "../kit/checker.mjs";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AREAS } from "../kit/areas.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const dir = mkdtempSync(join(tmpdir(), "graphql-tla-reports-"));
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const strip = (report) => JSON.stringify({ ...report, provenance: { ...report.provenance, kit: undefined, date: undefined } }, null, 1);
let failed = 0;
try {
  for (const [key, version] of [["graphql-js-16", "16"], ["graphql-js-17", "17"]]) {
    for (const area of AREAS) {
      const name = `${key}${area === "execution" ? "" : `.${area}`}.json`;
      const args = ["kit/cli.mjs", "run", area, "--adapter", `node adapters/graphql-js/adapter.mjs --graphql ${version}`, "--strict", "--report", join(dir, name)];
      const { status } = spawnSync("node", args, { cwd: root, stdio: ["ignore", "ignore", "inherit"] });
      const committed = join(root, "conformance/reports", name);
      if (status === 3) {
        if (existsSync(committed)) {
          console.error(`✗ ${name}: committed, but the adapter no longer claims ${area}`);
          failed++;
        }
        continue;
      }
      if (!existsSync(join(dir, name))) {
        console.error(`✗ ${name}: the run wrote no report (exit ${status})`);
        failed++;
      } else if (!existsSync(committed)) {
        console.error(`✗ ${name}: no committed report; run npm run conformance`);
        failed++;
      } else if (read(committed).format !== read(join(dir, name)).format) {
        // A report format change (kit/report.mjs REPORT_FORMAT) needs every report regenerated.
        console.error(`✗ ${name}: the committed report is format ${read(committed).format}, the kit writes format ${read(join(dir, name)).format}; run npm run conformance`);
        failed++;
      } else if (read(join(dir, name)).ok !== (status === 0)) {
        console.error(`✗ ${name}: the report's ok doesn't match the run's exit status (${status})`);
        failed++;
      } else if (strip(read(join(dir, name))) !== strip(read(committed))) {
        console.error(`✗ ${name}: differs from the committed report; run npm run conformance and review the change`);
        failed++;
      } else console.log(`✓ ${name}`);
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
const sheet = spawnSync("node", ["scripts/conformance-sheet.mjs", "--check"], { cwd: root, stdio: "inherit" });
if (sheet.status !== 0) failed++;
process.exit(failed ? 1 : 0);
