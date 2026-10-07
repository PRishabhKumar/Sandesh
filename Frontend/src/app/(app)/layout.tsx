import { AppShell } from "@/components/layout/AppShell";

/**
 * Everything under (app) is the signed-in experience: the two-pane shell with
 * the chat list on the left. Unauthenticated visitors are redirected to
 * /welcome by the guard inside AppShell.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
