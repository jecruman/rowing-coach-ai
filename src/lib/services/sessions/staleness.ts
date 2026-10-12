/**
 * Whether a session was edited after its stored suggestion was built.
 *
 * `suggestionSessionUpdatedAt` is the session's `updated_at` as the suggestion endpoint read it; suggestions stored
 * before that was recorded have null, and fall back to the suggestion's own `created_at`. Timestamps compare as
 * instants, not strings: PostgREST may format them with different fractional digits.
 */
export function editedAfterSuggestion(
  sessionUpdatedAt: string,
  suggestion: { createdAt: string; sessionUpdatedAt: string | null },
): boolean {
  const builtFrom = suggestion.sessionUpdatedAt ?? suggestion.createdAt;
  return Date.parse(sessionUpdatedAt) > Date.parse(builtFrom);
}
