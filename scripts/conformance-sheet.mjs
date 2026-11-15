// Builds the conformance sheets from the kit's reports.
//
// Reads every conformance/reports/*.json (written by
// `graphql-tla run <area> --report FILE`) and writes:
//
//   conformance/README.md       a matrix: implementations by spec section and check
//   conformance/<impl>.md       one implementation: every check, with the
//                               shortest failing case for each failure
//
// Nothing here is judged by hand: every cell is a count from a report.
//
// Usage: node scripts/conformance-sheet.mjs [--check]

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const dir = join(root, "conformance");
const reportsDir = join(dir, "reports");
const sections = JSON.parse(readFileSync(join(root, "kit/spec-sections.json"), "utf8"));

const reports = readdirSync(reportsDir)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => ({ file: f, ...JSON.parse(readFileSync(join(reportsDir, f), "utf8")) }));

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-|-$/g, "");
const implementations = [...new Set(reports.map((r) => r.implementation))];
const reportFor = (impl, area) => reports.find((r) => r.implementation === impl && r.area === area);
const areas = [...new Set(reports.map((r) => r.area))];
const link = (s) => `[§${s.number}](${s.url})`;
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// A check's cell: ✓ passed, ✗ failed (how many cases), ! a SHOULD broken,
// ~ inconclusive, – never exercised.
const cell = (check) => {
  if (!check) return " ";
  if (check.status === "fail") return check.level === "SHOULD" ? `! ${check.failing}` : `✗ ${check.failing}`;
  if (check.status === "pass") return "✓";
  if (check.status === "inconclusive") return "~";
  return "–";
};

// A section's status for one implementation: failed if a MUST check citing
// it failed, passed if some check citing it passed, untested otherwise.
const sectionStatus = (impl, number) => {
  const checks = reports
    .filter((r) => r.implementation === impl)
    .flatMap((r) => [
      ...r.checks,
      ...r.fixtures.map((f) => ({ ...f, level: "MUST", status: f.status === "skipped" ? "untested" : f.status, failing: f.status === "fail" ? f.cases : 0 })),
    ])
    .filter((c) => c.spec.some((s) => s.number === number));
  if (checks.length === 0) return null;
  const must = checks.filter((c) => c.level === "MUST");
  if (must.some((c) => c.status === "fail")) return "✗";
  if (checks.some((c) => c.status === "fail")) return "!";
  if (checks.some((c) => c.status === "pass")) return "✓";
  if (checks.some((c) => c.status === "inconclusive")) return "~";
  return "–";
};

const legend =
  "✓ every case satisfied it · ✗ n cases broke a MUST · ! n cases broke a SHOULD · ~ inconclusive · – not exercised (the implementation's adapter lacks the capability, or no case reached it)";

const matrix = () => {
  const lines = [];
  lines.push("# Conformance sheet", "");
  lines.push(
    "Which parts of the [GraphQL spec](https://spec.graphql.org/draft/) each implementation was checked against, and what it breaks. Every cell comes from a report written by the [conformance kit](../docs/conformance.md), which runs the implementation through an adapter and checks each response against the TLA+ reference. Nothing is judged by hand.",
    "",
    `Section numbers are from ${sections.source}. Regenerate with \`npm run conformance\`.`,
    "",
    "A ✓ means no case the kit tried broke the rule. It is evidence, not proof: the fixtures are small, and each implementation's adapter decides which capabilities it claims.",
    "",
  );
  lines.push("## Implementations", "");
  lines.push("| Implementation | Areas | Capabilities | Cases (distinct) | Malformed | Checker self-test |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const impl of implementations) {
    const own = reports.filter((r) => r.implementation === impl);
    const submitted = own.reduce((n, r) => n + r.cases.submitted, 0);
    const distinct = own.reduce((n, r) => n + r.cases.distinct, 0);
    const malformed = own.reduce((n, r) => n + r.cases.malformed, 0);
    lines.push(
      `| [${impl}](${slug(impl)}.md) | ${own.map((r) => r.area).join(", ")} | ${own[0].capabilities.join(", ") || "none"} | ${submitted} (${distinct}) | ${malformed} | ${own.every((r) => r.checkerSelfTest.startsWith("passed")) ? "passed" : "failed"} |`,
    );
  }
  lines.push("");

  lines.push("## By spec section", "", legend, "");
  const cited = new Set(reports.flatMap((r) => [...r.checks, ...r.fixtures].flatMap((c) => c.spec.map((s) => s.number))));
  lines.push(`| Section | ${implementations.join(" | ")} |`);
  lines.push(`| --- | ${implementations.map(() => ":---:").join(" | ")} |`);
  for (const s of sections.sections.filter((s) => cited.has(s.number))) {
    lines.push(`| ${link(s)} ${s.title} | ${implementations.map((i) => sectionStatus(i, s.number) ?? " ").join(" | ")} |`);
  }
  const uncited = sections.sections.filter((s) => !cited.has(s.number));
  lines.push(
    "",
    `${plural(uncited.length, "section")} of ${sections.sections.length} aren't checked by the kit yet. The references in [\`specs/\`](../specs) cover most of them, checked against graphql-js only (see [What is checked](../README.md#what-is-checked)). They are listed at the end.`,
    "",
  );

  for (const area of areas) {
    const checks = reports.find((r) => r.area === area).checks;
    lines.push(`## ${area[0].toUpperCase()}${area.slice(1)}: each check`, "", legend, "");
    lines.push(`| Check | Level | Spec | ${implementations.join(" | ")} |`);
    lines.push(`| --- | --- | --- | ${implementations.map(() => ":---:").join(" | ")} |`);
    for (const check of checks) {
      lines.push(
        `| ${check.title} (\`${check.id}\`) | ${check.level} | ${check.spec.map(link).join(" ") || "—"} | ${implementations.map((i) => cell(reportFor(i, area)?.checks.find((c) => c.id === check.id))).join(" | ")} |`,
      );
    }
    lines.push("");
    const fixtures = reports.find((r) => r.area === area).fixtures;
    lines.push(`| Fixture | Spec | ${implementations.join(" | ")} |`);
    lines.push(`| --- | --- | ${implementations.map(() => ":---:").join(" | ")} |`);
    for (const f of fixtures) {
      const cells = implementations.map((i) => {
        const own = reportFor(i, area)?.fixtures.find((x) => x.id === f.id);
        return !own ? " " : own.status === "pass" ? "✓" : own.status === "fail" ? "✗" : `– (${own.reason})`;
      });
      lines.push(`| [\`${f.id}\`](../fixtures/${f.id}.graphql) | ${f.spec.map(link).join(" ")} | ${cells.join(" | ")} |`);
    }
    lines.push("");
  }

  lines.push("## Not checked by the kit yet", "");
  for (const s of uncited) lines.push(`- ${link(s)} ${s.title}`);
  lines.push("");
  return lines.join("\n");
};

