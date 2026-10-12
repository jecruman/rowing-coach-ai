import React, { useEffect, useState } from "react";
import {
  Activity,
  CalendarDays,
  CircleAlert,
  Gauge,
  ListOrdered,
  Ruler,
  Sailboat,
  Save,
  Timer,
  Zap,
} from "lucide-react";
import { FormField, inputBase } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { MAX_COMMENT_LENGTH, SessionInputSchema, type SessionFormValues } from "@/lib/services/sessions/rules";
import { cn } from "@/lib/utils";
import { BOATS, type SessionType } from "@/types";

type Field = "sessionType" | "rowedOn" | "distanceM" | "time" | "splits" | "spm" | "dps" | "watts" | "boat" | "comment";

interface Props {
  /** Server's today (`YYYY-MM-DD`); replaced by the browser's local date on mount if untouched. Unused when editing. */
  today: string;
  /** Values of the session being edited; when set, the form edits instead of logging and keeps the stored date. */
  initial?: SessionFormValues;
  /** Where the form posts; defaults to the log endpoint. */
  action?: string;
  /** Shows the session type but does not let it change (editing); the value is still submitted. */
  lockType?: boolean;
}

const TYPES: { type: SessionType; label: string }[] = [
  { type: "erg", label: "Erg" },
  { type: "water", label: "Water" },
];

