import { AREAS } from '../../kit/areas.mjs';

// An area's place in kit/areas.mjs's order; an area it doesn't list comes
// last, so every report is shown.
export function areaOrder(area) {
  return AREAS.includes(area) ? AREAS.indexOf(area) : AREAS.length;
}
// Keep report discovery build-time: deploying never requires running
// adapters. Reports come in area order, as the conformance sheet lists them.
export function collectReports(files) {
  return Object.entries(files).map(([path, report]) => ({
    ...report, key: path.split('/').at(-1).split('.')[0],
  })).sort((a, b) => areaOrder(a.area) - areaOrder(b.area));
}
// The specification areas the reports cover, in area order.
export function areasOf(reports) {
  return [...new Set(reports.map(r => r.area))].sort((a, b) => areaOrder(a) - areaOrder(b));
}
// Every area some report covers, with one implementation's report in it, or
// null where its adapter doesn't take part: an absent area is shown as
// such, never as a pass.
export function areaRows(all, selected) {
  return areasOf(all).map(area => ({ area, report: selected.find(r => r.area === area) ?? null }));
}
// The capabilities an untested check needs (its `requires`) that the
// report's adapter doesn't claim, as the sheet's "– needs `x`".
export function missingCapabilities(check, report) {
  if (check.status !== 'untested' || !report) return [];
  return (check.requires ?? []).filter(c => !(report.capabilities ?? []).includes(c));
}
// A failing check's severity, as the conformance sheet reads it: a MUST (or
// the kit's own ADAPTER checks) fails, a SHOULD is a "should", and an INFO
// check, which no spec sentence requires, is informational.
export function severity(level) {
  return level === 'SHOULD' ? 'should' : level === 'INFO' ? 'info' : 'fail';
}
// A check's verdict: its status, with a failing check's severity in place
// of "fail".
export function verdict(check) {
  return check.status === 'fail' ? severity(check.level) : check.status;
}
export const VERDICT_LABELS = {
  pass: 'pass', fail: 'fail', should: 'should', info: 'informational',
  untested: 'untested', inconclusive: 'inconclusive', subsumed: 'subsumed',
};
// Editions, as the conformance sheet reads them (report format 2). The kit
// grades the latest release, September 2026. RELEASES are the releases
// after October 2021 that introduced rules the kit grades, oldest first;
// reports count failing cases by the one that introduced their rule
// (a check's `failingSince`, a finding's `since`).
export const GRADED = 'September2026';
export const RELEASES = ['September2025', 'September2026'];
// "September2026" as prose: "September 2026".
export function editionName(edition) {
  return edition.replace(/^([A-Za-z]+)(\d{4})$/, '$1 $2');
}
export const GRADED_TEXT = `${editionName(GRADED)} (latest release)`;
// "since September 2025", or "new in September 2026" for the graded release.
export function sinceWords(edition) {
  return `${edition === GRADED ? 'new in' : 'since'} ${editionName(edition)}`;
}
const sinceEntries = since => RELEASES.map(e => [e, since?.[e] ?? 0]).filter(([, n]) => n > 0);
// How many of `total` failing cases rely on rules introduced after October
// 2021, by release, worded as the sheet's cells: "3 since September 2025,
// 1 new in September 2026", or "all new in September 2026". Null if none.
export function sinceText(since, total) {
  const entries = sinceEntries(since);
  if (!entries.length) return null;
  if (entries.length === 1 && entries[0][1] >= total) return `all ${sinceWords(entries[0][0])}`;
  return entries.map(([e, n]) => `${n} ${sinceWords(e)}`).join(', ');
}
// The same as a sentence about `subject` ("the failing cases", "them").
export function sinceSentence(since, total, subject) {
  const entries = sinceEntries(since);
  if (!entries.length) return null;
  if (entries.length === 1 && entries[0][1] >= total) return `All of ${subject} rely on grammar or rules introduced in ${editionName(entries[0][0])}, not in October 2021.`;
  const parts = entries.map(([e, n], i) => i === 0 ? `${n} of ${subject} rely on grammar or rules introduced in ${editionName(e)}` : `${n} on ones introduced in ${editionName(e)}`);
  return `${parts.join(' and ')}, not in October 2021.`;
}
// A failing check's cases on newer rules, as the sheet's cell words them.
export function sinceLabel(check) {
  return check.status === 'fail' ? sinceText(check.failingSince, check.failing) : null;
}
// A check's level: September 2026's, then the release that introduced the
// check's rule if it is newer than October 2021, then each older release
// whose wording gives another level, as the sheet prints it.
export function levelText(check) {
  const notes = [];
  if (check.since) notes.push(sinceWords(check.since));
  const byLevel = new Map();
  for (const [edition, level] of Object.entries(check.levels ?? {})) byLevel.set(level, [...(byLevel.get(level) ?? []), editionName(edition)]);
  for (const [level, editions] of byLevel) notes.push(`${level} in ${editions.join(' and ')}`);
  return notes.length ? `${check.level} (${notes.join('; ')})` : check.level;
}
export function summarize(reports) {
  const checks = reports.flatMap(r => r.checks);
  const count = v => checks.filter(c => verdict(c) === v).length;
  const findings = reports.flatMap(r => r.findings ?? []);
  return {
    pass: count('pass'),
    fail: count('fail'),
    should: count('should'),
    info: count('info'),
    untested: count('untested'),
    other: checks.filter(c => !['pass', 'fail', 'should', 'info', 'untested'].includes(verdict(c))).length,
    cases: reports.reduce((n, r) => n + r.cases.distinct, 0),
    findings: findings.length,
    crashes: findings.filter(f => f.kind === 'crash').reduce((n, f) => n + f.cases, 0),
    adapterProblems: reports.reduce((n, r) => n + (r.adapterProblems ?? 0), 0),
  };
}
const matches = (text, query) => text.toLowerCase().includes(query.trim().toLowerCase());
export function selectChecks(reports, area, status, query) {
  return reports.filter(r => area === 'all' || r.area === area)
    .flatMap(r => r.checks.map(check => ({ ...check, area: r.area, verdict: verdict(check), sinceLabel: sinceLabel(check), needs: missingCapabilities(check, r) })))
    .filter(c => (status === 'all' || c.verdict === status) && matches(`${c.id} ${c.title} ${c.area}`, query));
}
// A finding's severity: the worst level among the checks it breaks. A
// malformed result, which names no check, fails.
export function findingSeverity(finding, checks) {
  const levels = finding.checks.map(id => severity(checks.find(c => c.id === id)?.level));
  if (levels.length === 0 || levels.includes('fail')) return 'fail';
  return levels.includes('should') ? 'should' : 'info';
}
export function selectFindings(reports, area, status, query) {
  return reports.filter(r => area === 'all' || r.area === area)
    .flatMap(r => (r.findings ?? []).map((f, i) => ({
      ...f,
      area: r.area,
      index: i + 1,
      verdict: findingSeverity(f, r.checks),
      crash: f.kind === 'crash',
      sinceLabel: sinceText(f.since, f.cases),
      levels: f.checks.map(id => r.checks.find(c => c.id === id)).filter(Boolean),
    })))
    .filter(f => (status === 'all' || f.verdict === status) &&
      matches(`${f.checks.join(' ')} ${f.summary ?? ''} ${f.problem ?? ''} ${f.area}`, query));
}
// A finding's shortest case, line by line, as the implementation's page
// prints it.
export function exampleLines(finding) {
  const e = finding.example ?? {};
  const json = v => (typeof v === 'string' ? v : JSON.stringify(v));
  return [
    finding.problem && ['problem', finding.problem],
    e.input !== undefined ? ['input', e.input] : e.trace !== undefined && ['trace', e.trace],
    e.sibling !== undefined && ['sibling', json(e.sibling)],
    e.streamError !== undefined ? ['stream', `failed: ${e.streamError}`]
      : e.noResponse !== undefined ? ['response', `none: ${e.noResponse}`]
        : ['response', JSON.stringify(e.response)],
    e.expected && ['expected', e.expected],
  ].filter(Boolean);
}
// Which edition's introspection types a report graded, from its profile
// ("September2026", "September2025", "October2021"), as the sheet words it.
export function profileText(report) {
  if (!report.profile) return null;
  const latest = report.profile === GRADED ? ' (latest release)' : '';
  return `the ${editionName(report.profile)} edition's introspection types${latest}${report.profileNote ? `. ${report.profileNote}` : ''}`;
}
// How many of a report's vectors rely on rules introduced after October
// 2021, and how many of those fail, by release (`since`: { release:
// { vectors, failing } }).
export function sinceReportText(report) {
  const entries = RELEASES.filter(e => report.since?.[e]?.vectors || report.since?.[e]?.failing).map(e => [e, report.since[e]]);
  if (!entries.length) return null;
  return entries.map(([e, { vectors = 0, failing = 0 }]) => `${sinceWords(e)}, ${failing} of ${vectors} vector${vectors === 1 ? '' : 's'} failing`).join('; ');
}
// A hand-written note's Markdown, split into text, code and links. Links
// are relative to conformance/, where the sheet prints the notes.
export function noteParts(markdown, base) {
  const parts = [];
  const pattern = /\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`/g;
  let last = 0;
  for (const m of markdown.matchAll(pattern)) {
    if (m.index > last) parts.push({ type: 'text', text: markdown.slice(last, m.index) });
    if (m[3] !== undefined) parts.push({ type: 'code', text: m[3] });
    else parts.push({ type: 'link', text: m[1].replace(/`/g, ''), href: new URL(m[2], base).href });
    last = m.index + m[0].length;
  }
  if (last < markdown.length) parts.push({ type: 'text', text: markdown.slice(last) });
  return parts;
}
