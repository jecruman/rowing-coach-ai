import Anthropic from "@anthropic-ai/sdk";
import { ANTHROPIC_API_KEY, COACH_MODEL } from "astro:env/server";

/** Model id for coaching calls; `COACH_MODEL` defaults to "claude-opus-5-5" in `env.schema`. */
export const coachModel: string = COACH_MODEL;

/** Per-request timeout; the service's own two attempts are the only retry layer, so worst case is 2 × this. */
const REQUEST_TIMEOUT_MS = 60_000;

/** Build the Anthropic client from the server secret; `null` when the key is not configured. */
export function createCoachingClient(): Anthropic | null {
  if (!ANTHROPIC_API_KEY) {
    return null;
  }
  return new Anthropic({ apiKey: ANTHROPIC_API_KEY, maxRetries: 0, timeout: REQUEST_TIMEOUT_MS });
}
