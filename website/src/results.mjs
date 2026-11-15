// Keep report discovery build-time: deploying never requires running adapters.
export function collectReports(files) {
  return Object.entries(files).map(([path, report]) => ({
    ...report, key: path.split('/').at(-1).split('.')[0],
  }));
}
// A check's verdict, as the conformance sheet reads it: a failing check
// breaks a MUST ("fail"), a SHOULD ("should"), or only an informational
// check that no spec sentence requires ("info").
export function verdict(check) {
  if (check.status !== 'fail') return check.status;
  if (check.level === 'SHOULD') return 'should';
  if (check.level === 'INFO') return 'info';
  return 'fail';
}
export function summarize(reports) {
  const checks = reports.flatMap(r => r.checks);
  const count = v => checks.filter(c => verdict(c) === v).length;
  return {
    pass: count('pass'),
    fail: count('fail'),
    should: count('should'),
    other: checks.filter(c => !['pass', 'fail', 'should'].includes(verdict(c))).length,
    cases: reports.reduce((n, r) => n + r.cases.distinct, 0),
    findings: reports.reduce((n, r) => n + (r.findings?.length ?? 0), 0),
  };
}
export function selectChecks(reports, area, status, query) {
  return reports.filter(r => area === 'all' || r.area === area)
    .flatMap(r => r.checks.map(check => ({ ...check, area: r.area, verdict: verdict(check) })))
    .filter(c => (status === 'all' || c.verdict === status) &&
      `${c.id} ${c.title} ${c.area}`.toLowerCase().includes(query.trim().toLowerCase()));
}
