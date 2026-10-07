"use client";

import { Logo } from "@/components/ui/Logo";
import { COPY } from "@/lib/constants";

/** Shown when no conversation is selected (Signal's resting state). */
export function EmptyChatPane() {
  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center gap-4 bg-chat px-6 text-center">
      <Logo size={112} className="opacity-90" />
      <p className="max-w-[320px] text-[15px] leading-6 text-ink-secondary">{COPY.emptyChat}</p>
      <p className="max-w-[320px] text-[12px] leading-4 text-ink-tertiary">
        Say hello to a different messaging experience — no ads, no trackers, just conversations.
      </p>
    </div>
  );
}
