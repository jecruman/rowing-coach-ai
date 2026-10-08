import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";

import { ServerError } from "@/components/auth/ServerError";
import { Button } from "@/components/ui/button";
import {
  SuggestionPayloadSchema,
  type SuggestionDefaultReason,
  type SuggestionPayload,
} from "@/lib/services/coaching/schema";
import { formatTime } from "@/lib/services/profile/rules";

interface Props {
  sessionId: string;
  /** The stored suggestion read by the page; when present nothing is requested. */
  initial: SuggestionPayload | null;
}

type State =
  | { status: "loading" }
  | { status: "ready"; payload: SuggestionPayload }
  | { status: "signedOut" }
  | { status: "error"; message: string };

const DEFAULT_REASON_TEXT: Record<SuggestionDefaultReason, string> = {
  not_allowed: "Personal coaching is not enabled for this account.",
  not_configured: "Coaching is not configured right now.",
  model_failed: "The coach couldn't produce a suggestion within the safety limits, so here is a safe session.",
};

async function requestSuggestion(sessionId: string): Promise<State> {
  let response: Response;
  try {
    response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/suggestion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  } catch {
    return { status: "error", message: "Could not reach the coach. Check your connection and try again." };
  }
  if (response.status === 401) return { status: "signedOut" };
  if (!response.ok) return { status: "error", message: "The coach could not prepare a suggestion. Please try again." };

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { status: "error", message: "The coach sent an unreadable answer. Please try again." };
  }
  const parsed = SuggestionPayloadSchema.safeParse(body);
  return parsed.success
    ? { status: "ready", payload: parsed.data }
    : { status: "error", message: "The coach sent an unreadable answer. Please try again." };
}

function Suggestion({ payload }: { payload: SuggestionPayload }) {
  const { suggestion, isDefault, defaultReason } = payload;
  const { targets } = suggestion;

  const rows: { label: string; value: string }[] = [
    { label: "Type", value: suggestion.sessionType === "erg" ? "Erg" : "Water" },
    { label: "Total time", value: `${String(suggestion.totalMinutes)} min` },
    ...(suggestion.totalDistanceM === null
      ? []
      : [{ label: "Total distance", value: `${String(suggestion.totalDistanceM)} m` }]),
    { label: "Max stroke rate", value: `${String(targets.maxSpm)} spm` },
    ...(targets.spmRange ? [{ label: "Stroke rate", value: `${targets.spmRange} spm` }] : []),
    ...(targets.pacePer500m ? [{ label: "Target pace /500 m", value: targets.pacePer500m }] : []),
    ...(targets.fastestPacePer500s === null
      ? []
      : [{ label: "Fastest pace /500 m", value: formatTime(targets.fastestPacePer500s) }]),
  ];

  return (
    <div className="space-y-4">
      {isDefault && (
        <div className="rounded-lg border border-amber-300/30 bg-amber-900/20 px-3 py-2 text-sm">
          <span className="font-semibold text-amber-200">Safe default</span>
          {defaultReason && <p className="mt-1 text-amber-100/80">{DEFAULT_REASON_TEXT[defaultReason]}</p>}
        </div>
      )}

      <p className="font-medium break-words">{suggestion.structure}</p>

      <dl className="space-y-3">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex items-baseline justify-between gap-4">
            <dt className="text-sm text-blue-100/70">{label}</dt>
            <dd className="text-right font-medium break-words">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="space-y-3 border-t border-white/10 pt-4 text-sm">
        <div>
          <h3 className="text-blue-100/70">Focus</h3>
          <p className="break-words">{suggestion.focus}</p>
        </div>
        <div>
          <h3 className="text-blue-100/70">Why</h3>
          <p className="break-words">{suggestion.reason}</p>
        </div>
        <div>
          <h3 className="text-blue-100/70">Technique tip</h3>
          <p className="break-words">{suggestion.techniqueTip}</p>
        </div>
      </div>
    </div>
  );
}

/** The suggested next session: the stored one, or requested once on mount with a waiting state. */
export default function SuggestionPanel({ sessionId, initial }: Props) {
  const [state, setState] = useState<State>(initial ? { status: "ready", payload: initial } : { status: "loading" });

  // Requested once after hydration when the page had no stored suggestion; the state is set when the answer arrives.
  useEffect(() => {
    if (initial) return;
    let active = true;
    void requestSuggestion(sessionId).then((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
    };
  }, [initial, sessionId]);

  function retry() {
    setState({ status: "loading" });
    void requestSuggestion(sessionId).then(setState);
  }

  return (
    <section
      className="rounded-2xl border border-white/10 bg-white/10 p-6 backdrop-blur-xl"
      aria-labelledby="suggestion-heading"
    >
      <h2 id="suggestion-heading" className="mb-4 text-lg font-semibold">
        Next session
      </h2>

      <div aria-live="polite" aria-busy={state.status === "loading"}>
        {state.status === "loading" && (
          <p role="status" className="flex items-center gap-2 text-sm text-blue-100/80">
            <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Coach is thinking… this can take up to about a minute and a half.
          </p>
        )}

        {state.status === "ready" && <Suggestion payload={state.payload} />}

        {state.status === "signedOut" && (
          <p className="text-sm">
            Please sign in again.{" "}
            <a href="/auth/signin" className="text-purple-300 hover:underline">
              Sign in
            </a>
          </p>
        )}

        {state.status === "error" && (
          <div className="space-y-3">
            <ServerError message={state.message} />
            <Button
              type="button"
              onClick={retry}
              className="w-full rounded-lg bg-purple-600 px-4 py-2 font-medium text-white transition-colors hover:bg-purple-500"
            >
              <RotateCcw />
              Retry
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
