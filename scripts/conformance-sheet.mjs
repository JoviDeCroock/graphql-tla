// Builds the conformance sheets from the kit's reports.
//
// Reads conformance/reports/<key>.json (written by `graphql-tla run <area>
// --report FILE`; scripts/conformance-reports.mjs runs every implementation
// in conformance/implementations.json) and writes:
//
//   conformance/README.md   the matrix: findings, then each check, each spec
//                           section and each fixture, by implementation
//   conformance/<key>.md    one implementation: its findings, each with the
//                           shortest case that shows it, and every check
//
// Every verdict is a count from a report. The only hand-written text is the
// notes in implementations.json, which are labelled as such.
//
// Usage: node scripts/conformance-sheet.mjs [--check]

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AREAS } from "../kit/areas.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const dir = join(root, "conformance");
const sections = JSON.parse(readFileSync(join(root, "kit/spec-sections.json"), "utf8"));
const registry = JSON.parse(readFileSync(join(dir, "implementations.json"), "utf8")).implementations;

const reports = readdirSync(join(dir, "reports"))
  .filter((f) => f.endsWith(".json"))
  .sort()
  // <key>.json for execution, <key>.<area>.json for the other areas.
  .map((f) => ({ key: basename(f, ".json").split(".")[0], ...JSON.parse(readFileSync(join(dir, "reports", f), "utf8")) }))
  .sort((a, b) => AREAS.indexOf(a.area) - AREAS.indexOf(b.area));
const keys = [...new Set(reports.map((r) => r.key))].sort(
  (a, b) => registry.findIndex((x) => x.key === a) - registry.findIndex((x) => x.key === b),
);
const nameOf = (key) => reports.find((r) => r.key === key).implementation;
const notesOf = (key) => registry.find((x) => x.key === key)?.notes ?? [];
const reportFor = (key, area) => reports.find((r) => r.key === key && r.area === area);
const areas = [...new Set(reports.map((r) => r.area))];

const link = (s) => `[§${s.number}](${s.url})`;
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const header = (cols) => [`| ${cols.join(" | ")} |`, `| ${cols.map((_, i) => (i === 0 ? "---" : ":---:")).join(" | ")} |`];
const anchor = (finding, i) => `finding-${i + 1}`;
const fixtureList = (f) =>
  Object.entries(f.fixtures)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => `\`${id}\``)
    .join(", ");

// A check's cell: ✓ N (passed in all N cases), ✗ n/N (broke a MUST in n of
// N), ! n/N (a SHOULD), ~ inconclusive, – not exercised.
const cell = (check) => {
  if (!check) return "n/a";
  if (check.status === "fail") return `${check.level === "MUST" || check.level === "ADAPTER" ? "✗" : "!"} ${check.failing}/${check.cases}`;
  if (check.status === "pass") return `✓ ${check.cases}`;
  if (check.status === "inconclusive") return `~ ${check.cases}`;
  return "–";
};

const legend = [
  "- **✓ N:** every one of the N cases it applied to satisfied it.",
  "- **✗ n/N:** n of N cases broke a MUST. **! n/N:** a SHOULD.",
  "- **~:** inconclusive (see the implementation's page).",
  "- **–:** never exercised: the adapter lacks the capability, or no case reached it.",
  "- **n/a:** the adapter doesn't take part in this area.",
].join("\n");

