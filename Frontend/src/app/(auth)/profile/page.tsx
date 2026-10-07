"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { AVATAR_BACKGROUNDS } from "@/lib/palette";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";

/** Onboarding step 4: display name + avatar colour (Signal's profile screen). */
export default function ProfileSetupPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const toast = useUiStore((state) => state.toast);
  const [name, setName] = useState("");
  const [color, setColor] = useState(AVATAR_BACKGROUNDS[0]);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) router.replace("/welcome");
    else if (name === "") setName(user.display_name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const finish = async () => {
    if (!name.trim()) {
      toast("Add a display name", { tone: "error" });
      return;
    }
    setLoading(true);
    try {
      const updated = await api.saveProfile({ display_name: name.trim(), avatar_color: color });
      setUser(updated);
      toast("Profile saved", { tone: "success" });
      router.replace("/chats");
    } catch (error) {
      toast((error as Error).message, { tone: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-dvh flex-col bg-app px-6 py-10">
      <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center gap-6">
        <h1 className="text-center text-[26px] font-semibold leading-8 text-ink">
          Set up your profile
        </h1>

        <div className="flex flex-col items-center gap-3">
          <button
            onClick={() => fileRef.current?.click()}
            className="relative rounded-full"
            aria-label="Upload a profile photo"
          >
            <Avatar name={name || "?"} id={user?.id} src={user?.avatar_url} color={color} size={120} />
            <span className="absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full border-2 border-app bg-brand text-white">
              📷
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              try {
                const updated = await api.uploadAvatar(file);
                setUser(updated);
                toast("Photo updated", { tone: "success" });
              } catch (error) {
                toast((error as Error).message, { tone: "error" });
              }
            }}
          />

          <div className="flex flex-wrap justify-center gap-2">
            {AVATAR_BACKGROUNDS.map((option) => (
              <button
                key={option}
                onClick={() => setColor(option)}
                aria-label={`Choose colour ${option}`}
                className={`h-7 w-7 rounded-full transition-transform ${
                  color === option ? "scale-110 ring-2 ring-brand ring-offset-2 ring-offset-app" : ""
                }`}
                style={{ background: option }}
              />
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="display-name" className="block text-[13px] font-medium text-ink-secondary">
            Display name
          </label>
          <TextField
            id="display-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Your name"
            className="h-12 text-[16px]"
            onKeyDown={(event) => {
              if (event.key === "Enter") void finish();
            }}
          />
          <p className="text-[12px] text-ink-tertiary">
            This is the name people see in chats and group member lists.
          </p>
        </div>

        <Button size="lg" loading={loading} onClick={finish}>
          Finish
        </Button>
      </div>
    </main>
  );
}
