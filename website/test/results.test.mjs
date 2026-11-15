import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { collectReports, summarize, selectChecks } from '../src/results.mjs';
const dir = new URL('../../conformance/reports/', import.meta.url);
const reports = collectReports(Object.fromEntries(readdirSync(dir).map(f => [f, JSON.parse(readFileSync(new URL(f, dir), 'utf8'))])));
test('discovers every report and keeps execution and area reports under one key', () => {
  assert.equal(reports.length, readdirSync(dir).length);
  assert.equal(new Set(reports.map(r => r.key)).size, 9);
  assert.equal(reports.filter(r => r.key === 'graphql-js-17').length, 6);
});
test('totals partition checks without treating untested as passing', () => {
  const selected = reports.filter(r => r.key === 'graphql-js-17');
  const totals = summarize(selected);
  assert.equal(totals.pass + totals.fail + totals.other, selected.flatMap(r => r.checks).length);
  assert.equal(totals.cases, 9828);
  assert.equal(totals.findings, 13);
  assert.ok(totals.other > 0);
});
test('filters area, status and case-insensitive text together', () => {
  const selected = reports.filter(r => r.key === 'graphql-js-17');
  const checks = selectChecks(selected, 'parse', 'fail', ' STRING ');
  assert.ok(checks.length > 0);
  assert.ok(checks.every(c => c.area === 'parse' && c.status === 'fail' && /string/i.test(c.title + c.id)));
  assert.deepEqual(selectChecks(selected, 'all', 'all', 'not-a-real-check-title'), []);
  assert.equal(selectChecks(selected, 'all', 'all', '').length, selected.flatMap(r => r.checks).length);
});
test('unreported areas remain absent, not invented as passes', () => {
  const selected = reports.filter(r => r.key === 'graphql-core');
  assert.equal(selected.length, 1);
  assert.deepEqual(selectChecks(selected, 'parse', 'all', ''), []);
});
