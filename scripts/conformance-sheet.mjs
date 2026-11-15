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
// Usage: node scripts/conformance-sheet.mjs [--check] [--dir DIR]
//
// --dir reads DIR/implementations.json and DIR/reports and writes the
// sheets to DIR instead of conformance/ (the tests use it).

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AREAS } from "../kit/areas.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const dirFlag = process.argv.indexOf("--dir");
const dir = dirFlag === -1 ? join(root, "conformance") : resolve(process.argv[dirFlag + 1]);
const sections = JSON.parse(readFileSync(join(root, "kit/spec-sections.json"), "utf8"));
const registry = JSON.parse(readFileSync(join(dir, "implementations.json"), "utf8")).implementations;

// The report format this sheet reads (kit/report.mjs REPORT_FORMAT). Format
// 2 labels failing cases by the release that introduced their rules; a
// format 1 report ("draft only") can't be read that way, so the sheet
// refuses to build from one.
export const FORMAT = 2;
// Areas in kit/areas.mjs's order; an area it doesn't list (a report from a
// newer kit) comes last, so every report is shown.
export const areaOrder = (area) => (AREAS.includes(area) ? AREAS.indexOf(area) : AREAS.length);
const reports = readdirSync(join(dir, "reports"))
  .filter((f) => f.endsWith(".json"))
  .sort()
  // <key>.json for execution, <key>.<area>.json for the other areas.
  .map((f) => ({ file: f, key: basename(f, ".json").split(".")[0], ...JSON.parse(readFileSync(join(dir, "reports", f), "utf8")) }))
  .sort((a, b) => areaOrder(a.area) - areaOrder(b.area));
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
// A finding's anchor on its implementation's page: numbered within its area.
const anchor = (area, i) => `${area}-finding-${i + 1}`;
const fixtureList = (f) =>
  Object.entries(f.fixtures)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => `\`${id}\``)
    .join(", ");

// A failing check's severity: a MUST (or the kit's own ADAPTER checks)
// fails, a SHOULD is a should, an INFO check is informational. Each has
// its symbol, whatever release the failing cases' rules come from.
export const severity = (level) => (level === "SHOULD" ? "SHOULD" : level === "INFO" ? "INFO" : "MUST");
const SYMBOL = { MUST: "✗", SHOULD: "!", INFO: "i" };

// Editions. The kit grades the latest release, September 2026. The
// releases after October 2021 that introduced rules the kit grades, oldest
// first: reports count failing cases by the one that introduced their rule
// (`failingSince`, a finding's `since`), and a case the October 2021
// edition already decides the same way has none.
export const GRADED = "September2026";
export const RELEASES = ["September2025", "September2026"];
// "September2026" as prose: "September 2026".
export const editionName = (edition) => edition.replace(/^([A-Za-z]+)(\d{4})$/, "$1 $2");
// How a count of cases relying on a release's rules is worded: "since
// September 2025", or "new in September 2026" for the graded release.
export const sinceWords = (edition) => `${edition === GRADED ? "new in" : "since"} ${editionName(edition)}`;
const sinceEntries = (since) => RELEASES.map((e) => [e, since?.[e] ?? 0]).filter(([, n]) => n > 0);
const sinceTotal = (since) => sinceEntries(since).reduce((n, [, k]) => n + k, 0);
// The first release whose rules every one of `total` failing cases needs
// (the earliest that has any of them), or null if some case fails under
// October 2021's rules too.
export const failsFrom = (since, total) => (total > 0 && sinceTotal(since) >= total ? sinceEntries(since)[0][0] : null);
// "3 since September 2025, 1 new in September 2026"; "all new in September
// 2026" when every one of `total` cases relies on one release.
export const sinceText = (since, total) => {
  const entries = sinceEntries(since);
  if (entries.length === 1 && entries[0][1] >= total) return `all ${sinceWords(entries[0][0])}`;
  return entries.map(([e, n]) => `${n} ${sinceWords(e)}`).join(", ");
};
const sinceNote = (c) => (sinceEntries(c.failingSince).length ? ` (${sinceText(c.failingSince, c.failing)})` : "");

