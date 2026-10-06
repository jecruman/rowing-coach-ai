---
change_id: coaching-model-access
title: Model API access and one validated coaching call
status: impl_reviewed
created: 2026-10-07
updated: 2026-10-07
archived_at: null
---

## Notes

Roadmap F-01 (foundation) in `context/foundation/roadmap.md`; Linear JES-11.

### Phase 2 deployed check (2026-10-06)

- Real call on the deployed Worker: `isDefault: false`, `attempts: 1`, model `claude-opus-5-5` at effort `low`, `durationMs` 8246 (wall 8.5 s) — first data point for the PRD's "analysis response target".
- CPU time per coaching request: 21 ms (real call), 20 ms (two fast API failures) — above the 10 ms Workers free-plan limit; requests still succeeded. Decide on Workers Paid ($5/month) before S-02 reaches real users.
- First attempt failed with `400` "API key is not scoped to a workspace" — use a workspace-scoped Anthropic key.
- Secrets must be type **Secret** in the dashboard; plain-text variables are dropped by the next `wrangler deploy`.
- 2.5: the 403 case for a signed-in, non-allowlisted account was skipped by the user (not verified manually); covered by the allowlist branch in `src/pages/api/coaching/try.ts`.
