-- Stored coach suggestions are final for their session: a user must not delete one and ask again
-- (that would allow unlimited model calls per session). Rows still go away with their session
-- through the on delete cascade on coach_suggestions.session_id.
drop policy "coach_suggestions_delete_own" on public.coach_suggestions;
