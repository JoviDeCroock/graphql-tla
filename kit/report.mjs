// What every area's report shares (docs/conformance.md, "Reports"): the
// format version, spec sections by number, and where the run came from.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../..");

export const REPORT_FORMAT = 2;

const sections = new Map(
  JSON.parse(readFileSync(join(root, "kit/spec-sections.json"), "utf8")).sections.map((s) => [s.number, s]),
);

// A spec section ({ number, title, url }) by its number in September 2026.
export const section = (number) => {
  const s = sections.get(number);
  if (!s) throw new Error(`no spec section ${number} in kit/spec-sections.json`);
  return s;
};

// The kit's commit, with "+dirty" if the kit, the specs or the fixtures
// have changes that aren't committed.
export const kitCommit = () => {
  const git = (...args) => execFileSync("git", args, { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  try {
    const dirty = git("status", "--porcelain", "--untracked-files=no", "--", "kit", "specs", "fixtures") !== "";
    return `${git("rev-parse", "--short=12", "HEAD")}${dirty ? "+dirty" : ""}`;
  } catch {
    return "unknown";
  }
};

export const provenance = (extra = {}) => ({ kit: kitCommit(), date: new Date().toISOString().slice(0, 10), ...extra });
