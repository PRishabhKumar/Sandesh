"use client";

import { useRef, useState } from "react";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { TextArea, TextField } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { AVATAR_BACKGROUNDS } from "@/lib/palette";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";

/** Settings → Profile: display name, about line, photo/colour. */
export function ProfileSection() {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const toast = useUiStore((state) => state.toast);
  const [name, setName] = useState(user?.display_name ?? "");
  const [about, setAbout] = useState(user?.about ?? "");
  const [color, setColor] = useState(user?.avatar_color ?? AVATAR_BACKGROUNDS[0]);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await api.updateProfile({
        display_name: name.trim(),
        about: about.trim() || null,
        avatar_color: color,
      });
      setUser(updated);
      toast("Profile saved", { tone: "success" });
    } catch (error) {
      toast((error as Error).message, { tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => fileRef.current?.click()} className="relative rounded-full" aria-label="Change photo">
          <Avatar name={name || "?"} id={user?.id} src={user?.avatar_url} color={color} size={80} />
          <span className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-app bg-brand text-[12px] text-white">
            📷
          </span>
        </button>
        <div>
          <p className="text-[15px] font-medium text-ink">{name || "Your name"}</p>
          <p className="text-[13px] text-ink-secondary">{user?.phone_number ?? `@${user?.username ?? ""}`}</p>
          <button
            onClick={() => fileRef.current?.click()}
            className="mt-1 text-[13px] font-medium text-brand hover:underline"
          >
            Upload photo
          </button>
        </div>
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
      </div>

      <div className="space-y-2">
        <label htmlFor="settings-name" className="block text-[13px] font-medium text-ink-secondary">
          Display name
        </label>
        <TextField id="settings-name" value={name} onChange={(event) => setName(event.target.value)} />
      </div>

      <div className="space-y-2">
        <label htmlFor="settings-about" className="block text-[13px] font-medium text-ink-secondary">
          About
        </label>
        <TextArea
          id="settings-about"
          rows={2}
          value={about}
          onChange={(event) => setAbout(event.target.value)}
          placeholder="Speak Freely"
        />
      </div>

      <div className="space-y-2">
        <span className="block text-[13px] font-medium text-ink-secondary">Avatar colour</span>
        <div className="flex flex-wrap gap-2">
          {AVATAR_BACKGROUNDS.map((option) => (
            <button
              key={option}
              onClick={() => setColor(option)}
              aria-label={`Choose colour ${option}`}
              className={`h-7 w-7 rounded-full ${color === option ? "ring-2 ring-brand ring-offset-2 ring-offset-app" : ""}`}
              style={{ background: option }}
            />
          ))}
        </div>
      </div>

      <Button loading={saving} onClick={save}>
        Save profile
      </Button>
    </div>
  );
}