// A section's verdict, from the checks that cite it (fixtures only say a
// section was exercised): ✗ if a MUST check failed, ! if only a SHOULD did,
// ✓ if every check that ran passed.
const sectionCell = (key, number) => {
  const checks = reports
    .filter((r) => r.key === key)
    .flatMap((r) => r.checks)
    .filter((c) => c.spec.some((s) => s.number === number));
  if (checks.length === 0) return null;
  const failed = checks.filter((c) => c.status === "fail");
  const must = failed.filter((c) => c.level !== "SHOULD");
  if (must.length) return `✗ ${must.map((c) => `\`${c.id}\``).join(" ")}`;
  if (failed.length) return `! ${failed.map((c) => `\`${c.id}\``).join(" ")}`;
  if (checks.some((c) => c.status === "pass")) return "✓";
  if (checks.some((c) => c.status === "inconclusive")) return "~";
  return "–";
};

const caveats = [
  "Read it with these limits in mind:",
  "",
  "- **Small fixtures.** A ✓ means no case the kit tried broke the rule, not that the implementation is correct. The cell gives the number of cases it rests on.",
  "- **One oracle.** The TLA+ references were checked against graphql-js only (differentially, and through the negative controls, which are graphql-js cases broken on purpose). A bug the reference shares with graphql-js would show as ✓ everywhere.",
  "- **Unreviewed adapters.** The kit's authors wrote every adapter, and no implementation's maintainers have reviewed theirs yet. A failure may be the adapter's, not the implementation's. Each adapter's README says how it maps the protocol onto its implementation.",
  "- **Draft text.** Levels are the draft's. Where the October 2021 edition differs, the check says so.",
];

const matrix = () => {
  const lines = [
    "# Conformance sheet",
    "",
    "Which parts of the [GraphQL spec](https://spec.graphql.org/draft/) each implementation was checked against, and what it breaks. Every verdict comes from a report written by the [conformance kit](../docs/conformance.md), which drives the implementation through an adapter and checks each response against the TLA+ reference. Section numbers are from " +
      sections.source +
      ". Regenerate with `npm run conformance`.",
    "",
    ...caveats,
    "",
    "## Implementations",
    "",
    ...header(["Implementation", "Areas", "Capabilities", "Cases (distinct)", "Findings", "Malformed cases", "Adapter problems", "Checker self-test", "Kit"]),
  ];
  for (const key of keys) {
    const own = reports.filter((r) => r.key === key);
    const sum = (f) => own.reduce((n, r) => n + f(r), 0);
    lines.push(
      `| [${nameOf(key)}](${key}.md) | ${own.map((r) => r.area).join(", ")} | ${own[0].capabilities.join(", ") || "none"} | ${sum((r) => r.cases.submitted)} (${sum((r) => r.cases.distinct)}) | ${sum((r) => r.findings.length)} | ${sum((r) => r.cases.malformed)} | ${sum((r) => r.adapterProblems) || "none"} | ${own.every((r) => r.checkerSelfTest.startsWith("passed")) ? "passed" : "**failed**"} | ${own[0].provenance.kit}, ${own[0].provenance.date} |`,
    );
  }

  lines.push("", "## Findings", "", "Each finding is one kind of failure: the set of clauses a case broke, or a malformed case's first problem, which is the root cause when one fault shows up several ways. A case counts toward one finding only.", "");
  for (const key of keys) {
    const findings = reports.filter((r) => r.key === key).flatMap((r) => r.findings);
    lines.push(`- **[${nameOf(key)}](${key}.md):** ${findings.length === 0 ? "none" : ""}`);
    findings.forEach((f, i) => {
      lines.push(`  - [${f.checks.map((c) => `\`${c}\``).join(", ") || "malformed result"}](${key}.md#${anchor(f, i)})${f.summary ? `: ${f.summary}` : ""} (${plural(f.cases, "case")}, ${fixtureList(f)})`);
    });
  }
  lines.push("");

  for (const area of areas) {
    const first = reports.find((r) => r.area === area);
    lines.push(`## ${cap(area)}: each check`, "", legend, "", ...header(["Check", "Level", "Spec", ...keys.map(nameOf)]));
    for (const check of first.checks) {
      const level = check.oct2021 ? `${check.level} (Oct 2021: ${check.oct2021})` : check.level;
      lines.push(
        `| ${check.title} (\`${check.id}\`) | ${level} | ${check.spec.map(link).join(" ") || "—"} | ${keys.map((k) => cell(reportFor(k, area)?.checks.find((c) => c.id === check.id))).join(" | ")} |`,
      );
    }
    lines.push("");
    if (first.fixtures.length === 0) continue;
    lines.push(`### ${cap(area)}: each fixture`, "", "The sections a fixture lists are the ones it exercises; its verdict is whether any of its cases failed a check.", "");
    lines.push(...header(["Fixture", "Exercises", ...keys.map(nameOf)]));
    for (const f of first.fixtures) {
      const cells = keys.map((k) => {
        const own = reportFor(k, area)?.fixtures.find((x) => x.id === f.id);
        if (!own) return " ";
        if (own.status === "skipped") return `– ${own.reason}`;
        return own.status === "pass" ? `✓ ${own.cases}` : `✗ ${own.failing}/${own.cases}`;
      });
      lines.push(`| [\`${f.id}\`](../fixtures/${f.id}.graphql) | ${f.spec.map(link).join(" ")} | ${cells.join(" | ")} |`);
    }
    lines.push("");
  }

  const checked = new Set(reports.flatMap((r) => r.checks.flatMap((c) => c.spec.map((s) => s.number))));
  const exercised = new Set(reports.flatMap((r) => r.fixtures.flatMap((f) => f.spec.map((s) => s.number))));
  lines.push(
    "## By spec section",
    "",
    "A section's verdict comes from the checks that cite it, and names the ones that failed. Sections that fixtures exercise but no check targets have no verdict of their own; their fixtures' verdicts are above.",
    "",
    ...header(["Section", ...keys.map(nameOf)]),
  );
  for (const s of sections.sections.filter((s) => checked.has(s.number))) {
    lines.push(`| ${link(s)} ${s.title} | ${keys.map((k) => sectionCell(k, s.number) ?? " ").join(" | ")} |`);
  }
  const onlyExercised = sections.sections.filter((s) => exercised.has(s.number) && !checked.has(s.number));
  lines.push("", `Exercised by fixtures, without a check of their own: ${onlyExercised.map((s) => `${link(s)} ${s.title}`).join(", ")}.`, "");

  const uncited = sections.sections.filter((s) => !checked.has(s.number) && !exercised.has(s.number));
  lines.push(
    "## Not checked by the kit yet",
    "",
    `${plural(uncited.length, "section")} of ${sections.sections.length}. The references in [\`specs/\`](../specs) cover most of them, but are checked against graphql-js only, by the differential scripts (see [What is checked](../README.md#what-is-checked)).`,
    "",
    ...uncited.map((s) => `- ${link(s)} ${s.title}`),
    "",
  );
  return lines.join("\n");
};

