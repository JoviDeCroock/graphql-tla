import { render } from 'preact';
import { useState } from 'preact/hooks';
import { collectReports, summarize, selectChecks } from './results.mjs';
import registry from '../../conformance/implementations.json';
import './style.css';

type Check = { id: string; title: string; level: string; status: string; cases: number; failing: number; spec?: {number: string; url: string}[] };
type Report = {key: string; area: string; implementation: string; checks: Check[]; cases: {distinct: number}; provenance: {date: string; kit: string}; findings?: unknown[]};
// Parse raw JSON in JS: reports include deliberate lone-surrogate parser vectors.
const reportFiles = import.meta.glob('../../conformance/reports/*.json', {eager: true, query: '?raw', import: 'default'});
const reports = collectReports(Object.fromEntries(Object.entries(reportFiles).map(([path, json]) => [path, JSON.parse(json as string)]))) as Report[];
const keys = registry.implementations.map(i => i.key).filter(key => reports.some(r => r.key === key));
const repo = 'https://github.com/JoviDeCroock/graphql-tla/blob/main/';
const number = (n: number) => n.toLocaleString('en-US');
function App() {
  const [key, setKey] = useState(keys[0]);
  const [area, setArea] = useState('all');
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const selected = reports.filter(r => r.key === key);
  const totals = summarize(selected);
  const checks = selectChecks(selected, area, status, query) as (Check & {area: string; verdict: string})[];
  const dates = [...new Set(reports.map(r => r.provenance.date))].sort();
  return <>
    <a class="skip" href="#results">Skip to results</a>
    <header><a class="brand" href="#">GraphQL <span>TLA+</span></a><a href={repo + 'README.md'}>About the project ↗</a></header>
    <main>
      <section class="intro"><div><h1>The spec, put<br/>to the test.</h1><p>GraphQL implementations checked against TLA+ references. Explore what holds, what breaks, and the evidence behind each result.</p></div><div class="edition"><span>Latest checked-in results</span><strong>{dates.at(-1)}</strong><span>{keys.length} implementations · 6 specification areas</span><a href={repo + 'conformance/README.md'}>Read the methodology ↗</a></div></section>
      <div class="workspace">
        <aside aria-label="Implementations"><h2>Implementations <span>{keys.length}</span></h2><nav>{keys.map(k => <button aria-pressed={key === k} onClick={() => {setKey(k); setArea('all');}}>{reports.find(r => r.key === k)!.implementation}<span aria-hidden="true">→</span></button>)}</nav><p>Not a leaderboard.<br/>Coverage and capabilities differ across adapters.</p></aside>
        <section id="results" class="results" aria-label="Conformance results">
          <div class="result-heading"><div><h2>{selected[0].implementation}</h2><p>{selected.length} tested {selected.length === 1 ? 'area' : 'areas'} · {number(totals.cases)} distinct cases across areas</p></div><a href={repo + `conformance/${key}.md`}>Full report ↗</a></div>
          <div class="summary" aria-label="Check totals"><div><strong class="pass">{totals.pass}</strong><span>Passing checks</span></div><div><strong class="fail">{totals.fail}</strong><span>Failing MUST checks</span></div><div><strong class="should">{totals.should}</strong><span>Failing SHOULD checks</span></div><div><strong>{totals.other}</strong><span>Other / untested</span></div></div>
          <div class="filters"><label>Specification area<select value={area} onChange={e => setArea(e.currentTarget.value)}><option value="all">All tested areas</option>{selected.map(r => <option value={r.area}>{r.area}</option>)}</select></label><label>Check status<select value={status} onChange={e => setStatus(e.currentTarget.value)}>{[['all','All statuses'],['pass','pass'],['fail','fail (MUST)'],['should','fail (SHOULD)'],['info','informational'],['untested','untested'],['inconclusive','inconclusive'],['subsumed','subsumed']].map(([s, label]) => <option value={s}>{label}</option>)}</select></label><label class="search">Search checks<input type="search" placeholder="e.g. coercion, fields…" value={query} onInput={e => setQuery(e.currentTarget.value)}/></label></div>
          <div class="list-heading"><h3>Specification checks</h3><span role="status">{checks.length} results</span></div>
          <div class="checks">{checks.length ? checks.map(c => <details key={`${key}-${c.area}-${c.id}`}><summary><span class={'status ' + c.verdict}>{c.verdict === 'should' ? 'should' : c.verdict === 'info' ? 'info' : c.status}</span><span class="check-title">{c.title}<small>{c.area} / {c.id}</small></span><span class="case-count">{number(c.cases)}<small>cases</small></span></summary><div class="check-detail"><p><strong>{c.level}</strong> · {number(c.failing)} failing of {number(c.cases)} cases. {c.status === 'pass' ? 'No tested case broke this check; this is not a proof of correctness.' : c.status === 'untested' ? 'This check was not exercised by these cases.' : c.status === 'subsumed' ? 'Every input that breaks this rule also breaks a broader one, so a rejection can\'t be credited to it.' : c.verdict === 'info' ? 'Informational: no spec sentence requires this, so it never counts as a failure. See the full report.' : 'See the full report for evidence, limitations, and findings.'}</p><div>{c.spec?.map(s => <a href={s.url}>Spec §{s.number} ↗</a>)}<a href={repo + `conformance/reports/${key}${c.area === 'execution' ? '' : '.' + c.area}.json`}>Source JSON ↗</a></div></div></details>) : <div class="empty"><h3>No matching checks</h3><p>Try another area, status, or search term.</p><button onClick={() => {setArea('all'); setStatus('all'); setQuery('');}}>Clear filters</button></div>}</div>
          <p class="provenance">Report provenance: {selected.map(r => `${r.area}: ${r.provenance.date} (${r.provenance.kit})`).join(' · ')}</p>
        </section>
      </div>
      <section class="limits"><h2>Evidence, not a guarantee.</h2><p>Small fixtures test a limited slice of the draft specification. The references share an oracle, and adapters have not been reviewed by implementation maintainers. A failure may be in the adapter; a pass only describes the cases tried.</p><a href={repo + 'conformance/README.md'}>Understand the limits ↗</a></section>
    </main><footer><span>GraphQL TLA+ / Conformance explorer</span><span>Built from versioned reports. Updated on deployment.</span></footer>
  </>;
}
render(<App/>, document.getElementById('app')!);
