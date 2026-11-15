import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { collectReports, summarize, selectChecks, selectFindings, areasOf, levelText, exampleLines, profileText, sinceReportText, sinceSentence, noteParts, GRADED_TEXT, VERDICT_LABELS } from './results.mjs';
import registry from '../../conformance/implementations.json';
import './style.css';

type Section = {number: string; url: string};
type Since = Partial<Record<'September2025' | 'September2026', number>>;
type Check = { id: string; title: string; level: string; status: string; cases: number; failing: number; failingSince?: Since; levels?: Record<string, string>; since?: string; note?: string; basis?: string; observed?: string | Record<string, number>; spec?: Section[] };
type Finding = { kind?: string; checks: string[]; summary?: string; cases: number; fixtures: Record<string, number>; fixture: string; problem?: string; since?: Since; hint?: string[]; likelyOverStrict?: boolean; example: Record<string, unknown> };
type Report = {key: string; area: string; implementation: string; checks: Check[]; cases: {distinct: number; submitted: number; malformed: number}; provenance: {date: string; kit: string}; findings: Finding[]; adapterProblems: number; checkerSelfTest: string; profile?: string; profileNote?: string; since?: Partial<Record<'September2025' | 'September2026', {vectors: number; failing?: number}>>};
type Verdict = keyof typeof VERDICT_LABELS;
// Parse raw JSON in JS: reports include deliberate lone-surrogate parser vectors.
const reportFiles = import.meta.glob('../../conformance/reports/*.json', {eager: true, query: '?raw', import: 'default'});
const reports = collectReports(Object.fromEntries(Object.entries(reportFiles).map(([path, json]) => [path, JSON.parse(json as string)]))) as Report[];
const keys = registry.implementations.map(i => i.key).filter(key => reports.some(r => r.key === key));
const notesOf = (key: string): string[] => (registry.implementations.find(i => i.key === key) as {notes?: string[]} | undefined)?.notes ?? [];
const areaCount = areasOf(reports).length;
const repo = 'https://github.com/JoviDeCroock/graphql-tla/blob/main/';
const number = (n: number) => n.toLocaleString('en-US');
const plural = (n: number, word: string) => `${number(n)} ${word}${n === 1 ? '' : 's'}`;
const source = (key: string, area: string) => repo + `conformance/reports/${key}${area === 'execution' ? '' : '.' + area}.json`;
const Pill = ({verdict}: {verdict: Verdict}) => <span class={'status ' + verdict}>{VERDICT_LABELS[verdict]}</span>;
const Tag = ({children}: {children: unknown}) => <span class="tag">{children as string}</span>;
const Note = ({text}: {text: string}) => <>{noteParts(text, repo + 'conformance/').map(p => p.type === 'link' ? <a href={p.href}>{p.text}</a> : p.type === 'code' ? <code>{p.text}</code> : p.text)}</>;
const observedText = (o: Check['observed']) => o === undefined ? null : typeof o === 'string' ? o : Object.entries(o).map(([k, v]) => `${k} ${v}`).join(', ');
const checkMeaning = (c: Check & {verdict: Verdict}) => ({
  pass: 'No tested case broke this check; this is not a proof of correctness.',
  fail: c.level === 'MUST' ? 'A MUST: the failing cases fail.' : 'The kit\'s own check on the adapter\'s answers: the failing cases fail.',
  should: 'A SHOULD: the spec recommends this, so the failing cases are a "should", not a MUST failure.',
  info: 'Informational: no spec sentence requires this, so it never counts as a failure.',
  untested: 'Untested: no case exercised this check, or the adapter lacks the capability.',
  inconclusive: 'Inconclusive: see the note and the full report.',
  subsumed: 'Every input that breaks this rule also breaks a broader one, so a rejection can\'t be credited to it.',
} as Record<Verdict, string>)[c.verdict];

