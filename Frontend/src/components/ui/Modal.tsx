"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import { IconButton } from "./IconButton";

/**
 * Centred dialog, Signal style: 12px radius, 24px padding, soft backdrop,
 * 150ms scale-in, closes on Esc or backdrop click, focus moves inside on open.
 *
 * A hand-rolled component instead of a dialog library: ~60 lines, no extra
 * dependency, and the focus/Esc behaviour is easy to explain.
 */
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  width = "md",
}: {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: "sm" | "md" | "lg";
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    // move focus into the dialog (first focusable control, else the panel)
    const focusable = panelRef.current?.querySelector<HTMLElement>(
      "input, textarea, button, [tabindex]:not([tabindex='-1'])",
    );
    (focusable ?? panelRef.current)?.focus();

    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const widths = { sm: "max-w-[360px]", md: "max-w-[440px]", lg: "max-w-[560px]" };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`w-full ${widths[width]} animate-scale-in rounded-t-2xl bg-app p-6 shadow-modal sm:rounded-card`}
      >
        <header className="mb-4 flex items-start justify-between gap-4">
            {title ? <h2 className="text-lg font-semibold leading-7 text-ink">{title}</h2> : <span />}
          <IconButton label="Close" onClick={onClose} className="-mr-1 -mt-1">
            <X className="h-5 w-5" />
          </IconButton>
        </header>
        <div>{children}</div>
        {footer && <footer className="mt-6 flex justify-end gap-2">{footer}</footer>}
      </div>
    </div>
  );
}
