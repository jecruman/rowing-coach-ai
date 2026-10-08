import React, { useState } from "react";
import { Cake, CircleAlert, Save, Sailboat, Weight } from "lucide-react";
import { FormField, inputBase } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ProfileInputSchema } from "@/lib/services/profile/rules";
import { cn } from "@/lib/utils";
import { BOATS, type RowerProfile } from "@/types";

type Field = "birthYear" | "weightKg" | "boat";

interface Props {
  profile: RowerProfile | null;
}

export default function ProfileForm({ profile }: Props) {
  const [birthYear, setBirthYear] = useState(profile?.birthYear?.toString() ?? "");
  const [weightKg, setWeightKg] = useState(profile?.weightKg?.toString() ?? "");
  const [boat, setBoat] = useState<string>(profile?.boat ?? "");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});

  /** Mirrors the server: the same schema the endpoint uses; the server stays authoritative. */
  function validate() {
    const parsed = ProfileInputSchema.safeParse({ birthYear, weightKg, boat });
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
    if (!validate()) {
      e.preventDefault();
    }
  }

  return (
    <form method="POST" action="/api/profile" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="birthYear"
        label="Birth year"
        inputMode="numeric"
        autoComplete="off"
        value={birthYear}
        onChange={(v) => {
          setBirthYear(v);
          clearError("birthYear");
        }}
        placeholder="e.g. 1984"
        error={errors.birthYear}
        icon={<Cake className="size-4" />}
      />

      <FormField
        id="weightKg"
        label="Weight (kg)"
        inputMode="decimal"
        autoComplete="off"
        value={weightKg}
        onChange={(v) => {
          setWeightKg(v);
          clearError("weightKg");
        }}
        placeholder="e.g. 72.5"
        error={errors.weightKg}
        icon={<Weight className="size-4" />}
      />

      <div>
        <label htmlFor="boat" className="mb-1 block text-sm text-blue-100/80">
          Boat
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
        {errors.boat && (
          <p className="mt-1 flex items-center gap-1 text-xs text-red-300">
            <CircleAlert className="size-3" />
            {errors.boat}
          </p>
        )}
      </div>

      <SubmitButton pendingText="Saving..." icon={<Save className="size-4" />}>
        Save profile
      </SubmitButton>
    </form>
  );
}