// The capabilities an untested check needs (its `requires`) that the
// report's adapter doesn't claim.
export const missingCapabilities = (check, report) =>
  check?.status === "untested" && report ? (check.requires ?? []).filter((c) => !(report.capabilities ?? []).includes(c)) : [];

// A check's cell: ✓ N (passed in all N cases), ✗ n/N (broke a MUST in n of
// N), ! n/N (a SHOULD), i n/N (an informational check differed), each with
// how many of the n rely on rules introduced after October 2021, by
// release; ~ inconclusive, ⊂ subsumed by another check, – not exercised
// ("– needs `x`" when the adapter lacks a capability the check requires).
export const cell = (check, report) => {
  if (!check) return "n/a";
  if (check.status === "fail") return `${SYMBOL[severity(check.level)]} ${check.failing}/${check.cases}${sinceNote(check)}`;
  if (check.status === "pass") return `✓ ${check.cases}`;
  if (check.status === "inconclusive") return `~ ${check.cases}`;
  if (check.status === "subsumed") return "⊂";
  const missing = missingCapabilities(check, report);
  return missing.length ? `– needs ${missing.map((c) => `\`${c}\``).join(", ")}` : "–";
};

// Every check of an area, in the order its reports list them: the first
// report's, then any that only later reports have (a check another report
// predates), so no report's check is dropped from the matrix.
export const areaChecks = (areaReports) => {
  const seen = new Map();
  for (const r of areaReports) for (const c of r.checks) if (!seen.has(c.id)) seen.set(c.id, c);
  return [...seen.values()];
};

// A check's level: September 2026's, then the release that introduced the
// check's rule if it is newer than October 2021, then each older release
// whose wording gives another level (`levels`), grouped by level:
// "MUST (SHOULD in September 2025 and October 2021)".
export const levelText = (c) => {
  const notes = [];
  if (c.since) notes.push(sinceWords(c.since));
  const byLevel = new Map();
  for (const [edition, level] of Object.entries(c.levels ?? {})) byLevel.set(level, [...(byLevel.get(level) ?? []), editionName(edition)]);
  for (const [level, editions] of byLevel) notes.push(`${level} in ${editions.join(" and ")}`);
  return notes.length ? `${c.level} (${notes.join("; ")})` : c.level;
};

const legend = [
  "- **✓ N:** every one of the N cases it applied to satisfied it.",
  "- **✗ n/N:** n of N cases broke a MUST. **! n/N:** a SHOULD.",
  "- **i n/N:** an informational check, which no spec sentence requires (for example graphql-js's experimental execution without error propagation, or how a JSON parser reads large numbers), differed in n of N cases. Never a failure.",
  "- **(k since September 2025, j new in September 2026), (all …):** k of the n failing cases rely on grammar or rules introduced in September 2025, and j on ones introduced in September 2026; none of them is in the October 2021 edition. The symbol still gives the check's level.",
  "- **~:** inconclusive (see the implementation's page).",
  "- **⊂:** subsumed: every input that breaks this rule also breaks a broader one, so a rejection can't be credited to it (accepting such an input still fails it).",
  "- **–:** never exercised: the adapter lacks the capability, or no case reached it. **– needs `x`:** the adapter doesn't claim capability `x`, which the check needs.",
  "- **n/a:** the adapter doesn't take part in this area, or its report predates the check.",
].join("\n");

// A section's verdict, from the checks that cite it (fixtures only say a
// section was exercised). Failing checks are named in groups, worst level
// first: ✗ for MUSTs, ! for SHOULDs, i for informational checks, each group
// split into the checks that fail under October 2021's rules too and those
// whose failing cases all rely on newer rules, by the first release they
// fail in ("(since September 2025)", "(new in September 2026)"). With no
// MUST or SHOULD failing, the verdict leads with ✓ if a check passed (~ if
// one was inconclusive).
export const sectionVerdict = (checks) => {
  if (checks.length === 0) return null;
  const failed = checks.filter((c) => c.status === "fail");
  const ids = (cs) => cs.map((c) => `\`${c.id}\``).join(" ");
  const groups = [];
  for (const level of ["MUST", "SHOULD", "INFO"]) {
    const at = failed.filter((c) => severity(c.level) === level);
    const outright = at.filter((c) => !failsFrom(c.failingSince, c.failing));
    if (outright.length) groups.push(`${SYMBOL[level]} ${ids(outright)}`);
    for (const release of RELEASES) {
      const newer = at.filter((c) => failsFrom(c.failingSince, c.failing) === release);
      if (newer.length) groups.push(`${SYMBOL[level]} (${sinceWords(release)}) ${ids(newer)}`);
    }
  }
  if (failed.some((c) => severity(c.level) !== "INFO")) return groups.join("; ");
  const base = checks.some((c) => c.status === "pass") ? "✓" : checks.some((c) => c.status === "inconclusive") ? "~" : groups.length ? null : "–";
  return [base, ...groups].filter(Boolean).join("; ");
};
const sectionCell = (key, number) =>
  sectionVerdict(
    reports
      .filter((r) => r.key === key)
      .flatMap((r) => r.checks)
      .filter((c) => c.spec.some((s) => s.number === number)),
  );

