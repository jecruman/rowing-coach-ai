---
project: rowing-coach-ai
researched_at: 2026-10-06
recommended_platform: Cloudflare Workers
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 7.3.2 (SSR, output "server") + React 19, @astrojs/cloudflare 14.3.1
  runtime: Cloudflare workerd (Workers with static assets, nodejs_compat); Node 22.23 for local build
---

## Recommendation

**Deploy on Cloudflare Workers.**

The starter is already configured for Workers (`@astrojs/cloudflare` 14.3.1, `wrangler.jsonc` with static assets and observability enabled), so the MVP ships with no adapter change. With cost minimisation as the top priority, a handful of users, request/response traffic only, and Supabase as an external data layer, Workers' free plan (100k requests/day; outbound waits do not count as CPU) costs $0 and passes four of five agent-friendly criteria, with MCP at Partial. Vercel is the runner-up on familiarity, but its free Hobby plan is restricted to non-commercial use and requires swapping the adapter.

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Total |
|---|---|---|---|---|---|---|
| Cloudflare Workers | Pass | Pass | Pass | Pass | Partial | 4.5 |
| Vercel | Pass | Pass | Pass | Pass | Partial (MCP beta) | 4.5 |
| Netlify | Pass (rollback via API only) | Pass | Pass | Pass | Pass (MCP GA) | 5 |
| Fly.io | Pass | Partial (own Dockerfile) | Pass | Pass | Partial | 4 |
| Railway | Pass (rollback dashboard only) | Partial (sleep cold starts) | Pass | Partial | Partial (MCP beta) | 3.5 |
| Render | Pass (rollback dashboard/API) | Partial (always-on container) | Pass | Pass | Partial (MCP beta) | 4 |

Weights applied from the interview: cost minimisation (penalises paid base tiers), Vercel familiarity (tie-breaker), single region (edge not required), external providers fine (no co-location bonus). No platform failed a hard filter (no persistent connections required; all support TypeScript/Node).

- **Cloudflare Workers** — $0 at this scale; 10 ms CPU/request on free, $5/month paid plan as headroom; no adapter change; `wrangler` covers deploy, rollback, tail, secrets; `llms.txt` published; Cloudflare API MCP server GA, other MCP servers status unstated.
- **Vercel** — `@astrojs/vercel` 11.x supports Astro 7; Fluid compute bills memory while waiting on the LLM call but stays inside Hobby allowances; region `fra1` settable on Hobby; Hobby is non-commercial only (Pro $20/month); Vercel MCP in public beta.
- **Netlify** — scores highest on raw criteria (MCP GA, `.md` docs), and free credits cover the traffic, but function region selection is a paid feature — free-plan functions run in Ohio, adding transatlantic latency to every Supabase round-trip; rollback has no dedicated CLI command; adapter swap needed. Cost/latency weighting drops it below Cloudflare and Vercel.
- **Fly.io** — ~$3–5/month, no free tier; requires `@astrojs/node` (Astro 7 peer support unconfirmed) and a maintained Dockerfile; no built-in PR previews.
- **Railway** — ~$5/month Hobby; rollback only in the dashboard; app sleeping can return 502 on wake; MCP beta.
- **Render** — free tier spins down with ~1 minute cold starts (unsuitable for post-row use); Starter ~$7/month; PR previews need a paid workspace; MCP beta.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Zero cost and zero migration: the scaffolded project already builds for Workers, and local dev already runs on workerd. Outbound waits (LLM call, Supabase) are wall time, not CPU time, so the multi-second coaching call fits the free plan. All operations — deploy, version rollback, live logs, secrets — are scriptable through `wrangler`, which suits agent-driven work.

#### 2. Vercel

The user's familiar platform, with an Astro 7-compatible adapter, a Frankfurt function region available on the free plan, markdown docs and a beta MCP server. It loses on two points: the Hobby plan forbids commercial use (realistic cost $20/month if the app ever becomes commercial), and moving there means swapping the adapter and re-verifying `astro:env` and auth on a second runtime.

#### 3. Netlify

Best agent tooling of the six (GA MCP server, `.md` docs, `netlify logs --follow`) and free at this traffic. The gap: European function regions are a paid feature, so on the free plan every request would cross the Atlantic to reach a European Supabase project; plus an adapter swap and no CLI rollback command.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **10 ms CPU per request on the free plan.** Outbound waits don't count, but SSR rendering, Supabase session/JWT handling, zod validation and the metrics calculation do — and cold isolates are slower. Exceeding the limit returns errors, not slow pages.
2. **Partial Node compatibility.** `http2`, `vm` and parts of `tls` are stubs. A model SDK (or one of its dependencies) that assumes full Node can build cleanly and fail only at runtime.
3. **Latency to Supabase.** Workers run at the edge location nearest the user; every request makes several sequential Supabase calls, so a Supabase project outside the EU multiplies latency against the "within a few seconds" NFR.
4. **Moderate lock-in.** `wrangler.jsonc`, `.dev.vars` and any `cloudflare:workers` imports must be reworked to move to another host.

### Pre-Mortem — How This Could Fail

The app went live on the free Workers plan without anyone measuring CPU time. Locally everything was fast, because local dev doesn't enforce the 10 ms limit. In production, the session page exceeded it on cold starts and returned intermittent errors that looked like a flaky Supabase. A model SDK was added that pulled in Node `http2`; it built fine and broke only at runtime. The Supabase project had been created in a US region by default, so each suggestion took seconds longer than the target. Secrets lived in `.dev.vars` but were never pushed with `wrangler secret put`, so the first production deploy shipped with auth broken. The preview URL was public, exposing a test account's data. None of these was a platform failure — each was an unchecked assumption about the runtime, the region or the secret flow.

