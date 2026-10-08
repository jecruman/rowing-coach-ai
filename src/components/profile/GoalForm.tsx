import React, { useState } from "react";
import { CalendarDays, Eraser, Ruler, Save, Timer } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { formatTime, GoalInputSchema } from "@/lib/services/profile/rules";
import type { RowerGoal, SessionType } from "@/types";

type Field = "distanceM" | "targetTime" | "eventDate";

interface Props {
  sessionType: SessionType;
  goal: RowerGoal | null;
}

export default function GoalForm({ sessionType, goal }: Props) {
  const [distanceM, setDistanceM] = useState(goal?.distanceM.toString() ?? "");
  const [targetTime, setTargetTime] = useState(goal ? formatTime(goal.targetSeconds) : "");
  const [eventDate, setEventDate] = useState(goal?.eventDate ?? "");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});

  /** Mirrors the server: the same schema the endpoint uses; the server stays authoritative. */
  function validate() {
    const parsed = GoalInputSchema.safeParse({ sessionType, distanceM, targetTime, eventDate });
    const next: typeof errors = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as Field;
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
    // "Clear goal" needs no field checks; only a save is validated.
    const { submitter } = e.nativeEvent;
    if (submitter instanceof HTMLButtonElement && submitter.value === "clear") return;
    if (!validate()) {
      e.preventDefault();
    }
  }

  const id = (field: Field) => `${sessionType}-${field}`;

  return (
    <form method="POST" action="/api/goals" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <input type="hidden" name="sessionType" value={sessionType} />

      <FormField
        id={id("distanceM")}
        name="distanceM"
        label="Distance (m)"
        inputMode="numeric"
        autoComplete="off"
        value={distanceM}
        onChange={(v) => {
          setDistanceM(v);
          clearError("distanceM");
        }}
        placeholder="e.g. 2000"
        error={errors.distanceM}
        icon={<Ruler className="size-4" />}
      />

      <FormField
        id={id("targetTime")}
        name="targetTime"
        label="Target time"
        autoComplete="off"
        value={targetTime}
        onChange={(v) => {
          setTargetTime(v);
          clearError("targetTime");
        }}
        placeholder="e.g. 7:30 or 1:55.5"
        error={errors.targetTime}
        icon={<Timer className="size-4" />}
      />

      <FormField
        id={id("eventDate")}
        name="eventDate"
        label="Event date (optional)"
        type="date"
        value={eventDate}
        onChange={(v) => {
          setEventDate(v);
          clearError("eventDate");
        }}
        error={errors.eventDate}
        icon={<CalendarDays className="size-4" />}
      />

      <SubmitButton name="action" value="save" pendingText="Saving..." icon={<Save className="size-4" />}>
        Save goal
      </SubmitButton>

      {goal && (
        <button
          type="submit"
          name="action"
          value="clear"
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm text-blue-100/80 transition-colors hover:bg-white/15"
        >
          <Eraser className="size-4" />
          Clear goal
        </button>
      )}
    </form>
  );
}
