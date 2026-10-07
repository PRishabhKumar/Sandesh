"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Logo } from "@/components/ui/Logo";
import { useAuthStore } from "@/stores/auth";

/**
 * Entry route: send people either to their chats or to onboarding.
 * (All of the real routing lives in the (auth) and (app) route groups.)
 */
export default function IndexPage() {
  const router = useRouter();
  const ready = useAuthStore((state) => state.ready);
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    if (!ready) return;
    router.replace(user ? "/chats" : "/welcome");
  }, [ready, user, router]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-app">
      <Logo size={72} />
      <p className="text-[13px] text-ink-tertiary">Loading your chats…</p>
    </main>
  );
}
