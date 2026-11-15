# Conformance website

A static Preact + Vite results explorer. No server, API, credentials, external fonts,
or adapter toolchains are needed. Run commands from the **repository root** with
Node 22+ after `npm ci`:

- `npm run website:dev` — development server
- `npm run typecheck` — model and website TypeScript checks
- `npm run website:test` — report discovery, totals and filtering tests
- `npm run website:build` — production output in `website/dist`
- `npm run website:preview` — serve the production build locally

## Cloudflare deployment

For Cloudflare Pages Git integration, leave the root directory at the repository
root, use build command `npm run website:build` and output directory `website/dist`.
For Cloudflare Workers with static assets, the repository-root `wrangler.jsonc`
points at that same output: build first, then deploy with `npx wrangler deploy`.
Registration, account selection and authentication happen separately; no deploy
runs in this repository's CI and no secrets are required to build.

## Data freshness

The build discovers every JSON report under `conformance/reports/` and groups it
by implementation and specification area, matching the conformance sheet's file
naming. These are the latest **checked-in** results, not a live feed. Regenerate
reports with the existing `npm run conformance` workflow (see the repository's
conformance docs), commit them, and rebuild/redeploy to publish updates. Report
dates and kit revisions are visible in the UI. Areas follow `kit/areas.mjs`'s
order, so a new area needs no change here. An area that some implementation
reports and another doesn't take part in is listed for both, as "not taking
part" for the second, never counted as a pass. A check whose report lists the
capabilities it `requires` is shown as "needs …" when the adapter lacks one.
Distinct case counts are summed across areas, not globally deduplicated.

Source JSON is parsed as raw text because parser fixtures intentionally contain
lone-surrogate escapes that some bundler JSON parsers reject.

## Design

Following [Impeccable's design skill](https://impeccable.style), this is an
Operate/Read surface: restrained evergreen, cool light surfaces for daytime
comparison, system typography, tabular counts, and a persistent implementation
rail. Color always accompanies status text. Native disclosure rows expose detail
without losing comparison context. The mobile rail scrolls horizontally; filters
wrap, and the result list remains readable without page-level horizontal scroll.
