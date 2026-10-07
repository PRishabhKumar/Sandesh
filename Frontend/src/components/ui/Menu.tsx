"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export type MenuItem = {
  label: string;
  onSelect?: () => void;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
};

/**
 * Dropdown menu anchored to its trigger (Signal's "⋮" menus).
 *
 * Deliberately small: a button, a positioned panel, and a click-outside /
 * Esc handler. Menus are keyboard reachable because the trigger and every item
 * are real <button>s.
 */
export function Menu({
  trigger,
  items,
  align = "right",
  className = "",
}: {
  trigger: ReactNode;
  items: MenuItem[];
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocumentClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocumentClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocumentClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        {trigger}
      </div>

      {open && (
        <div
          role="menu"
          className={`absolute top-full z-40 mt-1 min-w-[200px] animate-scale-in overflow-hidden rounded-card border border-line
            bg-app py-1 shadow-menu ${align === "right" ? "right-0" : "left-0"}`}
        >
          {items.map((item, index) => (
            <div key={`${item.label}-${index}`}>
              {item.separatorBefore && <div className="my-1 h-px bg-line" />}
              <button
                role="menuitem"
                disabled={item.disabled}
                onClick={(event) => {
                  event.stopPropagation();
                  setOpen(false);
                  item.onSelect?.();
                }}
                className={`flex w-full items-center gap-3 px-4 py-2 text-left text-[14px] transition-colors duration-fast
                  hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40
                  ${item.danger ? "text-danger" : "text-ink"}`}
              >
                {item.icon && <span className="h-4 w-4 shrink-0">{item.icon}</span>}
                {item.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