// A fixture's verdict: ✗ if a failing case broke a MUST, ! if the failing
// cases broke only SHOULDs (the kit fails a fixture on a SHOULD in strict
// runs). The level comes from the findings that hold the fixture's cases;
// n counts every failing case.
export const fixtureCell = (fixture, report) => {
  if (fixture.status === "skipped") return "–";
  if (fixture.status === "pass") return fixture.informational ? `i ${fixture.informational}/${fixture.cases}` : `✓ ${fixture.cases}`;
  const levels = report.findings
    .filter((f) => f.fixtures?.[fixture.id])
    .flatMap((f) => (f.checks.length ? f.checks.map((id) => severity(report.checks.find((c) => c.id === id)?.level)) : ["MUST"]));
  const symbol = levels.includes("MUST") || levels.length === 0 ? "✗" : levels.includes("SHOULD") ? "!" : "i";
  return `${symbol} ${fixture.failing}/${fixture.cases}`;
};

// A finding's level, as a label: none for a MUST, else "(SHOULD)" or
// "(informational)"; and "(since September 2025)" or "(new in September
// 2026)" when every case relies on rules introduced after October 2021,
// naming the first release they all fail in.
export const findingLabels = (f, checks) => {
  const levels = f.checks.map((id) => severity(checks.find((c) => c.id === id)?.level));
  const worst = levels.length === 0 || levels.includes("MUST") ? "MUST" : levels.includes("SHOULD") ? "SHOULD" : "INFO";
  const from = failsFrom(f.since, f.cases);
  return [worst === "SHOULD" && "(SHOULD)", worst === "INFO" && "(informational)", from && `(${sinceWords(from)})`].filter(Boolean);
};
// A finding's cases that rely on rules introduced after October 2021, as a
// sentence, or "".
export const findingSinceText = (f) => {
  const entries = sinceEntries(f.since);
  if (!entries.length) return "";
  if (entries.length === 1 && entries[0][1] >= f.cases) return `All rely on grammar or rules introduced in ${editionName(entries[0][0])}, not in October 2021.`;
  const parts = entries.map(([e, n], i) => (i === 0 ? `${n} of them rely on grammar or rules introduced in ${editionName(e)}` : `${n} on ones introduced in ${editionName(e)}`));
  return `${parts.join(" and ")}, not in October 2021.`;
};
// A report's vectors that rely on rules introduced after October 2021
// (`since`: { release: { vectors, failing } }), as a sentence, or null.
export const reportSinceText = (r) => {
  const entries = RELEASES.filter((e) => r.since?.[e]?.vectors || r.since?.[e]?.failing).map((e) => [e, r.since[e]]);
  if (!entries.length) return null;
  return entries.map(([e, { vectors = 0, failing = 0 }]) => `${sinceWords(e)}, ${failing} of ${plural(vectors, "vector")} failing`).join("; ");
};
// Which edition's introspection types a report graded, from its profile
// ("September2026", "September2025", "October2021").
export const profileText = (r) =>
  r.profile ? `the ${editionName(r.profile)} edition's introspection types${r.profile === GRADED ? " (latest release)" : ""}${r.profileNote ? `. ${r.profileNote}` : ""}` : null;

