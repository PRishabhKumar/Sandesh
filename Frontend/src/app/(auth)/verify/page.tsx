"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { useOnboardingStore } from "@/stores/onboarding";
import { useUiStore } from "@/stores/ui";

const LENGTH = 6;

/**
 * Six-box OTP entry: typing auto-advances, backspace goes back, and pasting
 * "123456" fills every box at once.
 */
export default function VerifyPage() {
  const router = useRouter();
  const identifier = useOnboardingStore((state) => state.identifier);
  const acceptSession = useAuthStore((state) => state.acceptSession);
  const toast = useUiStore((state) => state.toast);
  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(""));
  const [loading, setLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(30);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (!identifier) router.replace("/phone");
  }, [identifier, router]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const code = digits.join("");

  const submit = async (value = code) => {
    if (value.length !== LENGTH) {
      toast("Enter all 6 digits", { tone: "error" });
      return;
    }
    setLoading(true);
    try {
      const result = await api.verifyOtp(identifier, value);
      acceptSession(result);
      if (result.needs_profile) {
        router.replace("/profile");
      } else {
        toast(`Welcome back, ${result.user.display_name}`, { tone: "success" });
        router.replace("/chats");
      }
    } catch (error) {
      toast((error as Error).message, { tone: "error" });
      setDigits(Array(LENGTH).fill(""));
      inputsRef.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const setDigit = (index: number, value: string) => {
    const clean = value.replace(/\D/g, "");
    if (!clean) return;
    const next = [...digits];
    // typing a single character advances; pasting fills the remaining boxes
    clean.split("").forEach((character, offset) => {
      if (index + offset < LENGTH) next[index + offset] = character;
    });
    setDigits(next);
    const focusIndex = Math.min(index + clean.length, LENGTH - 1);
    inputsRef.current[focusIndex]?.focus();
    if (next.every((digit) => digit)) void submit(next.join(""));
  };

  return (
    <main className="flex min-h-dvh flex-col bg-app px-6 py-6">
      <div className="flex items-center gap-2">
        <IconButton label="Back" onClick={() => router.push("/phone")}>
          <ArrowLeft className="h-5 w-5" />
        </IconButton>
      </div>

      <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center gap-6">
        <div className="space-y-2">
          <h1 className="text-[26px] font-semibold leading-8 text-ink">Verify your number</h1>
          <p className="text-[14px] leading-5 text-ink-secondary">
            We sent a 6-digit code to <strong>{identifier}</strong>. For this demo the code is{" "}
            <strong>123456</strong>.
          </p>
        </div>

        <div className="flex justify-between gap-2" role="group" aria-label="Verification code">
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(element) => {
                inputsRef.current[index] = element;
              }}
              value={digit}
              autoFocus={index === 0}
              inputMode="numeric"
              maxLength={LENGTH}
              aria-label={`Digit ${index + 1}`}
              onChange={(event) => setDigit(index, event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Backspace") {
                  event.preventDefault();
                  const next = [...digits];
                  if (next[index]) {
                    next[index] = "";
                  } else if (index > 0) {
                    next[index - 1] = "";
                    inputsRef.current[index - 1]?.focus();
                  }
                  setDigits(next);
                }
                if (event.key === "Enter") void submit();
              }}
              className="h-14 w-full rounded-btn border border-line bg-field text-center text-[20px] font-semibold text-ink
                outline-none transition-shadow focus:border-brand focus:ring-2 focus:ring-brand-soft/60"
            />
          ))}
        </div>

        <Button size="lg" loading={loading} onClick={() => submit()} disabled={code.length !== LENGTH}>
          Verify
        </Button>

        <div className="flex items-center justify-between text-[13px]">
          <span className="text-ink-tertiary">
            {secondsLeft > 0 ? `Resend code in ${secondsLeft}s` : "Didn't get a code?"}
          </span>
          <button
            disabled={secondsLeft > 0}
            onClick={async () => {
              await api.requestOtp(identifier);
              setSecondsLeft(30);
              toast("Code resent (demo code: 123456)", { tone: "success" });
            }}
            className="font-medium text-brand disabled:opacity-40"
          >
            Resend
          </button>
        </div>
      </div>
    </main>
  );
}