const fence = (text) => ["```", text, "```"].join("\n");

const page = (impl) => {
  const lines = [`# ${impl}`, "", `Generated from the conformance kit's reports. Back to the [sheet](README.md).`, ""];
  for (const r of reports.filter((x) => x.implementation === impl)) {
    lines.push(`## ${r.area}`, "");
    lines.push(`- **Capabilities:** ${r.capabilities.join(", ") || "none"}`);
    lines.push(`- **Cases:** ${r.cases.submitted} submitted, ${r.cases.distinct} distinct, ${r.cases.malformed} malformed`);
    lines.push(`- **Checker self-test:** ${r.checkerSelfTest}`);
    lines.push(`- **Strict (SHOULDs fail):** ${r.strict ? "yes" : "no"}`, "");
    lines.push("| Check | Level | Spec | Status | Cases | Failing |", "| --- | --- | --- | --- | --- | --- |");
    for (const c of r.checks) {
      lines.push(`| ${c.title} (\`${c.id}\`) | ${c.level} | ${c.spec.map(link).join(" ") || "—"} | ${cell(c)} ${c.status} | ${c.cases} | ${c.failing} |`);
    }
    lines.push("", "| Fixture | Status | Cases | Note |", "| --- | --- | --- | --- |");
    for (const f of r.fixtures) lines.push(`| [\`${f.id}\`](../fixtures/${f.id}.graphql) | ${f.status} | ${f.cases} | ${f.reason ?? f.note ?? ""} |`);
    lines.push("");
    const failing = r.checks.filter((c) => c.status === "fail" || c.status === "inconclusive");
    if (failing.length > 0) lines.push("### What it breaks", "");
    for (const c of failing) {
      lines.push(`#### ${c.title} (\`${c.id}\`, ${c.level}, ${c.spec.map(link).join(" ") || "the kit's protocol"})`, "");
      lines.push(c.status === "inconclusive" ? c.note : `${plural(c.failing, "case")} of ${c.cases}. The shortest:`, "");
      if (c.example) {
        const e = c.example;
        lines.push(
          fence(
            [
              e.fixture && `fixture:  ${e.fixture}`,
              e.problem && `problem:  ${e.problem}`,
              e.trace && `trace:    ${e.trace}`,
              e.response && `response: ${JSON.stringify(e.response)}`,
              e.expected && `expected: ${e.expected}`,
            ]
              .filter(Boolean)
              .join("\n"),
          ),
          "",
        );
      }
    }
  }
  return lines.join("\n");
};

const outputs = new Map([[join(dir, "README.md"), matrix()], ...implementations.map((i) => [join(dir, `${slug(i)}.md`), page(i)])]);
if (process.argv.includes("--check")) {
  const stale = [...outputs].filter(([path, text]) => !existsSync(path) || readFileSync(path, "utf8") !== text);
  for (const [path] of stale) console.error(`✗ ${path} is out of date; run npm run conformance`);
  process.exit(stale.length ? 1 : 0);
}
for (const [path, text] of outputs) writeFileSync(path, text);
console.log(`wrote ${outputs.size} files from ${plural(reports.length, "report")}`);
