"use client";

import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

import { useUiStore } from "@/stores/ui";

/**
 * Bottom-left toast stack (max 3, auto-dismiss after 4s) - used for message
 * failures, group events, "copied", "reconnecting…" and "Coming soon".
 */
export function Toaster() {
  const toasts = useUiStore((state) => state.toasts);
  const dismiss = useUiStore((state) => state.dismissToast);

  if (!toasts.length) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-6 left-6 z-[60] flex w-[min(360px,calc(100vw-3rem))] flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex animate-fade-up items-center gap-3 rounded-card bg-[#2b2b2b] px-4 py-3 text-sm text-white shadow-modal
            [data-theme=dark]_&:bg-[#3b3b3b]"
        >
          <span className="shrink-0">
            {toast.tone === "error" ? (
              <AlertCircle className="h-4 w-4 text-[#ff8a80]" />
            ) : toast.tone === "success" ? (
              <CheckCircle2 className="h-4 w-4 text-online" />
            ) : (
              <Info className="h-4 w-4 text-brand-soft" />
            )}
          </span>
          <span className="flex-1 leading-5">{toast.message}</span>
          {toast.action && (
            <button
              onClick={() => {
                toast.action?.run();
                dismiss(toast.id);
              }}
              className="shrink-0 rounded-btn px-2 py-1 text-[13px] font-medium text-brand-soft hover:bg-white/10"
            >
              {toast.action.label}
            </button>
          )}
          <button
            onClick={() => dismiss(toast.id)}
            aria-label="Dismiss"
            className="shrink-0 rounded-full p-1 text-white/60 hover:bg-white/10 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
