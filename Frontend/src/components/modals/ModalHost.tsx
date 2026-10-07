"use client";

import { AddContactModal } from "@/components/modals/AddContactModal";
import { AddMembersModal } from "@/components/modals/AddMembersModal";
import { ComingSoonModal } from "@/components/modals/ComingSoonModal";
import { ConfirmModal } from "@/components/modals/ConfirmModal";
import { DisappearingModal } from "@/components/modals/DisappearingModal";
import { NewChatModal } from "@/components/modals/NewChatModal";
import { NewGroupModal } from "@/components/modals/NewGroupModal";
import { SafetyNumberModal } from "@/components/modals/SafetyNumberModal";
import { ShortcutsModal } from "@/components/modals/ShortcutsModal";
import { useUiStore } from "@/stores/ui";

/**
 * Renders whichever modal is currently active.
 *
 * One host component means any part of the app can open a modal with
 * `useUiStore.getState().openModal("new-chat")` - no prop drilling, no context
 * pyramid, and only one modal can be open at a time (which is also Signal's
 * behaviour).
 */
export function ModalHost() {
  const modal = useUiStore((state) => state.modal);
  const close = useUiStore((state) => state.closeModal);

  switch (modal.name) {
    case "new-chat":
      return <NewChatModal open onClose={close} />;
    case "new-group":
      return <NewGroupModal open onClose={close} />;
    case "add-contact":
      return <AddContactModal open onClose={close} />;
    case "add-members":
      return (
        <AddMembersModal
          open
          onClose={close}
          conversation={(modal.payload as { conversation: { id: number } })?.conversation}
        />
      );
    case "disappearing":
      return (
        <DisappearingModal
          open
          onClose={close}
          conversation={(modal.payload as { conversation: { id: number; title: string; disappearing_secs: number } })
            ?.conversation}
        />
      );
    case "confirm":
      return <ConfirmModal open onClose={close} payload={modal.payload} />;
    case "coming-soon":
      return <ComingSoonModal open onClose={close} payload={modal.payload} />;
    case "safety-number":
      return (
        <SafetyNumberModal
          open
          onClose={close}
          conversation={(modal.payload as { conversation: { id: number; title: string } })?.conversation}
        />
      );
    case "shortcuts":
      return <ShortcutsModal open onClose={close} />;
    default:
      return null;
  }
}
