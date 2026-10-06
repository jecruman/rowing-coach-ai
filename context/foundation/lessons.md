# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## User text sent to the model must be validated and fenced

- **Context:** src/lib/services/coaching/getCoachingSuggestion.ts:54 (coaching-model-access implementation review, 2026-10-07)
- **Problem:** `comment`, `goal` and `notes` enter the model's user message without length limits or delimiting. No exposure while input is a fixed sample, but S-02 passes real user input.
- **Rule:** Every user-written field sent to a model has a zod `.max()` limit and is wrapped in delimiters (e.g. `<user_comment>…</user_comment>`), and the system prompt tells the model to treat that content as data, not instructions.
- **Applies to:** `src/lib/services/**` and any code that builds model prompts from user input; first used in S-02 `first-session-suggestion`.
