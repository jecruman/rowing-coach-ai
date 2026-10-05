---
bootstrapped_at: 2026-10-04T18:07:59Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: rowing-coach-ai
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

# Bootstrap verification — rowing-coach-ai

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: rowing-coach-ai
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
```

**Why this stack** (verbatim from the hand-off):

A solo developer building a 3-week, after-hours web app for a handful of rowers needs login with strictly per-user data, a relational store for sessions, goals and suggestions, and one short coaching call to an external model per logged session. Astro + React + TypeScript + Supabase + Cloudflare is the recommended default for a TypeScript web app and clears all four agent-friendly gates; Supabase covers auth and the per-user isolation guardrail (row-level security must be set up early), and TypeScript with explicit schemas at boundaries suits validating the model's structured suggestion against the fixed safety limits. The edge runtime's limit on long-running work is acceptable because each coaching call is a few seconds with one retry. Payments, realtime and background jobs are out of scope per the PRD. CI runs on GitHub Actions with auto-deploy on merge to Cloudflare Pages, the starter's default; scaffolding confidence is first-class, so expect occasional hiccups.

## Pre-scaffold verification

| Signal      | Value                                                       | Severity | Notes                                                                 |
| ----------- | ----------------------------------------------------------- | -------- | --------------------------------------------------------------------- |
| npm package | not run                                                     | —        | cmd_template starts with `git clone`; no `create-*` CLI to check      |
| GitHub repo | przeprogramowani/10x-astro-starter last pushed 2026-09-12   | fresh    | from card.docs_url; `gh` not installed, read via public GitHub API    |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 21 top-level items (.github, .husky, .vscode, node_modules, public, scripts, src, supabase, .env.example, .gitignore, .nvmrc, .prettierrc.json, AGENTS.md, astro.config.mjs, components.json, eslint.config.js, package-lock.json, package.json, README.md, tsconfig.json, wrangler.jsonc)
**Conflicts (.scaffold siblings)**: CLAUDE.md.scaffold
**.gitignore handling**: moved silently (absent in cwd)
**.bootstrap-scaffold cleanup**: deleted (cloned `.git/` removed before move-up)

**Install warnings**: `npm warn EBADENGINE` — the starter's dependencies require Node `^22.22.3 || ^24.16.0 || >=26.3.0` (and `undici@8.10.2` requires `>=22.19.0`); local Node is `v22.14.0` (npm 10.9.2). Install succeeded, but dev/build may fail until Node is upgraded. Note: the starter's own `.nvmrc` pins `22.14.0`, which is older than its dependencies require — the starter is internally inconsistent here.

## Post-scaffold audit

**Tool**: npm audit --json
**Summary**: 0 CRITICAL, 4 HIGH, 4 MODERATE, 0 LOW
**Direct vs transitive**: 0/0/1/0 direct of total 0/4/4/0 (dependencies: 804 total; prod 377, dev 269, optional 167)

#### CRITICAL findings

None.

#### HIGH findings

- **brace-expansion** (transitive; `<=1.1.20 || 4.0.0 - 5.0.11`) — DoS via uncontrolled recursion on nested brace groups / in parseCommaParts (high); quadratic-time expansion (moderate). Fix available.
- **devalue** (transitive; `<=5.9.2`) — `stringify`/`uneval` serialize shared memory (high); repeated primitive strings cause quadratic expansion (high); `stringifyAsync` unhandled rejection (high); plus moderate/low items. Fix available.
- **http-cache-semantics** (transitive; `<=4.2.0`) — max-stale handling can disclose cross-user cached responses (high). Fix available.
- **undici** (transitive; `7.0.0 - 7.29.0`) — DoS via unrequested WebSocket subprotocol (high); TLS certificate validation bypass via dropped connect options in BalancedPool (high); plus several moderate/low items. Fix available.

#### MODERATE findings

- **wrangler** (DIRECT; `4.102.0 - 4.143.0`) — via miniflare. Fix available.
- **@cloudflare/vite-plugin** (transitive) — via miniflare, wrangler. Fix available.
- **miniflare** (transitive; `4.20260617.0 - 5.20260926.0-alpha`) — via undici. Fix available.
- **fast-uri** (transitive; `3.0.0 - 3.1.7`) — inconsistent host case normalization via percent-encoded octets. Fix available.

#### LOW / INFO findings

None.

## Hints recorded but not acted on

| Hint                    | Value                |
| ----------------------- | -------------------- |
| bootstrapper_confidence | first-class          |
| quality_override        | false                |
| path_taken              | standard             |
| self_check_answers      | null                 |
| team_size               | solo                 |
| deployment_target       | cloudflare-pages     |
| ci_provider             | github-actions       |
| ci_default_flow         | auto-deploy-on-merge |
| has_auth                | true                 |
| has_payments            | false                |
| has_realtime            | false                |
| has_ai                  | true                 |
| has_background_jobs     | false                |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep (`CLAUDE.md` vs `CLAUDE.md.scaffold`).
- Upgrade Node to ≥ 22.22.3 (or 24.16+) before running dev/build, and update `.nvmrc` to match — the shipped `.nvmrc` (22.14.0) is below what the dependencies require.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
