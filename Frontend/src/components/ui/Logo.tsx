"use client";

/**
 * The app mark: an original speech-bubble-with-lock SVG.
 *
 * Recreated from scratch (simple rounded shapes) so the project ships no
 * third-party brand assets - the assignment requires original work.
 * Used on the onboarding screens, the empty chat pane and the About screen.
 */
export function Logo({ size = 96, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      role="img"
      aria-label="Signal Clone logo"
      className={className}
    >
      <rect x="6" y="6" width="84" height="84" rx="26" fill="var(--signal-blue)" />
      <path
        d="M48 24c-13.8 0-25 10.4-25 23.2 0 7.3 3.6 13.8 9.3 18.1l-3.6 12.6 13.2-6.4c1.9.3 3.9.5 6.1.5 13.8 0 25-10.4 25-23.2S61.8 24 48 24Z"
        fill="white"
        opacity="0.96"
      />
      <path
        d="M48 38.5c3.6 0 6.5 2.9 6.5 6.5v1.3h.6c1.6 0 2.9 1.3 2.9 2.9v8.4c0 1.6-1.3 2.9-2.9 2.9H41c-1.6 0-2.9-1.3-2.9-2.9v-8.4c0-1.6 1.3-2.9 2.9-2.9h.6v-1.3c0-3.6 2.9-6.5 6.4-6.5Zm0 3.2c-1.8 0-3.2 1.4-3.2 3.2v1.4h6.4v-1.4c0-1.8-1.4-3.2-3.2-3.2Zm0 8.3a2.5 2.5 0 0 0-1.2 4.7v2.4h2.4v-2.4a2.5 2.5 0 0 0-1.2-4.7Z"
        fill="var(--signal-blue)"
      />
    </svg>
  );
}
