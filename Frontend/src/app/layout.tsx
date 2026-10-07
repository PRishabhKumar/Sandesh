import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import { Providers } from "@/components/Providers";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Signal Clone — Secure Messaging Platform",
  description:
    "A Signal-style secure messaging platform: real-time 1:1 and group chat, delivery receipts, typing indicators and presence. Built as an SDE Fullstack assignment.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1b1b1b" },
  ],
};

/**
 * The tiny inline script reads the saved theme *before* React hydrates, so the
 * first paint is already in the right theme (no white flash when the app
 * should be dark).
 */
const themeBootstrap = `
(function () {
  try {
    var stored = localStorage.getItem('signal_clone_theme') || 'system';
    var resolved = stored === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : stored;
    document.documentElement.dataset.theme = resolved;
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="h-full bg-app text-ink antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
