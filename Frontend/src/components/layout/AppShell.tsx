"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { Sidebar } from "@/components/sidebar/Sidebar";
import { EmptyChatPane } from "@/components/chat/EmptyChatPane";
import { useAuthStore } from "@/stores/auth";
import { useConversationsStore } from "@/stores/conversations";

/**
 * The two-pane Signal layout.
 *
 *   desktop (>= 768px):   [ list 380px ][ chat pane flex ]
 *   mobile  (< 768px):    one pane at a time, driven by the route
 *
 * On mobile the chat pane is a full-screen route (/chats/:id) and the sidebar
 * is the index route - which is why "back" is just a router.push.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const ready = useAuthStore((state) => state.ready);
  const user = useAuthStore((state) => state.user);
  const activeId = useConversationsStore((state) => state.activeId);

  const isChatRoute = pathname?.startsWith("/chats/") && pathname !== "/chats";

  // Route guard: no session -> onboarding.
  useEffect(() => {
    if (ready && !user) router.replace("/welcome");
  }, [ready, user, router]);

  if (!ready) {
    return (
      <div className="flex h-dvh items-center justify-center bg-app">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-brand" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-app">
      <aside
        className={`w-full shrink-0 flex-col border-line bg-panel md:flex md:w-[380px] md:border-r
          ${isChatRoute ? "hidden md:flex" : "flex"}`}
        aria-label="Chat list"
      >
        <Sidebar />
      </aside>

      <main className={`min-w-0 flex-1 flex-col md:flex ${isChatRoute ? "flex" : "hidden md:flex"}`}>
        {children ?? (activeId ? null : <EmptyChatPane />)}
      </main>
    </div>
  );
}
