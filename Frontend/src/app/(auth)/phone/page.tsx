"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { TextField } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { useOnboardingStore } from "@/stores/onboarding";
import { useUiStore } from "@/stores/ui";

export default function PhonePage() {
  const router = useRouter();
  const identifier = useOnboardingStore((state) => state.identifier);
  const setIdentifier = useOnboardingStore((state) => state.setIdentifier);
  const toast = useUiStore((state) => state.toast);
  const [value, setValue] = useState(identifier);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const clean = value.trim();
    if (clean.length < 3) {
      toast("Enter a phone number or username", { tone: "error" });
      return;
    }
    setLoading(true);
    try {
      const result = await api.requestOtp(clean);
      setIdentifier(result.identifier);
      toast(`Demo code: ${result.dev_code}`, { tone: "success" });
      router.push("/verify");
    } catch (error) {
      toast((error as Error).message, { tone: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-dvh flex-col bg-app px-6 py-6">
      <div className="flex items-center gap-2">
        <IconButton label="Back" onClick={() => router.push("/welcome")}>
          <ArrowLeft className="h-5 w-5" />
        </IconButton>
      </div>

      <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center gap-6">
        <div className="space-y-2">
          <h1 className="text-[26px] font-semibold leading-8 text-ink">Your phone number</h1>
          <p className="text-[14px] leading-5 text-ink-secondary">
            Signal uses your phone number to reach you. In this demo nothing is sent — any number
            works and the code is always <strong>123456</strong>.
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="identifier" className="block text-[13px] font-medium text-ink-secondary">
            Phone number or username
          </label>
          <TextField
            id="identifier"
            autoFocus
            value={value}
            inputMode="text"
            placeholder="+91 90000 00001  or  aarav"
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void submit();
            }}
            className="h-12 text-[16px]"
          />
          <p className="text-[12px] leading-4 text-ink-tertiary">
            Seeded demo accounts: <code className="rounded bg-field px-1">+91 90000 00001</code>{" "}
            (Aarav) and <code className="rounded bg-field px-1">+91 90000 00002</code> (Meera).
          </p>
        </div>

        <Button size="lg" loading={loading} onClick={submit}>
          Next
        </Button>
      </div>
    </main>
  );
}
