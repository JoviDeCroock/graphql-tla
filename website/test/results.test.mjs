import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import {
  collectReports, summarize, selectChecks, selectFindings, verdict, areasOf, draftOnlyLabel, levelText,
  exampleLines, profileText, draftOnlyText, noteParts, findingSeverity, VERDICT_LABELS,
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
test('a check failing only in draft-only cases is labelled as such, at its own level', () => {
  const failing = reports.flatMap(r => r.checks).filter(c => c.status === 'fail');
  const draft = failing.filter(c => c.failingDraftOnly);
  assert.ok(draft.length > 0, 'some report has draft-only failures');
  for (const c of failing) {
    const label = draftOnlyLabel(c);
    if (!c.failingDraftOnly) assert.equal(label, null);
    else assert.equal(label, c.failingDraftOnly >= c.failing ? 'all draft only' : `${c.failingDraftOnly} draft only`);
  }
  assert.equal(draftOnlyLabel({ status: 'fail', level: 'SHOULD', failing: 2, failingDraftOnly: 2 }), 'all draft only');
  assert.equal(verdict({ status: 'fail', level: 'SHOULD', failing: 2, failingDraftOnly: 2 }), 'should');
  assert.equal(levelText({ level: 'MUST', edition: 'draft' }), 'MUST (draft only)');
  assert.equal(levelText({ level: 'SHOULD', oct2021: 'MAY' }), 'SHOULD (Oct 2021: MAY)');
  for (const c of selectChecks(reports, 'all', 'all', '')) assert.equal(c.draftLabel, draftOnlyLabel(c));
});
test('filters area, status and case-insensitive text together', () => {
  const selected = reports.filter(r => r.key === 'graphql-js-17');
  const checks = selectChecks(selected, 'parse', 'fail', ' STRING ');
  assert.ok(checks.length > 0);
  assert.ok(checks.every(c => c.area === 'parse' && c.verdict === 'fail' && /string/i.test(c.title + c.id)));
  assert.deepEqual(selectChecks(selected, 'all', 'all', 'not-a-real-check-title'), []);
  assert.equal(selectChecks(selected, 'all', 'all', '').length, selected.flatMap(r => r.checks).length);
});
test('every finding is shown, with its level, crash and draft-only labels and its example', () => {
  const findings = selectFindings(reports, 'all', 'all', '');
  assert.equal(findings.length, reports.reduce((n, r) => n + r.findings.length, 0));
  assert.equal(findings.filter(f => f.crash).length, reports.flatMap(r => r.findings).filter(f => f.kind === 'crash').length);
  assert.ok(findings.some(f => f.crash), 'some report has a crash');
  for (const r of reports) r.findings.forEach((f, i) => {
    const shown = selectFindings([r], 'all', 'all', '')[i];
    assert.equal(shown.index, i + 1);
    assert.equal(shown.summary, f.summary);
    assert.equal(shown.verdict, findingSeverity(f, r.checks));
    assert.equal(shown.draftLabel, f.draftOnly ? (f.draftOnly >= f.cases ? 'all draft only' : `${f.draftOnly} draft only`) : null);
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
test('profiles, profile notes and draft-only counts are shown', () => {
  const profiled = reports.filter(r => r.profile);
  assert.ok(profiled.length > 0, 'some report has an introspection profile');
  for (const r of profiled) {
    const text = profileText(r);
    assert.ok(text.includes(r.profile === 'draft' ? "the draft's" : r.profile));
    if (r.profileNote) assert.ok(text.endsWith(r.profileNote));
  }
  assert.ok(profiled.some(r => r.profileNote), 'some report has a profile note');
  for (const r of reports.filter(r => !r.profile)) assert.equal(profileText(r), null);
  for (const r of reports.filter(r => r.draftOnly)) assert.ok(draftOnlyText(r).includes(String(r.draftOnly.vectors ?? r.draftOnly)));
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