const caveats = [
  "Read it with these limits in mind:",
  "",
  "- **Small fixtures.** A ✓ means no case the kit tried broke the rule, not that the implementation is correct. The cell gives the number of cases it rests on.",
  "- **One oracle.** The TLA+ references were checked against graphql-js only (differentially, and through the negative controls, which are graphql-js cases broken on purpose). A bug the reference shares with graphql-js would show as ✓ everywhere.",
  "- **Unreviewed adapters.** The kit's authors wrote every adapter, and no implementation's maintainers have reviewed theirs yet. A failure may be the adapter's, not the implementation's. Each adapter's README says how it maps the protocol onto its implementation.",
  "- **Edition.** The kit grades the September 2026 edition, the latest release: its rules and its levels. Where September 2025 or October 2021 gives a check another level, its level says so. Failing cases that rely on grammar or rules introduced after October 2021 are counted by the release that introduced them, \"since September 2025\" or \"new in September 2026\", so an implementation of an older edition can tell them apart.",
];

const matrix = () => {
  const lines = [
    "# Conformance sheet",
    "",
    "Which parts of the [GraphQL spec](https://spec.graphql.org/September2026/), September 2026 (latest release), each implementation was checked against, and what it breaks. Every verdict comes from a report written by the [conformance kit](../docs/conformance.md), which drives the implementation through an adapter and checks each response against the TLA+ reference. Section numbers are from " +
      sections.source +
      ". Regenerate with `npm run conformance`.",
    "",
    ...caveats,
    "",
    "## Implementations",
    "",
    ...header(["Implementation", "Areas", "Capabilities", "Cases (distinct)", "Finding groups", "Cases failing direct checks", "Adapter problems", "Checker self-test", "Kit"]),
  ];
  for (const key of keys) {
    const own = reports.filter((r) => r.key === key);
    const sum = (f) => own.reduce((n, r) => n + f(r), 0);
    lines.push(
      `| [${nameOf(key)}](${key}.md) | ${own.map((r) => r.area).join(", ")} | ${own[0].capabilities.join(", ") || "none"} | ${sum((r) => r.cases.submitted)} (${sum((r) => r.cases.distinct)}) | ${sum((r) => r.findings.length)} | ${sum((r) => r.cases.malformed)} | ${sum((r) => r.adapterProblems) || "none"} | ${own.every((r) => r.checkerSelfTest.startsWith("passed")) ? "passed" : "**failed**"} | ${own[0].provenance.kit}, ${own[0].provenance.date} |`,
    );
  }

  lines.push(
    "",
    "**Finding groups** counts kinds of failure, not distinct bugs: one root cause can show up as several groups, and the number isn't a ranking. **Cases failing direct checks** are cases the kit rejected before consulting the reference, for something it checks on its own, such as a response stream that failed, a leaf value that should have raised an error, or a malformed error entry. They are the implementation's failures unless the adapter-problems column says otherwise.",
  );
  lines.push("", "## Findings", "", "Each finding is one kind of failure: the set of clauses or direct checks a case broke. A case belongs to one finding, but a malformed case counts against every check it breaks, so one problem never hides another.", "");
  for (const key of keys) {
    const own = reports.filter((r) => r.key === key);
    const findings = own.flatMap((r) => r.findings.map((f, i) => ({ f, i, area: r.area, labels: findingLabels(f, r.checks) })));
    lines.push(`- **[${nameOf(key)}](${key}.md):** ${findings.length === 0 ? "none" : ""}`);
    findings.forEach(({ f, i, area, labels }) => {
      lines.push(`  - ${labels.map((l) => `${l} `).join("")}[${f.checks.map((c) => `\`${c}\``).join(", ") || "malformed result"}](${key}.md#${anchor(area, i)})${f.summary ? `: ${f.summary}` : ""} (${plural(f.cases, "case")}, ${fixtureList(f)})`);
    });
  }
  lines.push("");

  for (const area of areas) {
    const first = reports.find((r) => r.area === area);
    lines.push(`## ${cap(area)}: each check`, "", legend, "", ...header(["Check", "Level", "Spec", ...keys.map(nameOf)]));
    for (const check of areaChecks(reports.filter((r) => r.area === area))) {
      const level = levelText(check);
      lines.push(
        `| ${check.title} (\`${check.id}\`) | ${level} | ${check.spec.map(link).join(" ") || "—"} | ${keys.map((k) => cell(reportFor(k, area)?.checks.find((c) => c.id === check.id), reportFor(k, area))).join(" | ")} |`,
      );
    }
    lines.push("");
    if (first.fixtures.length === 0) continue;
    lines.push(`### ${cap(area)}: each fixture`, "", "The sections a fixture lists are the ones it exercises; its verdict is whether any of its cases failed a check: ✗ n/N if a failing case broke a MUST, ! n/N if the failing cases broke only SHOULDs, where n counts every failing case; i n/N if they only differed on an informational check.", "");
    lines.push(...header(["Fixture", "Exercises", ...keys.map(nameOf)]));
    for (const f of first.fixtures) {
      const cells = keys.map((k) => {
        const own = reportFor(k, area)?.fixtures.find((x) => x.id === f.id);
        if (!own) return " ";
        if (own.status === "skipped") return `– ${own.reason}`;
        return fixtureCell(own, reportFor(k, area));
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
    "A section's verdict comes from the checks that cite it, and names the ones that failed, worst level first: ✗ for a MUST, ! for a SHOULD, i for an informational check that differed. Within a level, **(since September 2025)** and **(new in September 2026)** mark the checks whose failing cases all rely on grammar or rules introduced after October 2021, by the first release they fail in. With no MUST or SHOULD failing, ✓ means every check that ran passed or only differed informationally, ~ that one was inconclusive and – that none was exercised. Sections that fixtures exercise but no check targets have no verdict of their own; their fixtures' verdicts are above.",
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
    if (r.cases.skipped) lines.push(`- **Skipped:** ${r.cases.skipped}`);
    const p0 = r.provenance;
    if (p0.vectors === undefined && p0.skipped && Object.keys(p0.skipped).length) {
      lines.push(`- **Not sent:** ${Object.entries(p0.skipped).map(([reason, n]) => `${n} ${reason}`).join(", ")}`);
    }
    if (p0.vectors !== undefined && p0.graded !== undefined) {
      const why = Object.entries(p0.skipped ?? {}).map(([reason, n]) => `${n} ${reason}`).join(", ");
      lines.push(`- **Vectors:** ${p0.graded} of ${p0.vectors} graded${why ? ` (not graded: ${why})` : ""}`);
    }
    if (r.profile) lines.push(`- **Profile:** ${profileText(r)}`);
    if (reportSinceText(r)) lines.push(`- **Vectors relying on rules after October 2021:** ${reportSinceText(r)}`);
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
        `<a id="${anchor(r.area, i)}"></a>`,
        "",
        `#### ${i + 1}. ${checks.map((c) => `\`${c.id}\``).join(", ") || "malformed result"}${f.summary ? `: ${f.summary}` : ""}`,
        "",
        `${plural(f.cases, "case")}, in ${Object.entries(f.fixtures).sort((a, b) => b[1] - a[1]).map(([id, n]) => `\`${id}\` (${n})`).join(", ")}.${findingSinceText(f) ? ` ${findingSinceText(f)}` : ""}`,
        "",
      );
      if (f.hint?.length) lines.push(`Each rejected document is one edit from a document that breaks only ${f.hint.map((id) => `\`${id}\``).join(" or ")}${f.likelyOverStrict ? ", so that rule is likely over-strict" : "; which rule the implementation applied is a guess"}.`, "");
      for (const c of checks) lines.push(`- ${c.title} (${c.level}${c.spec.length ? `, ${c.spec.map(link).join(" ")}` : ""})`);
      lines.push("", `The shortest case, from \`${f.fixture}\`:`, "");
      const e = f.example;
      lines.push(
        fence(
          [
            f.problem && `problem:  ${f.problem}`,
            e.input !== undefined ? `input:    ${e.input}` : `trace:    ${e.trace}`,
            e.sibling !== undefined && `sibling:  ${typeof e.sibling === "string" ? e.sibling : JSON.stringify(e.sibling)}`,
            e.streamError !== undefined
              ? `stream:   failed: ${e.streamError}`
              : e.noResponse !== undefined
                ? `response: none: ${e.noResponse}`
                : `response: ${JSON.stringify(e.response)}`,
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
      const level = levelText(c);
      const observed = c.observed === undefined ? "" : `. Observed: ${typeof c.observed === "string" ? c.observed : Object.entries(c.observed).map(([k, v]) => `${k} ${v}`).join(", ")}`;
      lines.push(`| ${c.title} (\`${c.id}\`)${c.note ? `. ${c.note}` : ""}${observed} | ${level} | ${c.spec.map(link).join(" ") || "—"} | ${cell(c, r)} |`);
    }
    const based = r.checks.filter((c) => c.basis);
    if (based.length) lines.push("", ...based.map((c) => `- **Basis for \`${c.id}\`:** ${c.basis}`));
    if (r.fixtures.length) lines.push("", "### Fixtures", "", ...header(["Fixture", "Result", "Note"]));
    for (const f of r.fixtures) {
      const result = fixtureCell(f, r);
      lines.push(`| [\`${f.id}\`](../fixtures/${f.id}.graphql) | ${result} | ${f.reason ?? f.note ?? ""} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
};

// Writes the sheets when run, not when a test imports the helpers above.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const old = reports.filter((r) => r.format !== FORMAT);
  if (old.length) {
    console.error(`✗ ${plural(old.length, "report")} in ${relative(process.cwd(), join(dir, "reports"))} ${old.length === 1 ? "isn't" : "aren't"} format ${FORMAT} (${old.slice(0, 3).map((r) => `${r.file}: format ${r.format}`).join(", ")}${old.length > 3 ? ", …" : ""}); regenerate them with npm run conformance`);
    process.exit(1);
  }
  const outputs = new Map([[join(dir, "README.md"), matrix()], ...keys.map((k) => [join(dir, `${k}.md`), page(k)])]);
  if (process.argv.includes("--check")) {
    const stale = [...outputs].filter(([path, text]) => !existsSync(path) || readFileSync(path, "utf8") !== text);
    for (const [path] of stale) console.error(`✗ ${path} is out of date; run node scripts/conformance-sheet.mjs`);
    process.exit(stale.length ? 1 : 0);
  }
  for (const [path, text] of outputs) writeFileSync(path, text);
  console.log(`wrote ${outputs.size} files from ${plural(reports.length, "report")}`);
}
