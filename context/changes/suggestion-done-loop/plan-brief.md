# Suggestion Done Loop — Plan Brief

> Full plan: `context/changes/suggestion-done-loop/plan.md`

## What & Why

Roadmap S-04 (JES-15; US-01, FR-009, FR-010) closes the coaching loop: suggested session → marked done or skipped → adjusted next suggestion. It completes the PRD's primary success criterion. The roadmap's risk is that "reflects it" could pass review while changing nothing, so this plan gives it a deterministic, tested rule.

## Starting Point

S-02 stores one immutable suggestion per session and generates it with a small agent over an in-memory context, with every answer checked by the limits engine in code. Nothing records whether a suggestion was followed, and the agent never sees past suggestions.

## Desired End State

When logging a session, the rower sees the latest session's stored suggestion and answers Done / Skipped / Not answering. The mark is saved with the new session, is final, and appears on the old suggestion's panel. After a skip, the next suggestion can't ask for more time (any type) or more distance (same type) than the skipped one. The coach sees every suggestion with its outcome and, for done, compares what was rowed with what was suggested.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Where to mark | On the new-session form, saved with the new session | Matches the PRD flow (mark, then log) in one phone step, before the next suggestion exists |
| "Reflects it" | Agent sees marks, plus a code-enforced no make-up rule after a skip | One deterministic, unit-tested effect; the coach still reasons over the history |
| Changeable | Final once set (insert-only) | A mark that shaped a later suggestion can never change underneath it |
| Unmarked | Stays unmarked; agent sees "unknown"; no cap | Never invents data the rower didn't give |
| Which suggestion | Only the latest session's stored suggestion | One clear question about what the rower was just told to do |
| "Done" means | The session being logged is the suggested one | Links suggestion to its real outcome for the coach |
| Skip cap scope | Minutes for any type; distance only for the same type | Catching up is about load, not boat |
| Derived (veto at review) | Only stored suggestions can be marked; a mark on a log dated before the suggested session is rejected; the cap comes only from the mark entered with the coached session; marks cascade with either session | Keeps marks consistent and limits stable once computed |

## Scope

**In scope:** `suggestion_outcomes` table with RLS; question block on the log form; server-checked save in `POST /api/sessions`; mark shown on the panel; outcomes in coaching context; skip cap in validator and default; marks in tools and prompt; unit and rls-check coverage.

**Out of scope:** marking from the panel, changing or deleting marks, marking older suggestions, auto-marking or requiring a mark, a coded effect for done, marking unstored defaults, regenerating stored suggestions, S-03 reorder edge cases, smoke coverage of marking.

## Architecture / Approach

The log page loads the suggestion that can be marked (latest session → stored suggestion → no outcome yet). `POST /api/sessions` re-checks it, inserts the session, then the outcome; a failed outcome insert never loses the session. The suggestion endpoint loads outcomes for the history window into `CoachingContext`. `limitContext` turns a **skipped** mark logged with the coached session into `skipCap`, which the existing validator, retry feedback and `safeDefaultFor` enforce. The tools show each session's answered suggestion.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Store and capture the mark | Table + RLS, types, form question, server-checked save, panel line, rls-check | Migration must be pushed before the code commit; stale-question races |
| 2. Make the next suggestion reflect it | Outcomes in context, skip cap (validator + default), tools/prompt, endpoint wiring | Agent may ignore done history (only the skip cap is enforced) |

**Prerequisites:** S-02 done (yes); you can run `npx supabase db push`; an allowlisted account for manual checks.
**Estimated effort:** ~2 sessions, one per phase.

## Open Risks & Assumptions

- S-03 (planned in parallel) edits and deletes sessions. Deletes cascade marks correctly, but changing `rowed_on` after marking could make a "done" session appear before its suggestion; this is left to S-03.
- Saving the session and its mark isn't one transaction, so a failed mark insert leaves the suggestion unmarked. This is accepted, and consistent with "stays unmarked".
- The derived rules above are planner choices; change them at plan review if they don't match how you train.

## Success Criteria (Summary)

- A suggestion marked skipped is followed by one with total minutes ≤ the skipped one's (and distance ≤ it for the same type), checked by unit tests and the validator.
- Marks are private, final and one per suggestion, proven by `rls-check`.
- Logging without answering still works, and the session is never lost.
