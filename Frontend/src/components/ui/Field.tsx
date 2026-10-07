"use client";

import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { forwardRef } from "react";

const BASE =
  "w-full rounded-btn border border-line bg-field px-3 py-2 text-sm text-ink placeholder:text-ink-tertiary " +
  "outline-none transition-shadow focus:border-brand focus:ring-2 focus:ring-brand-soft/60";

export const TextField = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function TextField({ className = "", ...rest }, ref) {
    return <input ref={ref} className={`${BASE} ${className}`} {...rest} />;
  },
);

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextArea({ className = "", ...rest }, ref) {
    return <textarea ref={ref} className={`${BASE} resize-none ${className}`} {...rest} />;
  },
);

/** Small switch used across the Settings screens (Signal's toggle). */
export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-fast disabled:opacity-50
        ${checked ? "bg-brand" : "bg-line"}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all duration-fast
          ${checked ? "left-[18px]" : "left-0.5"}`}
      />
    </button>
  );
}
