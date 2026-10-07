"use client";

import { useEffect } from "react";

import { ModalHost } from "@/components/modals/ModalHost";
import { Toaster } from "@/components/ui/Toaster";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useSocketEvents } from "@/hooks/useSocketEvents";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";

/**
 * Client-side app bootstrap: hydrate the session, subscribe to socket events,
 * apply the saved theme and mount the global layers (toasts + modals).
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const hydrate = useAuthStore((state) => state.hydrate);
  const applyTheme = useUiStore((state) => state.applyTheme);

  useEffect(() => {
    void hydrate();
    applyTheme();
  }, [hydrate, applyTheme]);

  useSocketEvents();
  useKeyboardShortcuts();

  return (
    <>
      {children}
      <Toaster />
      <ModalHost />
    </>
  );
}
