"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { useAuthStore } from "@/stores/auth";

export default function WelcomePage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const ready = useAuthStore((state) => state.ready);

  // already signed in? skip onboarding
  useEffect(() => {
    if (ready && user) router.replace("/chats");
  }, [ready, user, router]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-between bg-app px-6 py-16">
      <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
        <Logo size={128} />

        <div className="space-y-3">
          <h1 className="max-w-[420px] text-[28px] font-bold leading-9 text-ink">
            Take privacy with you. Be yourself in every message.
          </h1>
          <p className="max-w-[380px] text-[15px] leading-6 text-ink-secondary">
            A Signal-style messaging experience: real-time chats, groups, delivery receipts and no
            tracking. Sign in with a phone number or a username.
          </p>
        </div>

        <Button size="lg" className="w-full max-w-[320px]" onClick={() => router.push("/phone")}>
          Get started
        </Button>

        <p className="max-w-[320px] text-[12px] leading-4 text-ink-tertiary">
          Demo build for an SDE Fullstack assignment. Verification codes are mocked and messages are
          not really end-to-end encrypted.
        </p>
      </div>

      <p className="text-[12px] text-ink-tertiary">
        Already have an account?{" "}
        <button onClick={() => router.push("/phone")} className="font-medium text-brand hover:underline">
          Sign in
        </button>
      </p>
    </main>
  );
}
