"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Square icon button used everywhere in Signal's chrome (header actions,
 * hover actions on a bubble, composer buttons). `label` doubles as the
 * accessible name and the tooltip.
 */
export function IconButton({
  children,
  label,
  active = false,
  tone = "default",
  className = "",
  ...rest
}: {
  children: ReactNode;
  label: string;
  active?: boolean;
  tone?: "default" | "danger";
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-fast
        ${tone === "danger" ? "text-danger hover:bg-danger/10" : "text-ink-secondary hover:bg-hover hover:text-ink"}
        ${active ? "bg-hover text-ink" : ""}
        disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}
