import { useState } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

interface Props {
  sessionId: string;
}

/** "Delete session" with an inline confirm step; confirming posts a plain form to the delete endpoint. */
export default function DeleteSessionButton({ sessionId }: Props) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button
        type="button"
        onClick={() => {
          setConfirming(true);
        }}
        className="w-full rounded-lg border border-red-400/40 bg-transparent px-4 py-2 text-sm font-medium text-red-200 transition-colors hover:bg-red-900/30"
      >
        <Trash2 />
        Delete session
      </Button>
    );
  }

  return (
    <form
      method="POST"
      action={`/api/sessions/${encodeURIComponent(sessionId)}/delete`}
      className="space-y-3 rounded-lg border border-red-400/40 bg-red-900/20 p-4"
    >
      <p className="text-sm text-red-100">Delete this session and its suggestion? This cannot be undone.</p>
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          onClick={() => {
            setConfirming(false);
          }}
          className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500"
        >
          Delete
        </Button>
      </div>
    </form>
  );
}