function localIsoDate(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${String(now.getFullYear())}-${month}-${day}`;
}

function errorText(message: string | undefined) {
  return message ? (
    <p className="mt-1 flex items-center gap-1 text-xs text-red-300">
      <CircleAlert className="size-3" />
      {message}
    </p>
  ) : null;
}

export default function SessionForm({ today, initial, action = "/api/sessions", lockType = false }: Props) {
  const [sessionType, setSessionType] = useState<SessionType>(initial?.sessionType ?? "erg");
  const [rowedOn, setRowedOn] = useState(initial?.rowedOn ?? today);
  const [distanceM, setDistanceM] = useState(initial?.distanceM ?? "");
  const [time, setTime] = useState(initial?.time ?? "");
  const [splits, setSplits] = useState(initial?.splits ?? "");
  const [spm, setSpm] = useState(initial?.spm ?? "");
  const [dps, setDps] = useState(initial?.dps ?? "");
  const [watts, setWatts] = useState(initial?.watts ?? "");
  const [boat, setBoat] = useState(initial?.boat ?? "");
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});

  // The server renders its own (UTC) date; the rower's "today" is their local date, which is only known after
  // hydration (reading it during render would mismatch the server HTML), so it is synced once on mount.
  // An edited session keeps its stored date.
  const editing = initial !== undefined;
  useEffect(() => {
    if (editing) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off sync with the browser clock after hydration
    setRowedOn((current) => (current === today ? localIsoDate() : current));
  }, [today, editing]);

  /** Mirrors the server: the same schema the endpoint uses; the server stays authoritative. */
  function validate() {
    const parsed = SessionInputSchema.safeParse({
      sessionType,
      rowedOn,
      distanceM,
      time,
      splits,
      spm,
      dps,
      watts,
      boat,
      comment,
    });
    const next: typeof errors = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = (issue.path[0] ?? "sessionType") as Field;
        next[field] ??= issue.message;
      }
    }
    setErrors(next);
    return parsed.success;
  }

  function clearError(field: Field) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
    }
  }

  return (
    <form method="POST" action={action} className="space-y-4" onSubmit={handleSubmit} noValidate>
      <fieldset>
        <legend className="mb-1 block text-sm text-blue-100/80">Session type</legend>
        {/* Disabled radios are not submitted, so a locked type is sent through a hidden field instead. */}
        {lockType && <input type="hidden" name="sessionType" value={sessionType} />}
        <div className="grid grid-cols-2 gap-2">
          {TYPES.map(({ type, label }) => (
            <label
              key={type}
              className={cn(
                "flex items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-purple-400",
                lockType ? "cursor-not-allowed" : "cursor-pointer",
                sessionType === type
                  ? "border-purple-400 bg-purple-600 text-white"
                  : cn("border-white/20 bg-white/5 text-blue-100/80", lockType ? "opacity-50" : "hover:bg-white/15"),
              )}
            >
              <input
                type="radio"
                name={lockType ? undefined : "sessionType"}
                disabled={lockType}
                value={type}
                checked={sessionType === type}
                onChange={() => {
                  setSessionType(type);
                  setErrors({});
                }}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
        {errorText(errors.sessionType)}
      </fieldset>

      <FormField
        id="rowedOn"
        label="Date"
        type="date"
        value={rowedOn}
        onChange={(v) => {
          setRowedOn(v);
          clearError("rowedOn");
        }}
        error={errors.rowedOn}
        icon={<CalendarDays className="size-4" />}
      />

      <FormField
        id="distanceM"
        label="Distance (m)"
        inputMode="numeric"
        autoComplete="off"
        value={distanceM}
        onChange={(v) => {
          setDistanceM(v);
          clearError("distanceM");
        }}
        placeholder={sessionType === "erg" ? "e.g. 2000" : "e.g. 8000"}
        error={errors.distanceM}
        icon={<Ruler className="size-4" />}
      />

      <FormField
        id="time"
        label="Time"
        autoComplete="off"
        value={time}
        onChange={(v) => {
          setTime(v);
          clearError("time");
        }}
        placeholder="e.g. 7:30.5 or 1:02:30"
        error={errors.time}
        icon={<Timer className="size-4" />}
      />

      <FormField
        id="splits"
        label="Splits per 500 m (optional)"
        autoComplete="off"
        value={splits}
        onChange={(v) => {
          setSplits(v);
          clearError("splits");
        }}
        placeholder="e.g. 1:52 1:53.5 1:51"
        error={errors.splits}
        icon={<ListOrdered className="size-4" />}
      />

      <FormField
        id="spm"
        label="Stroke rate, spm (optional)"
        inputMode="text"
        autoComplete="off"
        value={spm}
        onChange={(v) => {
          setSpm(v);
          clearError("spm");
        }}
        placeholder="e.g. 24-26 or 22"
        error={errors.spm}
        icon={<Activity className="size-4" />}
      />

      {sessionType === "erg" ? (
        <FormField
          id="watts"
          label="Average watts (optional)"
          inputMode="numeric"
          autoComplete="off"
          value={watts}
          onChange={(v) => {
            setWatts(v);
            clearError("watts");
          }}
          placeholder="e.g. 230"
          error={errors.watts}
          icon={<Zap className="size-4" />}
        />
      ) : (
        <>
          <FormField
            id="dps"
            label="Distance per stroke, m (optional)"
            inputMode="decimal"
            autoComplete="off"
            value={dps}
            onChange={(v) => {
              setDps(v);
              clearError("dps");
            }}
            placeholder="e.g. 8.5-9 or 9"
            error={errors.dps}
            icon={<Gauge className="size-4" />}
          />

          <div>
            <label htmlFor="boat" className="mb-1 block text-sm text-blue-100/80">
              Boat (optional)
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40">
                <Sailboat className="size-4" />
              </span>
              <select
                id="boat"
                name="boat"
                value={boat}
                onChange={(e) => {
                  setBoat(e.target.value);
                  clearError("boat");
                }}
                className={cn(
                  inputBase,
                  "appearance-auto [&>option]:text-black",
                  errors.boat ? "border-red-400/60 focus:ring-red-400" : "border-white/20 focus:ring-purple-400",
                )}
              >
                <option value="">Not set</option>
                {BOATS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
            {errorText(errors.boat)}
          </div>
        </>
      )}

      <div>
        <label htmlFor="comment" className="mb-1 block text-sm text-blue-100/80">
          Comment (optional)
        </label>
        <textarea
          id="comment"
          name="comment"
          rows={3}
          maxLength={MAX_COMMENT_LENGTH}
          value={comment}
          onChange={(e) => {
            setComment(e.target.value);
            clearError("comment");
          }}
          placeholder="How did it feel?"
          className={cn(
            inputBase,
            "pl-3",
            errors.comment ? "border-red-400/60 focus:ring-red-400" : "border-white/20 focus:ring-purple-400",
          )}
        />
        {errorText(errors.comment)}
      </div>

      <SubmitButton pendingText="Saving..." icon={<Save className="size-4" />}>
        {editing ? "Save changes" : "Save session"}
      </SubmitButton>
    </form>
  );
}
