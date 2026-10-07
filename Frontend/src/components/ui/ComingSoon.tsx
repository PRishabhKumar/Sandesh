"use client";

import { Sparkles } from "lucide-react";

import { COPY } from "@/lib/constants";

/**
 * The honest placeholder used by every mocked feature (calls, Stories, linked
 * devices, real end-to-end encryption). The assignment allows these to be
 * stubs - we label them clearly instead of pretending.
 */
export function ComingSoon({ feature, note }: { feature: string; note?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-hover">
        <Sparkles className="h-6 w-6 text-brand" />
      </span>
      <h3 className="text-base font-semibold text-ink">{feature} is coming soon</h3>
      <p className="max-w-[320px] text-[13px] leading-5 text-ink-secondary">{note ?? COPY.comingSoon}</p>
    </div>
  );
}