### Unknown Unknowns

- **Workers, not Pages.** `@astrojs/cloudflare` v14 deploys to Workers with static assets (Pages support was dropped in v13). `tech-stack.md` records `deployment_target: cloudflare-pages`; the version-accurate workflow is `wrangler deploy`. The Astro dev server already runs on workerd, so no separate Cloudflare dev command is needed.
- **The Worker is still named `10x-astro-starter`** in `wrangler.jsonc`; that name becomes the `*.workers.dev` URL. Rename before the first deploy and keep the dashboard name identical.
- **Secrets live in three unsynchronised places:** `.dev.vars` (local), `wrangler secret put` (production Worker), GitHub Actions secrets (CI build).
- **Preview URLs are public by default** unless protected with Cloudflare Access.
- **50 outbound requests per invocation on the free plan.** The current flow uses about five; an agent loop calling many tools in one request could approach it.

## Operational Story

- **Preview deploys**: `npx wrangler versions upload` uploads a new version without promoting it and reports a preview URL (verify `preview_urls` behaviour on first use); Workers Builds can also create per-branch previews (GA status unconfirmed as of 2026-10-06). Preview URLs are public unless Cloudflare Access is placed in front of them.
- **Secrets**: local — `.dev.vars` (gitignored); production — `npx wrangler secret put SUPABASE_URL` / `SUPABASE_KEY` / the model API key, stored encrypted on the Worker and readable only by it; CI — GitHub Actions repository secrets (`SUPABASE_URL`, `SUPABASE_KEY`, plus `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` once CI deploys). Rotation: put the new value with `wrangler secret put` (takes effect on the next request), then update GitHub secrets.
- **Rollback**: `npx wrangler rollback` returns to the previous version in seconds (or `npx wrangler versions deploy <version-id>` for a specific one). Supabase migrations do not roll back with it — write forward-fix migrations.
- **Approval**: human-only — first production deploy, `wrangler secret put` for production secrets, rotating the Supabase or model key, any destructive Supabase migration or table drop, upgrading to a paid plan. Agent may do unattended — `npm run build`, `wrangler versions upload` (previews), `wrangler tail`, reading logs and deployment status.
- **Logs**: `npx wrangler tail` streams live runtime logs (read-only); persisted logs are available because `observability.enabled` is already `true` in `wrangler.jsonc`; CI logs via `gh run view <id> --log-failed`.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Free-plan 10 ms CPU limit exceeded on SSR + auth + metrics, causing intermittent errors | Devil's advocate | M | H | After the first deploy, check CPU time per request in Workers metrics; if p99 nears 10 ms, move to the $5/month paid plan before real users |
| Model SDK or dependency needs unsupported Node APIs and fails at runtime only | Devil's advocate / Pre-mortem | M | M | Call the model API with plain `fetch` (or an SDK documented for Workers); smoke-test the coaching call on a preview version before promoting |
| Supabase project outside the EU adds latency to every request | Devil's advocate / Pre-mortem | M | M | Confirm the Supabase project region is in the EU (e.g. Frankfurt); if not, recreate it now while it is empty |
| Production deployed without secrets (auth broken) | Pre-mortem | M | H | Run `wrangler secret put` for every `astro:env` secret before the first `wrangler deploy`; verify with `npx wrangler secret list` |
| Public preview URL exposes test data | Pre-mortem / Unknown unknowns | L | M | Use separate test accounts with dummy data; add Cloudflare Access before sharing preview links |
| Deploy-target mismatch (Pages vs Workers) in docs and hand-off | Unknown unknowns | H | L | Treat `tech-stack.md`'s `cloudflare-pages` as "Cloudflare Workers"; use `wrangler deploy` only |
| Worker deployed under the starter name | Unknown unknowns | H | L | Rename `name` in `wrangler.jsonc` to `rowing-coach-ai` before the first deploy |
| Agent loop exceeds 50 subrequests per invocation | Unknown unknowns | L | M | Cap tool calls per suggestion in code; the paid plan raises the limit to 10,000 |
| Moving off Cloudflare later costs an adapter swap | Devil's advocate | L | L | Keep platform specifics in `wrangler.jsonc` and read secrets only via `astro:env/server` |
| Cloudflare MCP servers other than the API server have unstated status | Research finding | L | L | Rely on `wrangler` for operations; treat MCP as optional |
| Workers Builds per-branch previews: GA status unconfirmed (checked 2026-10-06) | Research finding | L | L | Use `wrangler versions upload` from GitHub Actions for previews instead |

## Getting Started

1. In `wrangler.jsonc`, change `"name": "10x-astro-starter"` to `"name": "rowing-coach-ai"`.
2. Authenticate once: `npx wrangler login` (uses the project's pinned wrangler 4.131).
3. Set production secrets before deploying: `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY` (add the model API key the same way when it exists, after declaring it in `env.schema` in `astro.config.mjs`).
4. Build and deploy: `npm run build` then `npx wrangler deploy`; open the printed `*.workers.dev` URL and sign up/sign in.
5. Watch the first real requests: `npx wrangler tail`, and check CPU time per request in the Workers dashboard metrics against the 10 ms free-plan limit.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region, HA, DR)
