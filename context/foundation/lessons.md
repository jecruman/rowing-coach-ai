# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## User text sent to the model must be validated and fenced

- **Context:** src/lib/services/coaching/getCoachingSuggestion.ts:54 (coaching-model-access implementation review, 2026-10-07)
- **Problem:** `comment`, `goal` and `notes` enter the model's user message without length limits or delimiting. No exposure while input is a fixed sample, but S-02 passes real user input.
- **Rule:** Every user-written field sent to a model has a zod `.max()` limit and is wrapped in delimiters (e.g. `<user_comment>…</user_comment>`), and the system prompt tells the model to treat that content as data, not instructions.
- **Applies to:** `src/lib/services/**` and any code that builds model prompts from user input; first used in S-02 `first-session-suggestion`.

## Ship the schema before the code that needs it

- **Context:** .github/workflows/ci.yml deploy job (rower-profile-and-goals implementation review, 2026-10-08)
- **Problem:** Migrations reach production only by a manual `supabase db push`; a merge that adds a migration plus code using it deploys the code regardless, so pages can query tables that don't exist yet.
- **Rule:** Before merging code that depends on a new migration, run `npx supabase db push`, regenerate `src/db/database.types.ts` with `npx supabase gen types typescript --linked`, and commit both with the migration. Plans put the push in the first phase, before any code uses the new tables.
- **Applies to:** Every change that adds files under `supabase/migrations/`.
