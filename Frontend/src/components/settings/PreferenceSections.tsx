"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";

import { Switch } from "@/components/ui/Field";
import { DISAPPEARING_OPTIONS } from "@/lib/constants";
import type { Theme } from "@/lib/types";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";

/** Shared row layout for the settings screens. */
function Row({
  title,
  description,
  control,
}: {
  title: string;
  description?: string;
  control: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-4">
      <div className="min-w-0">
        <p className="text-[15px] text-ink">{title}</p>
        {description && <p className="mt-0.5 text-[13px] leading-5 text-ink-secondary">{description}</p>}
      </div>
      <div className="shrink-0 pt-0.5">{control}</div>
    </div>
  );
}

/**
 * Settings → Appearance. The theme switch flips `data-theme` on <html> and is
 * persisted to the user's settings row, so it follows you to another browser.
 */
export function AppearanceSection() {
  const pref = useUiStore((state) => state.themePreference);
  const setTheme = useUiStore((state) => state.setTheme);
  const updateSettings = useAuthStore((state) => state.updateSettings);

  const choose = (theme: Theme) => {
    setTheme(theme);
    void updateSettings({ theme });
  };

  const options: Array<{ id: Theme; label: string; icon: ReactNode }> = [
    { id: "system", label: "System", icon: <Monitor className="h-4 w-4" /> },
    { id: "light", label: "Light", icon: <Sun className="h-4 w-4" /> },
    { id: "dark", label: "Dark", icon: <Moon className="h-4 w-4" /> },
  ];

  return (
    <div className="divide-y divide-line">
      <Row
        title="Theme"
        description="Choose how the app looks. System follows your device setting."
        control={
          <div className="flex gap-2">
            {options.map((option) => (
              <button
                key={option.id}
                onClick={() => choose(option.id)}
                aria-pressed={pref === option.id}
                className={`flex items-center gap-1.5 rounded-btn border px-3 py-1.5 text-[13px] transition-colors
                  ${pref === option.id ? "border-brand bg-selected text-brand" : "border-line text-ink-secondary hover:bg-hover"}`}
              >
                {option.icon}
                {option.label}
              </button>
            ))}
          </div>
        }
      />
    </div>
  );
}

/**
 * Settings → Privacy. Read receipts and typing indicators are *mutual* by
 * design: turn yours off and you stop seeing other people's too - the backend
 * enforces that, this screen just reflects it.
 */
export function PrivacySection() {
  const settings = useAuthStore((state) => state.settings);
  const updateSettings = useAuthStore((state) => state.updateSettings);

  if (!settings) return null;

  return (
    <div className="divide-y divide-line">
      <Row
        title="Read receipts"
        description="If turned off, you won't see read receipts from others and they won't see yours."
        control={
          <Switch
            label="Read receipts"
            checked={settings.read_receipts}
            onChange={(next) => void updateSettings({ read_receipts: next })}
          />
        }
      />
      <Row
        title="Typing indicators"
        description="Share when you're typing. Turn it off to stop sending and seeing them."
        control={
          <Switch
            label="Typing indicators"
            checked={settings.typing_indicators}
            onChange={(next) => void updateSettings({ typing_indicators: next })}
          />
        }
      />
      <Row
        title="Show last seen"
        description="When off, others see you as offline instead of a last-seen time."
        control={
          <Switch
            label="Show last seen"
            checked={settings.show_last_seen}
            onChange={(next) => void updateSettings({ show_last_seen: next })}
          />
        }
      />
      <Row
        title="Default disappearing messages"
        description="Applied to new chats you start."
        control={
          <select
            value={settings.default_disappearing_secs}
            onChange={(event) =>
              void updateSettings({ default_disappearing_secs: Number(event.target.value) })
            }
            className="h-9 rounded-btn border border-line bg-field px-2 text-[13px] text-ink"
            aria-label="Default disappearing messages"
          >
            {DISAPPEARING_OPTIONS.map((option) => (
              <option key={option.seconds} value={option.seconds}>
                {option.label}
              </option>
            ))}
          </select>
        }
      />
    </div>
  );
}

/** Settings → Notifications: what a notification is allowed to reveal. */
export function NotificationsSection() {
  const settings = useAuthStore((state) => state.settings);
  const updateSettings = useAuthStore((state) => state.updateSettings);

  if (!settings) return null;

  return (
    <div className="divide-y divide-line">
      <Row
        title="Notification content"
        description="Shown as a toast when a message arrives in a chat you are not looking at."
        control={
          <select
            value={settings.notification_content}
            onChange={(event) =>
              void updateSettings({
                notification_content: event.target.value as typeof settings.notification_content,
              })
            }
            className="h-9 rounded-btn border border-line bg-field px-2 text-[13px] text-ink"
            aria-label="Notification content"
          >
            <option value="name_and_message">Name and message</option>
            <option value="name_only">Name only</option>
            <option value="none">No name or message</option>
          </select>
        }
      />
      <Row
        title="Notification sounds"
        description="Placeholder in this demo - the toggle is stored but no sound is played."
        control={<Switch label="Notification sounds" checked={false} onChange={() => undefined} disabled />}
      />
    </div>
  );
}
