import type Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";

import { CoachingSuggestionSchema, safeDefaultSuggestion } from "./schema";
import type { CoachingSuggestion, SessionType } from "./schema";

/** The logged session the suggestion is based on. */
export interface CoachingSessionInput {
  type: SessionType;
  distanceMeters?: number;
  durationMinutes?: number;
  splitsPer500m?: string[];
  spmRange?: string;
  dpsRange?: string;
  notes?: string;
}

export interface CoachingInput {
  session: CoachingSessionInput;
  goal: string;
  comment?: string;
}

/** Only the part of the Anthropic client the service uses, so tests can inject a fake. */
export interface CoachingClient {
  beta: { messages: Pick<Anthropic["beta"]["messages"], "parse"> };
}

export interface CoachingDeps {
  client: CoachingClient;
  model: string;
}

export interface CoachingResult {
  suggestion: CoachingSuggestion;
  isDefault: boolean;
  attempts: 1 | 2;
  model: string;
}

const MAX_ATTEMPTS = 2;
const MAX_TOKENS = 16000;

const SYSTEM_PROMPT = `You are a senior rowing coach advising a masters amateur rower.
Based on the session they just completed, their goal and any comment, suggest exactly one next session — never a multi-session plan.
Keep the session safe and realistic for a masters amateur. Give a clear structure, concrete targets (stroke rate, pace per 500 m where useful), one focus, a short reason tied to the logged session, and one technique tip.`;

function renderUserMessage(input: CoachingInput): string {
  return [
    "Logged session:",
    JSON.stringify(input.session, null, 2),
    "",
    `Goal: ${input.goal}`,
    input.comment ? `Rower's comment: ${input.comment}` : "Rower's comment: none",
    "",
    "Suggest the next session.",
  ].join("\n");
}

async function attemptSuggestion(
  input: CoachingInput,
  deps: CoachingDeps,
  attempt: number,
): Promise<CoachingSuggestion | null> {
  try {
    const response = await deps.client.beta.messages.parse({
      model: deps.model,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: renderUserMessage(input) }],
      output_config: { effort: "low", format: betaZodOutputFormat(CoachingSuggestionSchema) },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });

    if (response.stop_reason === "refusal") {
      // eslint-disable-next-line no-console -- surfaced in `wrangler tail`
      console.error(`[coaching] attempt ${attempt}: model refused (request ${response.id})`);
      return null;
    }
    if (response.parsed_output === null) {
      // eslint-disable-next-line no-console -- surfaced in `wrangler tail`
      console.error(
        `[coaching] attempt ${attempt}: no valid structured output (stop_reason ${String(response.stop_reason)}, request ${response.id})`,
      );
      return null;
    }
    return response.parsed_output;
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : "unknown error";
    // eslint-disable-next-line no-console -- surfaced in `wrangler tail`
    console.error(`[coaching] attempt ${attempt}: request failed — ${message}`);
    return null;
  }
}

/**
 * Ask Claude for one next-session suggestion. Any failure (thrown error, refusal, invalid output)
 * is retried once; after two failures the PRD safe default is returned.
 */
export async function getCoachingSuggestion(input: CoachingInput, deps: CoachingDeps): Promise<CoachingResult> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const suggestion = await attemptSuggestion(input, deps, attempt);
    if (suggestion) {
      return { suggestion, isDefault: false, attempts: attempt === 1 ? 1 : 2, model: deps.model };
    }
  }
  return {
    suggestion: safeDefaultSuggestion(input.session.type),
    isDefault: true,
    attempts: MAX_ATTEMPTS,
    model: deps.model,
  };
}