function App() {
  const [key, setKey] = useState(keys[0]);
  const [area, setArea] = useState('all');
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const selected = reports.filter(r => r.key === key);
  const totals = summarize(selected);
  const checks = selectChecks(selected, area, status, query) as (Check & {area: string; verdict: Verdict; sinceLabel: string | null})[];
  const findings = selectFindings(selected, area, status, query) as (Finding & {area: string; index: number; verdict: Verdict; crash: boolean; sinceLabel: string | null; levels: Check[]})[];
  const notes = notesOf(key);
  const dates = [...new Set(reports.map(r => r.provenance.date))].sort();
  const editions = selected.filter(r => profileText(r) || sinceReportText(r));
  const filtered = area !== 'all' || status !== 'all' || query.trim() !== '';
  const clearFilters = () => {setArea('all'); setStatus('all'); setQuery('');};
  useEffect(() => { document.title = `${selected[0].implementation} · GraphQL TLA+ conformance`; }, [key]);
  return <>
    <a class="skip" href="#results">Skip to results</a>
    <header><a class="brand" href="#">GraphQL <span>TLA+</span></a><a href={repo + 'README.md'}>About the project ↗</a></header>
    <main>
      <section class="intro"><div><h1>The spec, put{' '}<br/>to the test.</h1><p>GraphQL implementations checked against TLA+ references. Explore what holds, what breaks, and the evidence behind each result.</p></div><div class="edition"><span>Latest checked-in results</span><strong>{dates.at(-1)}</strong><span>Graded against GraphQL {GRADED_TEXT}</span><span>{plural(keys.length, 'implementation')} · {plural(areaCount, 'specification area')}</span><a href={repo + 'conformance/README.md'}>Read the methodology ↗</a></div></section>
      <div class="workspace">
        <aside aria-label="Implementations"><h2>Implementations <span>{keys.length}</span></h2><nav>{keys.map(k => <button aria-pressed={key === k} onClick={() => {setKey(k); setArea('all');}}>{reports.find(r => r.key === k)!.implementation}<span aria-hidden="true">→</span></button>)}</nav><p>Not a leaderboard.<br/>Coverage and capabilities differ across adapters.</p></aside>
        <section id="results" class="results" aria-label="Conformance results">
          <div class="result-heading"><div><h2>{selected[0].implementation}</h2><p>{plural(selected.length, 'tested area')} · {number(totals.cases)} distinct cases across areas · {plural(totals.findings, 'finding')} · {totals.crashes ? plural(totals.crashes, 'crashed case') : 'no crashes'} · {totals.adapterProblems ? plural(totals.adapterProblems, 'adapter problem') : 'no adapter problems'}</p></div><a href={repo + `conformance/${key}.md`}>Full report ↗</a></div>
          {notes.length > 0 && <div class="notes"><h3>Notes <span>hand-written, from outside the kit</span></h3><ul>{notes.map(n => <li><Note text={n}/></li>)}</ul></div>}
          <div class="summary" aria-label="Check totals"><div><strong class="pass">{totals.pass}</strong><span>Passing checks</span></div><div><strong class="fail">{totals.fail}</strong><span>Failing MUST checks</span></div><div><strong class="should">{totals.should}</strong><span>Failing SHOULD checks</span></div><div><strong class="info">{totals.info}</strong><span>Informational, differed</span></div><div><strong class="muted">{totals.untested}</strong><span>Untested</span></div><div><strong class="muted">{totals.other}</strong><span>Subsumed / inconclusive</span></div></div>
          <div class="areas" role="region" aria-label="Areas" tabIndex={0}><table><thead><tr><th>Area</th><th>Distinct cases</th><th>Findings</th><th>Crashed cases</th><th>Adapter problems</th><th>Checker self-test</th><th>Run</th></tr></thead><tbody>{selected.map(r => {const t = summarize([r]); return <tr><td>{r.area}</td><td>{number(r.cases.distinct)}</td><td>{t.findings}</td><td>{t.crashes || 'none'}</td><td>{r.adapterProblems || 'none'}</td><td class={r.checkerSelfTest.startsWith('passed') ? '' : 'fail'}>{r.checkerSelfTest}</td><td><a href={source(key, r.area)}>{r.provenance.date} ({r.provenance.kit}) ↗</a></td></tr>;})}</tbody></table>
            {editions.length > 0 && <ul class="edition-notes">{editions.map(r => <>{profileText(r) && <li><strong>{r.area}:</strong> graded against {profileText(r)}</li>}{sinceReportText(r) && <li><strong>{r.area}, vectors relying on rules after October 2021:</strong> {sinceReportText(r)}.</li>}</>)}</ul>}
          </div>
          <div class="filters"><label>Specification area<select value={area} onChange={e => setArea(e.currentTarget.value)}><option value="all">All tested areas</option>{selected.map(r => <option value={r.area}>{r.area}</option>)}</select></label><label>Status<select value={status} onChange={e => setStatus(e.currentTarget.value)}>{[['all','All statuses'],['pass','Pass'],['fail','Fail (MUST)'],['should','Should (SHOULD)'],['info','Informational (INFO)'],['untested','Untested'],['inconclusive','Inconclusive'],['subsumed','Subsumed']].map(([s, label]) => <option value={s}>{label}</option>)}</select></label><label class="search">Search checks and findings<input type="search" placeholder="e.g. coercion, fields…" value={query} onInput={e => setQuery(e.currentTarget.value)}/></label></div>
          <div class="list-heading"><h3>Findings</h3><div>{filtered && <button class="link" onClick={clearFilters}>Clear filters</button>}<span role="status">{plural(findings.length, 'finding')}</span></div></div>
          <div class="checks">{findings.length ? findings.map(f => <details key={`${key}-${f.area}-f${f.index}`}><summary><Pill verdict={f.verdict}/><span class="check-title">{f.summary ?? (f.checks.join(', ') || 'malformed result')}{f.crash && <Tag>crash</Tag>}{f.sinceLabel && <Tag>{f.sinceLabel}</Tag>}<small>{f.area} / {f.checks.join(', ') || 'malformed result'}</small></span><span class="case-count">{number(f.cases)}<small>cases</small></span></summary><div class="check-detail">
            <p>{plural(f.cases, 'case')}, in {Object.entries(f.fixtures).sort((a, b) => b[1] - a[1]).map(([id, n]) => `${id} (${n})`).join(', ')}.{f.sinceLabel ? ` ${sinceSentence(f.since, f.cases, 'them')}` : ''}{f.crash && ' The implementation crashed on these cases instead of answering.'}</p>
            {f.hint?.length ? <p>Each rejected document is one edit from a document that breaks only {f.hint.join(' or ')}{f.likelyOverStrict ? ', so that rule is likely over-strict' : '; which rule the implementation applied is a guess'}.</p> : null}
            {f.levels.length > 0 && <ul class="levels">{f.levels.map(c => <li>{c.title} (<strong>{levelText(c)}</strong>){c.spec?.map(s => <> <a href={s.url}>§{s.number}</a></>)}</li>)}</ul>}
            <p>The shortest case, from {f.fixture}:</p>
            <dl class="example">{exampleLines(f).map(([label, value]) => <><dt>{label}</dt><dd><code>{value}</code></dd></>)}</dl>
            <div><a href={repo + `conformance/${key}.md#${f.area}-finding-${f.index}`}>Finding on the full report ↗</a><a href={source(key, f.area)}>Source JSON ↗</a></div>
          </div></details>) : <div class="empty"><h3>No matching findings</h3><p>{status === 'all' ? 'Nothing failed or differed here.' : 'Findings are failures, so passing, untested and other statuses have none.'}</p></div>}</div>
          <div class="list-heading"><h3>Specification checks</h3><div>{filtered && <button class="link" onClick={clearFilters}>Clear filters</button>}<span role="status">{plural(checks.length, 'check')}</span></div></div>
          <div class="checks">{checks.length ? checks.map(c => <details key={`${key}-${c.area}-${c.id}`}><summary><Pill verdict={c.verdict}/><span class="check-title">{c.title}{c.sinceLabel && <Tag>{c.sinceLabel}</Tag>}<small>{c.area} / {c.id}</small></span><span class="case-count">{number(c.cases)}<small>cases</small></span></summary><div class="check-detail"><p><strong>{levelText(c)}</strong> · {number(c.failing)} failing of {number(c.cases)} cases{c.sinceLabel ? ` (${c.sinceLabel})` : ''}. {checkMeaning(c)}{c.sinceLabel ? ` ${sinceSentence(c.failingSince, c.failing, 'the failing cases')}` : ''}{c.note && ` ${c.note}.`}{observedText(c.observed) && ` Observed: ${observedText(c.observed)}.`}{c.basis && ` Basis: ${c.basis}`}</p><div>{c.spec?.map(s => <a href={s.url}>Spec §{s.number} ↗</a>)}<a href={source(key, c.area)}>Source JSON ↗</a></div></div></details>) : <div class="empty"><h3>No matching checks</h3><p>Try another area, status, or search term.</p><button onClick={clearFilters}>Clear filters</button></div>}</div>
        </section>
      </div>
      <section class="limits"><h2>Evidence, not a guarantee.</h2><p>Small fixtures test a limited slice of the September 2026 specification. The references share an oracle, and adapters have not been reviewed by implementation maintainers. A failure may be in the adapter; a pass only describes the cases tried.</p><a href={repo + 'conformance/README.md'}>Understand the limits ↗</a></section>
    </main><footer><span>GraphQL TLA+ / Conformance explorer</span><span>Built from versioned reports. Updated on deployment.</span></footer>
  </>;
}
render(<App/>, document.getElementById('app')!);
