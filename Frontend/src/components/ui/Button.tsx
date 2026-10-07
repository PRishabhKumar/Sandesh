"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "outline" | "destructive" | "ghost";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-hover",
  secondary: "bg-transparent text-brand hover:bg-hover",
  outline: "border border-brand text-brand hover:bg-brand/5",
  destructive: "bg-danger text-white hover:brightness-95",
  ghost: "bg-transparent text-ink hover:bg-hover",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-9 px-4 text-sm",
  lg: "h-11 px-6 text-[15px]",
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  className = "",
  ...rest
}: {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-btn font-medium transition-colors duration-fast
        disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : null}
      {children}
    </button>
  );
}
