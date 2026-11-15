// Keep report discovery build-time: deploying never requires running adapters.
export function collectReports(files) {
  return Object.entries(files).map(([path, report]) => ({
    ...report, key: path.split('/').at(-1).split('.')[0],
  }));
}
// The specification areas the reports cover.
export function areasOf(reports) {
  return [...new Set(reports.map(r => r.area))];
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
// How many of a failing check's cases rely on grammar or rules only in the
// draft, worded as the sheet's "(all draft only)" and "(n draft only)".
export function draftOnlyLabel(check) {
  if (check.status !== 'fail' || !check.failingDraftOnly) return null;
  return check.failingDraftOnly >= check.failing ? 'all draft only' : `${check.failingDraftOnly} draft only`;
}
// A check's level, with how the October 2021 edition differs, as the sheet
// prints it.
export function levelText(check) {
  if (check.oct2021) return `${check.level} (Oct 2021: ${check.oct2021})`;
  return check.edition === 'draft' ? `${check.level} (draft only)` : check.level;
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
    .flatMap(r => r.checks.map(check => ({ ...check, area: r.area, verdict: verdict(check), draftLabel: draftOnlyLabel(check) })))
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
      draftLabel: f.draftOnly ? (f.draftOnly >= f.cases ? 'all draft only' : `${f.draftOnly} draft only`) : null,
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
// Which introspection edition a report graded, as the sheet words it.
export function profileText(report) {
  if (!report.profile) return null;
  const edition = report.profile === 'draft' ? "the draft's introspection types" : `the ${report.profile} edition's introspection types`;
  return `${edition}${report.profileNote ? `. ${report.profileNote}` : ''}`;
}
// How many failing vectors of a report rely on the draft.
export function draftOnlyText(report) {
  const d = report.draftOnly;
  if (!d) return null;
  return `${typeof d === 'object' ? `${d.failing ?? 0} of the failing vectors (of ${d.vectors} draft-only vectors)` : d} rely on grammar or rules only in the draft`;
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
