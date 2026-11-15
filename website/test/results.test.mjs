import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import {
  collectReports, summarize, selectChecks, selectFindings, verdict, areasOf, sinceLabel, sinceText, sinceSentence, levelText,
  exampleLines, profileText, sinceReportText, noteParts, findingSeverity, editionName, GRADED, GRADED_TEXT, VERDICT_LABELS,
} from '../src/results.mjs';
const dir = new URL('../../conformance/reports/', import.meta.url);
const files = readdirSync(dir).filter(f => f.endsWith('.json'));
const reports = collectReports(Object.fromEntries(files.map(f => [f, JSON.parse(readFileSync(new URL(f, dir), 'utf8'))])));
const registry = JSON.parse(readFileSync(new URL('../../conformance/implementations.json', import.meta.url), 'utf8')).implementations;
// The implementation with the most reports, so every area it has is exercised.
const keyOf = f => f.split('.')[0];
const fullest = [...new Set(files.map(keyOf))].sort((a, b) => files.filter(f => keyOf(f) === b).length - files.filter(f => keyOf(f) === a).length)[0];
const selectedFor = key => reports.filter(r => r.key === key);

test('discovers every report and keeps execution and area reports under one key', () => {
  assert.equal(reports.length, files.length);
  assert.equal(new Set(reports.map(r => r.key)).size, new Set(files.map(keyOf)).size);
  assert.equal(selectedFor(fullest).length, files.filter(f => keyOf(f) === fullest).length);
});
test('the area count comes from the reports', () => {
  const fromFiles = new Set(files.map(f => f.split('.').length === 2 ? 'execution' : f.split('.')[1]));
  assert.deepEqual(new Set(areasOf(reports)), fromFiles);
  assert.deepEqual(new Set(areasOf(reports)), new Set(reports.map(r => r.area)));
});
test('totals partition checks, with informational and untested apart', () => {
  for (const key of new Set(reports.map(r => r.key))) {
    const selected = selectedFor(key);
    const all = selected.flatMap(r => r.checks);
    const totals = summarize(selected);
    assert.equal(totals.pass + totals.fail + totals.should + totals.info + totals.untested + totals.other, all.length);
    assert.equal(totals.info, all.filter(c => c.status === 'fail' && c.level === 'INFO').length);
    assert.equal(totals.untested, all.filter(c => c.status === 'untested').length);
    assert.equal(totals.should, all.filter(c => c.status === 'fail' && c.level === 'SHOULD').length);
    assert.equal(totals.fail, all.filter(c => c.status === 'fail' && c.level !== 'SHOULD' && c.level !== 'INFO').length);
    assert.equal(totals.cases, selected.reduce((n, r) => n + r.cases.distinct, 0));
    assert.equal(totals.findings, selected.reduce((n, r) => n + r.findings.length, 0));
    assert.equal(totals.crashes, selected.flatMap(r => r.findings).filter(f => f.kind === 'crash').reduce((n, f) => n + f.cases, 0));
    assert.equal(totals.adapterProblems, selected.reduce((n, r) => n + r.adapterProblems, 0));
  }
  const all = summarize(reports);
  assert.ok(all.info > 0, 'some report has an informational check that differed');
  assert.ok(all.untested > 0, 'some report has an untested check');
});
test('verdicts keep MUST, SHOULD and INFO apart', () => {
  const all = reports.flatMap(r => r.checks);
  const should = all.find(c => c.status === 'fail' && c.level === 'SHOULD');
  assert.ok(should, 'some report has a failing SHOULD check');
  assert.equal(verdict(should), 'should');
  assert.equal(verdict({ status: 'fail', level: 'INFO' }), 'info');
  assert.equal(verdict({ status: 'fail', level: 'MUST' }), 'fail');
  assert.equal(verdict({ status: 'fail', level: 'ADAPTER' }), 'fail');
  assert.equal(verdict({ status: 'untested', level: 'INFO' }), 'untested');
  assert.equal(VERDICT_LABELS.info, 'informational');
  assert.equal(VERDICT_LABELS.should, 'should');
  for (const c of all) assert.ok(VERDICT_LABELS[verdict(c)], `${c.id} has a label`);
});
// Synthetic format 2 reports: the committed reports may predate the format.
const synthetic = {
  area: 'parse', implementation: 'Impl', cases: { distinct: 10 }, adapterProblems: 0,
  checks: [
    { id: 'm', title: 'M', level: 'MUST', status: 'fail', cases: 10, failing: 4, failingSince: { September2025: 3, September2026: 1 } },
    { id: 's', title: 'S', level: 'SHOULD', status: 'fail', cases: 10, failing: 2, failingSince: { September2026: 2 } },
    { id: 'o', title: 'O', level: 'MUST', status: 'fail', cases: 10, failing: 2, failingSince: { September2025: 1 } },
    { id: 'p', title: 'P', level: 'MUST', status: 'pass', cases: 10, failing: 0, failingSince: {} },
    { id: 'e', title: 'E', level: 'MUST', status: 'fail', cases: 10, failing: 1, levels: { September2025: 'SHOULD', October2021: 'SHOULD' } },
  ],
  findings: [
    { checks: ['m'], cases: 4, since: { September2025: 3, September2026: 1 }, fixtures: { f: 4 }, fixture: 'f', example: { input: '[since September 2025] x', response: {} } },
    { checks: ['s'], cases: 2, since: { September2026: 2 }, fixtures: { f: 2 }, fixture: 'f', example: { input: '[since September 2026] y', response: {} } },
    { checks: ['o'], cases: 2, fixtures: { f: 2 }, fixture: 'f', example: { input: 'z', response: {} } },
  ],
};
test('the graded edition is September 2026, the latest release', () => {
  assert.equal(GRADED, 'September2026');
  assert.equal(GRADED_TEXT, 'September 2026 (latest release)');
  assert.equal(editionName('October2021'), 'October 2021');
});
test('failing cases are counted by the release that introduced their rules, at the check\'s own level', () => {
  const [m, s, o, p] = synthetic.checks;
  assert.equal(sinceLabel(m), '3 since September 2025, 1 new in September 2026');
  assert.equal(sinceLabel(s), 'all new in September 2026');
  assert.equal(sinceLabel(o), '1 since September 2025');
  assert.equal(sinceLabel(p), null);
  assert.equal(sinceLabel({ status: 'fail', failing: 2 }), null);
  assert.equal(verdict(s), 'should');
  assert.equal(sinceText({ September2025: 2 }, 2), 'all since September 2025');
  assert.equal(sinceSentence(m.failingSince, m.failing, 'the failing cases'), '3 of the failing cases rely on grammar or rules introduced in September 2025 and 1 on ones introduced in September 2026, not in October 2021.');
  assert.equal(sinceSentence(s.failingSince, s.failing, 'them'), 'All of them rely on grammar or rules introduced in September 2026, not in October 2021.');
  assert.equal(sinceSentence(undefined, 2, 'them'), null);
  const shown = selectChecks([synthetic], 'all', 'all', '');
  for (const c of shown) assert.equal(c.sinceLabel, sinceLabel(c));
  assert.deepEqual(selectChecks([synthetic], 'all', 'should', '').map(c => c.id), ['s']);
});
test('a check\'s level is September 2026\'s, with the releases whose level differs', () => {
  assert.equal(levelText({ level: 'MUST' }), 'MUST');
  assert.equal(levelText(synthetic.checks[4]), 'MUST (SHOULD in September 2025 and October 2021)');
  assert.equal(levelText({ level: 'MUST', levels: { October2021: 'SHOULD' } }), 'MUST (SHOULD in October 2021)');
  assert.equal(levelText({ level: 'MUST', since: 'September2025' }), 'MUST (since September 2025)');
  assert.equal(levelText({ level: 'SHOULD', since: 'September2026', levels: { September2025: 'MAY' } }), 'SHOULD (new in September 2026; MAY in September 2025)');
});
test('findings carry their cases on newer rules, by release', () => {
  const shown = selectFindings([synthetic], 'all', 'all', '');
  assert.deepEqual(shown.map(f => f.sinceLabel), ['3 since September 2025, 1 new in September 2026', 'all new in September 2026', null]);
  assert.deepEqual(shown.map(f => f.verdict), ['fail', 'should', 'fail']);
});
test('filters area, status and case-insensitive text together', () => {
  const selected = reports.filter(r => r.key === 'graphql-js-17');
  const checks = selectChecks(selected, 'parse', 'fail', ' STRING ');
  assert.ok(checks.length > 0);
  assert.ok(checks.every(c => c.area === 'parse' && c.verdict === 'fail' && /string/i.test(c.title + c.id)));
  assert.deepEqual(selectChecks(selected, 'all', 'all', 'not-a-real-check-title'), []);
  assert.equal(selectChecks(selected, 'all', 'all', '').length, selected.flatMap(r => r.checks).length);
});
test('every finding is shown, with its level, crash and release labels and its example', () => {
  const findings = selectFindings(reports, 'all', 'all', '');
  assert.equal(findings.length, reports.reduce((n, r) => n + r.findings.length, 0));
  assert.equal(findings.filter(f => f.crash).length, reports.flatMap(r => r.findings).filter(f => f.kind === 'crash').length);
  assert.ok(findings.some(f => f.crash), 'some report has a crash');
  for (const r of reports) r.findings.forEach((f, i) => {
    const shown = selectFindings([r], 'all', 'all', '')[i];
    assert.equal(shown.index, i + 1);
    assert.equal(shown.summary, f.summary);
    assert.equal(shown.verdict, findingSeverity(f, r.checks));
    assert.equal(shown.sinceLabel, sinceText(f.since, f.cases));
  });
  for (const v of ['fail', 'should', 'info']) {
    assert.equal(selectFindings(reports, 'all', v, '').length, findings.filter(f => f.verdict === v).length);
  }
  assert.deepEqual(selectFindings(reports, 'all', 'pass', ''), []);
  assert.equal(findingSeverity({ checks: [] }, []), 'fail');
  const withExpected = findings.find(f => f.example.input !== undefined && f.example.expected);
  assert.ok(withExpected, 'some finding has an input and an expected answer');
  const lines = Object.fromEntries(exampleLines(withExpected));
  assert.equal(lines.input, withExpected.example.input);
  assert.equal(lines.response, JSON.stringify(withExpected.example.response));
  assert.equal(lines.expected, withExpected.example.expected);
  for (const f of findings) assert.ok(exampleLines(f).some(([label]) => label === 'response' || label === 'stream'));
});
test('profiles, profile notes and counts of vectors on newer rules are shown', () => {
  assert.equal(profileText({}), null);
  assert.equal(profileText({ profile: 'September2026' }), "the September 2026 edition's introspection types (latest release)");
  assert.equal(profileText({ profile: 'September2025', profileNote: 'It answered the September 2025 query' }), "the September 2025 edition's introspection types. It answered the September 2025 query");
  assert.equal(profileText({ profile: 'October2021' }), "the October 2021 edition's introspection types");
  for (const r of reports.filter(r => r.profile)) {
    const text = profileText(r);
    if (r.profileNote) assert.ok(text.endsWith(r.profileNote));
  }
  assert.equal(sinceReportText({}), null);
  assert.equal(sinceReportText({ since: { September2025: { vectors: 120, failing: 3 }, September2026: { vectors: 10, failing: 0 } } }),
    'since September 2025, 3 of 120 vectors failing; new in September 2026, 0 of 10 vectors failing');
  assert.equal(sinceReportText({ since: { September2026: { vectors: 1, failing: 1 } } }), 'new in September 2026, 1 of 1 vector failing');
});
test('hand-written notes keep their text and resolve their links against the repository', () => {
  const base = 'https://example.org/repo/conformance/';
  const withNotes = registry.filter(i => i.notes?.length && reports.some(r => r.key === i.key));
  assert.ok(withNotes.length > 0);
  for (const note of withNotes.flatMap(i => i.notes)) {
    const parts = noteParts(note, base);
    const plain = note.replace(/\[([^\]]+)\]\([^)\s]+\)/g, (_, t) => t.replace(/`/g, '')).replace(/`([^`]+)`/g, '$1');
    assert.equal(parts.map(p => p.text).join(''), plain);
    for (const p of parts.filter(p => p.type === 'link')) assert.ok(p.href.startsWith('https://example.org/repo/'), p.href);
  }
  assert.deepEqual(noteParts('see [x](../a.md) and `y`', base), [
    { type: 'text', text: 'see ' }, { type: 'link', text: 'x', href: 'https://example.org/repo/a.md' },
    { type: 'text', text: ' and ' }, { type: 'code', text: 'y' },
  ]);
});
test('unreported areas remain absent, not invented as passes', () => {
  const key = [...new Set(reports.map(r => r.key))].find(k => !files.includes(`${k}.parse.json`));
  assert.ok(key, 'some implementation has no parse report');
  const selected = selectedFor(key);
  assert.ok(selected.length > 0);
  assert.deepEqual(selectChecks(selected, 'parse', 'all', ''), []);
  assert.deepEqual(selectFindings(selected, 'parse', 'all', ''), []);
});
