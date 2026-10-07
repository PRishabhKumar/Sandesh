"use client";

import { LogOut, MessageSquarePlus, Moon, Settings, Sun, User as UserIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Avatar } from "@/components/ui/Avatar";
import { IconButton } from "@/components/ui/IconButton";
import { Menu } from "@/components/ui/Menu";
import { ConversationRow } from "@/components/sidebar/ConversationRow";
import { COPY, FILTERS } from "@/lib/constants";
import { useAuthStore } from "@/stores/auth";
import { useShallow } from "zustand/react/shallow";

import { useConversationsStore } from "@/stores/conversations";
import { useUiStore } from "@/stores/ui";

export function Sidebar() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const items = useConversationsStore((state) => state.items);
  const loading = useConversationsStore((state) => state.loading);
  const loaded = useConversationsStore((state) => state.loaded);
  const load = useConversationsStore((state) => state.load);
  const query = useConversationsStore((state) => state.query);
  const setQuery = useConversationsStore((state) => state.setQuery);
  const filter = useConversationsStore((state) => state.filter);
  const setFilter = useConversationsStore((state) => state.setFilter);
  const connection = useUiStore((state) => state.connection);
  const openModal = useUiStore((state) => state.openModal);
  const resolvedTheme = useUiStore((state) => state.resolvedTheme);
  const setTheme = useUiStore((state) => state.setTheme);
  const updateSettings = useAuthStore((state) => state.updateSettings);

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  // useShallow: `visible()` builds a new array, so compare it by value
  const visible = useConversationsStore(useShallow((state) => state.visible()));
  const unreadTotal = items.reduce((total, row) => total + row.unread_count, 0);

  return (
    <div className="flex h-full flex-col">
      {/* --- header: own avatar (menu), title, compose ------------------- */}
      <header className="flex h-16 shrink-0 items-center gap-2 px-4">
        <Menu
          align="left"
          trigger={
            <button
              aria-label="Your profile and settings"
              className="rounded-full transition-opacity hover:opacity-85"
            >
              <Avatar
                name={user?.display_name ?? "?"}
                id={user?.id}
                src={user?.avatar_url}
                color={user?.avatar_color}
                size={36}
              />
            </button>
          }
          items={[
            {
              label: user?.display_name ?? "Profile",
              icon: <UserIcon className="h-4 w-4" />,
              onSelect: () => router.push("/settings"),
            },
            {
              label: "Settings",
              icon: <Settings className="h-4 w-4" />,
              onSelect: () => router.push("/settings"),
            },
            {
              label: resolvedTheme === "dark" ? "Light theme" : "Dark theme",
              icon: resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />,
              onSelect: () => {
                const next = resolvedTheme === "dark" ? "light" : "dark";
                setTheme(next);
                void updateSettings({ theme: next });
              },
            },
            {
              label: "Log out",
              icon: <LogOut className="h-4 w-4" />,
              danger: true,
              separatorBefore: true,
              onSelect: async () => {
                await logout();
                router.replace("/welcome");
              },
            },
          ]}
        />

        <h1 className="flex-1 text-center text-[19px] font-semibold text-ink">
          Chats
          {unreadTotal > 0 && (
            <span className="ml-2 align-middle text-[13px] font-normal text-ink-tertiary">
              {unreadTotal} unread
            </span>
          )}
        </h1>

        <IconButton label="New chat (Ctrl+N)" onClick={() => openModal("new-chat")}>
          <MessageSquarePlus className="h-5 w-5" />
        </IconButton>
      </header>

      {/* --- search ------------------------------------------------------ */}
      <div className="px-3 pb-2">
        <div className="relative">
          <input
            id="conversation-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            aria-label="Search chats and contacts"
            className="h-9 w-full rounded-full border border-transparent bg-field px-4 text-sm text-ink placeholder:text-ink-tertiary
              outline-none transition-colors focus:border-brand focus:bg-app"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-tertiary hover:text-ink"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* --- filters ----------------------------------------------------- */}
      <div className="flex gap-2 px-3 pb-2">
        {FILTERS.map((option) => (
          <button
            key={option.id}
            onClick={() => setFilter(option.id)}
            aria-pressed={filter === option.id}
            className={`rounded-full px-3 py-1 text-[13px] font-medium transition-colors duration-fast
              ${filter === option.id ? "bg-selected text-brand" : "text-ink-secondary hover:bg-hover"}`}
          >
            {option.label}
          </button>
        ))}
        <span className="flex-1" />
        {connection === "closed" && (
          <span className="self-center text-[12px] text-danger" title="Reconnecting to the server">
            ● offline
          </span>
        )}
      </div>

      {/* --- list -------------------------------------------------------- */}
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {loading && !loaded ? (
          <ListSkeleton />
        ) : visible.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13px] leading-5 text-ink-secondary">
            {query || filter !== "all" ? "No chats match this filter." : COPY.emptyList}
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {visible.map((conversation) => (
              <ConversationRow key={conversation.id} conversation={conversation} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <ul className="flex flex-col gap-1 px-2 pt-1">
      {Array.from({ length: 6 }).map((_, index) => (
        <li key={index} className="flex items-center gap-3 rounded-btn px-2 py-3">
          <span className="h-12 w-12 animate-pulse rounded-full bg-hover" />
          <span className="flex-1 space-y-2">
            <span className="block h-3 w-1/2 animate-pulse rounded bg-hover" />
            <span className="block h-3 w-3/4 animate-pulse rounded bg-hover" />
          </span>
        </li>
      ))}
    </ul>
  );
}
