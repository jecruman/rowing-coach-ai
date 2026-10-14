import { CircleAlert } from "lucide-react";

interface ServerErrorProps {
  message?: string | null;
  /** Announce as an alert: only for errors that appear after a client-side action, not ones present at page load. */
  announce?: boolean;
}

export function ServerError({ message, announce = false }: ServerErrorProps) {
  if (!message) return null;

  return (
    <p
      role={announce ? "alert" : undefined}
      className="border-destructive/40 bg-destructive/10 text-destructive flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
    >
      <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
      {message}
    </p>
  );
}
