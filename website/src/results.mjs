// Keep report discovery build-time: deploying never requires running adapters.
export function collectReports(files) {
  return Object.entries(files).map(([path, report]) => ({
    ...report, key: path.split('/').at(-1).split('.')[0],
  }));
}
export function summarize(reports) {
  const checks = reports.flatMap(r => r.checks);
  return {
    pass: checks.filter(c => c.status === 'pass').length,
    fail: checks.filter(c => c.status === 'fail').length,
    other: checks.filter(c => c.status !== 'pass' && c.status !== 'fail').length,
    cases: reports.reduce((n, r) => n + r.cases.distinct, 0),
    findings: reports.reduce((n, r) => n + (r.findings?.length ?? 0), 0),
  };
}
export function selectChecks(reports, area, status, query) {
  return reports.filter(r => area === 'all' || r.area === area)
    .flatMap(r => r.checks.map(check => ({ ...check, area: r.area })))
    .filter(c => (status === 'all' || c.status === status) &&
      `${c.id} ${c.title} ${c.area}`.toLowerCase().includes(query.trim().toLowerCase()));
}