const fence = (text) => ["```", text, "```"].join("\n");

const page = (key) => {
  const lines = [`# ${nameOf(key)}`, "", "Generated from the conformance kit's reports. Back to the [sheet](README.md).", ""];
  const notes = notesOf(key);
  if (notes.length) lines.push("**Notes** (hand-written, from outside the kit):", "", ...notes.map((n) => `- ${n}`), "");
  for (const r of reports.filter((x) => x.key === key)) {
    lines.push(`## ${cap(r.area)}`, "");
    lines.push(`- **Capabilities:** ${r.capabilities.join(", ") || "none"}`);
    lines.push(`- **Cases:** ${r.cases.submitted} submitted, ${r.cases.distinct} distinct, ${r.cases.malformed} malformed`);
    lines.push(`- **Adapter problems:** ${r.adapterProblems || "none"}`);
    lines.push(`- **Checker self-test:** ${r.checkerSelfTest}`);
    const p = r.provenance;
    lines.push(
      `- **Run:** kit ${p.kit}, ${p.date}, ${p.strict ? "strict" : "not strict"}${p.random !== undefined ? `, ${p.random} random runs per fixture (seed ${p.seed})` : ""}${p.exhaustive !== undefined ? `, exhaustive runs ${p.exhaustive ? "on" : "off"}` : ""}`,
      "",
    );
    lines.push("### Findings", "");
    if (r.findings.length === 0) lines.push("None.", "");
    r.findings.forEach((f, i) => {
      const checks = f.checks.map((id) => r.checks.find((c) => c.id === id));
      lines.push(
        `<a id="${anchor(f, i)}"></a>`,
        "",
        `#### ${i + 1}. ${checks.map((c) => `\`${c.id}\``).join(", ") || "malformed result"}${f.summary ? `: ${f.summary}` : ""}`,
        "",
        `${plural(f.cases, "case")}, in ${Object.entries(f.fixtures).sort((a, b) => b[1] - a[1]).map(([id, n]) => `\`${id}\` (${n})`).join(", ")}.`,
        "",
      );
      for (const c of checks) lines.push(`- ${c.title} (${c.level}${c.spec.length ? `, ${c.spec.map(link).join(" ")}` : ""})`);
      lines.push("", `The shortest case, from \`${f.fixture}\`:`, "");
      const e = f.example;
      lines.push(
        fence(
          [
            f.problem && `problem:  ${f.problem}`,
            e.input !== undefined ? `input:    ${e.input}` : `trace:    ${e.trace}`,
            e.sibling !== undefined && `sibling:  ${typeof e.sibling === "string" ? e.sibling : JSON.stringify(e.sibling)}`,
            e.streamError !== undefined ? `stream:   failed: ${e.streamError}` : `response: ${JSON.stringify(e.response)}`,
            e.expected && `expected: ${e.expected}`,
          ]
            .filter(Boolean)
            .join("\n"),
        ),
        "",
      );
    });
    lines.push("### Every check", "", legend, "", ...header(["Check", "Level", "Spec", "Result"]));
    for (const c of r.checks) {
      const level = c.oct2021 ? `${c.level} (Oct 2021: ${c.oct2021})` : c.level;
      lines.push(`| ${c.title} (\`${c.id}\`)${c.note ? `. ${c.note}` : ""} | ${level} | ${c.spec.map(link).join(" ") || "—"} | ${cell(c)} |`);
    }
    const based = r.checks.filter((c) => c.basis);
    if (based.length) lines.push("", ...based.map((c) => `- **\`${c.id}\`** is implied rather than stated: ${c.basis}`));
    if (r.fixtures.length) lines.push("", "### Fixtures", "", ...header(["Fixture", "Result", "Note"]));
    for (const f of r.fixtures) {
      const result = f.status === "skipped" ? "–" : f.status === "pass" ? `✓ ${f.cases}` : `✗ ${f.failing}/${f.cases}`;
      lines.push(`| [\`${f.id}\`](../fixtures/${f.id}.graphql) | ${result} | ${f.reason ?? f.note ?? ""} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
};

const outputs = new Map([[join(dir, "README.md"), matrix()], ...keys.map((k) => [join(dir, `${k}.md`), page(k)])]);
if (process.argv.includes("--check")) {
  const stale = [...outputs].filter(([path, text]) => !existsSync(path) || readFileSync(path, "utf8") !== text);
  for (const [path] of stale) console.error(`✗ ${path} is out of date; run node scripts/conformance-sheet.mjs`);
  process.exit(stale.length ? 1 : 0);
}
for (const [path, text] of outputs) writeFileSync(path, text);
console.log(`wrote ${outputs.size} files from ${plural(reports.length, "report")}`);
