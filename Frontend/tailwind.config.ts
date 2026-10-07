import type { Config } from "tailwindcss";

/**
 * Tailwind is wired to CSS variables (see src/styles/tokens.css) instead of
 * hard-coded colours. That is what makes the dark theme a single attribute
 * flip on <html data-theme="dark"> rather than a pile of `dark:` classes.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // surfaces
        app: "var(--bg-app)",
        panel: "var(--bg-sidebar)",
        chat: "var(--bg-chat)",
        hover: "var(--bg-hover)",
        selected: "var(--bg-selected)",
        field: "var(--bg-input)",
        line: "var(--border)",

        // brand
        brand: {
          DEFAULT: "var(--signal-blue)",
          hover: "var(--signal-blue-hover)",
          link: "var(--signal-blue-link)",
          soft: "var(--signal-blue-soft)",
        },

        // text
        ink: {
          DEFAULT: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          tertiary: "var(--text-tertiary)",
        },

        // bubbles
        out: { DEFAULT: "var(--bubble-out-bg)", text: "var(--bubble-out-text)" },
        incoming: { DEFAULT: "var(--bubble-in-bg)", text: "var(--bubble-in-text)" },

        danger: "var(--danger)",
        online: "var(--online)",
      },
      borderRadius: {
        bubble: "18px",
        tight: "4px",
        card: "12px",
        btn: "8px",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      boxShadow: {
        modal: "0 8px 32px rgba(0,0,0,.18)",
        menu: "0 4px 16px rgba(0,0,0,.16)",
      },
      transitionDuration: {
        fast: "120ms",
        base: "200ms",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(.98)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "dot-bounce": {
          "0%, 60%, 100%": { transform: "translateY(0)", opacity: "0.45" },
          "30%": { transform: "translateY(-4px)", opacity: "1" },
        },
        "slide-in-left": {
          from: { opacity: "0", transform: "translateX(-12px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 160ms ease-out",
        "scale-in": "scale-in 150ms ease-out",
        "slide-in-left": "slide-in-left 200ms ease-out",
        "dot-bounce": "dot-bounce 1.2s infinite",
      },
    },
  },
  plugins: [],
};

export default config;
