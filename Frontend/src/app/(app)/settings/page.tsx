"use client";

import {
  Bell,
  ChevronLeft,
  Info,
  MessageSquare,
  Monitor,
  Phone,
  ShieldCheck,
  Smartphone,
  User as UserIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { ComingSoon } from "@/components/ui/ComingSoon";
import { ProfileSection } from "@/components/settings/ProfileSection";
import {
  AppearanceSection,
  NotificationsSection,
  PrivacySection,
} from "@/components/settings/PreferenceSections";
import { COPY, VERSION_LABEL } from "@/lib/constants";
import { useAuthStore } from "@/stores/auth";

type SectionId =
  | "profile"
  | "general"
  | "appearance"
  | "chats"
  | "calls"
  | "notifications"
  | "privacy"
  | "linked"
  | "help";

const SECTIONS: Array<{ id: SectionId; label: string; icon: ReactNode }> = [
  { id: "profile", label: "Profile", icon: <UserIcon className="h-4 w-4" /> },
  { id: "general", label: "General", icon: <Monitor className="h-4 w-4" /> },
  { id: "appearance", label: "Appearance", icon: <Monitor className="h-4 w-4" /> },
  { id: "chats", label: "Chats", icon: <MessageSquare className="h-4 w-4" /> },
  { id: "calls", label: "Calls", icon: <Phone className="h-4 w-4" /> },
  { id: "notifications", label: "Notifications", icon: <Bell className="h-4 w-4" /> },
  { id: "privacy", label: "Privacy", icon: <ShieldCheck className="h-4 w-4" /> },
  { id: "linked", label: "Linked devices", icon: <Smartphone className="h-4 w-4" /> },
  { id: "help", label: "Help & about", icon: <Info className="h-4 w-4" /> },
];

/** Settings → sections (two columns on desktop, stacked on mobile). */
export default function SettingsPage() {
  const router = useRouter();
  const [section, setSection] = useState<SectionId>("profile");
  const user = useAuthStore((state) => state.user);

  const content: Record<SectionId, ReactNode> = {
    profile: <ProfileSection />,
    appearance: <AppearanceSection />,
    privacy: <PrivacySection />,
    notifications: <NotificationsSection />,
    general: <ComingSoon feature="Language and startup options" />,
    chats: <ComingSoon feature="Chat backups and link previews" />,
    calls: <ComingSoon feature="Voice and video calls" />,
    linked: <ComingSoon feature="Linked devices" note="Multi-device sync needs real key management - out of scope for this demo." />,
    help: (
      <div className="space-y-3 text-[14px] leading-6 text-ink-secondary">
        <p className="text-[15px] font-medium text-ink">{VERSION_LABEL}</p>
        <p>
          An open-source Signal-style messaging platform built for an SDE Fullstack assignment:
          Next.js + TypeScript on the front end, FastAPI + SQLAlchemy + SQLite on the back end, with
          real-time delivery over WebSockets.
        </p>
        <p>{COPY.encryption}</p>
        <p>Signed in as {user?.display_name}</p>
        <Button variant="outline" onClick={() => router.push("/chats")}>
          Back to chats
        </Button>
      </div>
    ),
  };

  return (
    <div className="flex h-full min-h-0 flex-1 bg-app">
      <nav className="w-full shrink-0 border-r border-line bg-panel p-3 md:w-[280px]" aria-label="Settings sections">
        <div className="mb-3 flex items-center gap-2">
          <IconButton label="Back to chats" onClick={() => router.push("/chats")}>
            <ChevronLeft className="h-5 w-5" />
          </IconButton>
          <h1 className="text-[17px] font-semibold text-ink">Settings</h1>
        </div>
        <ul className="space-y-0.5">
          {SECTIONS.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => setSection(item.id)}
                aria-current={section === item.id}
                className={`flex w-full items-center gap-3 rounded-btn px-3 py-2 text-left text-[14px] transition-colors
                  ${section === item.id ? "bg-selected text-brand" : "text-ink hover:bg-hover"}`}
              >
                <span className={section === item.id ? "text-brand" : "text-ink-secondary"}>
                  {item.icon}
                </span>
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <section className="scroll-thin hidden min-w-0 flex-1 overflow-y-auto p-8 md:block">
        <h2 className="mb-4 text-[19px] font-semibold text-ink">
          {SECTIONS.find((item) => item.id === section)?.label}
        </h2>
        {content[section]}
      </section>

      {/* mobile: the sections render as a single scrolling column */}
      <section className="scroll-thin min-w-0 flex-1 overflow-y-auto p-5 md:hidden">
        <h2 className="mb-4 text-[17px] font-semibold text-ink">
          {SECTIONS.find((item) => item.id === section)?.label}
        </h2>
        {content[section]}
      </section>
    </div>
  );
}
