import Anthropic from "@anthropic-ai/sdk";
import { ANTHROPIC_API_KEY, COACH_MODEL } from "astro:env/server";

/** Model id for coaching calls; `COACH_MODEL` defaults to "claude-opus-5-5" in `env.schema`. */
export const coachModel: string = COACH_MODEL;

/** Build the Anthropic client from the server secret; `null` when the key is not configured. */
export function createCoachingClient(): Anthropic | null {
  if (!ANTHROPIC_API_KEY) {
    return null;
  }
  return new Anthropic({ apiKey: ANTHROPIC_API_KEY });
}
