"use client";

import { Users } from "lucide-react";

import { fileUrl } from "@/lib/api";
import { initials } from "@/lib/format";
import { avatarForeground, fallbackAvatarColor } from "@/lib/palette";

type Size = 24 | 32 | 36 | 40 | 48 | 80 | 120;

const SIZE_CLASS: Record<Size, string> = {
  24: "h-6 w-6 text-[10px]",
  32: "h-8 w-8 text-[11px]",
  36: "h-9 w-9 text-xs",
  40: "h-10 w-10 text-[13px]",
  48: "h-12 w-12 text-sm",
  80: "h-20 w-20 text-xl",
  120: "h-[120px] w-[120px] text-3xl",
};

const DOT_CLASS: Record<Size, string> = {
  24: "h-2 w-2",
  32: "h-2.5 w-2.5",
  36: "h-3 w-3",
  40: "h-3 w-3",
  48: "h-3 w-3",
  80: "h-4 w-4",
  120: "h-5 w-5",
};

export function Avatar({
  name,
  id = 0,
  src,
  color,
  size = 48,
  online = false,
  isGroup = false,
  className = "",
}: {
  name: string;
  id?: number;
  src?: string | null;
  color?: string | null;
  size?: Size;
  online?: boolean;
  isGroup?: boolean;
  className?: string;
}) {
  const background = color || fallbackAvatarColor(id);
  const foreground = avatarForeground(background);

  return (
    <span className={`relative inline-flex shrink-0 ${className}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={fileUrl(src)}
          alt={name}
          className={`${SIZE_CLASS[size]} rounded-full object-cover`}
          draggable={false}
        />
      ) : (
        <span
          className={`${SIZE_CLASS[size]} flex items-center justify-center rounded-full font-semibold select-none`}
          style={{ background, color: foreground }}
          aria-hidden={false}
          aria-label={name}
        >
          {isGroup ? <Users className="h-1/2 w-1/2" /> : initials(name)}
        </span>
      )}

      {online && (
        <span
          className={`${DOT_CLASS[size]} absolute bottom-0 right-0 rounded-full bg-online ring-2 ring-[var(--bg-sidebar)]`}
          aria-label="Online"
          role="img"
        />
      )}
    </span>
  );
}
