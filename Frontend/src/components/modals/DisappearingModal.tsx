"use client";

import { Check } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { api } from "@/lib/api";
import { DISAPPEARING_OPTIONS } from "@/lib/constants";
import { useConversationsStore } from "@/stores/conversations";
import { useUiStore } from "@/stores/ui";

/**
 * The disappearing-message timer.
 *
 * This one is *functional*, not a placeholder: the server stamps
 * `expires_at` on new messages, the sweeper deletes them when the time comes,
 * and every open client drops the bubble on `message.expired`.
 */
export function DisappearingModal({
  open,
  onClose,
  conversation,
}: {
  open: boolean;
  onClose: () => void;
  conversation?: { id: number; title: string; disappearing_secs: number };
}) {
  const toast = useUiStore((state) => state.toast);
  const [value, setValue] = useState(conversation?.disappearing_secs ?? 0);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!conversation) return;
    setSaving(true);
    try {
      const updated = await api.setDisappearing(conversation.id, value);
      useConversationsStore.getState().upsert(updated);
      const label = DISAPPEARING_OPTIONS.find((option) => option.seconds === value)?.label ?? "Off";
      toast(label === "Off" ? "Disappearing messages turned off" : `Disappearing messages: ${label}`, {
        tone: "success",
      });
      onClose();
    } catch (error) {
      toast((error as Error).message, { tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Disappearing messages"
      onClose={onClose}
      footer={
        <Button loading={saving} onClick={save}>
          Save
        </Button>
      }
    >
      <p className="mb-3 text-[13px] leading-5 text-ink-secondary">
        New messages in this chat will be deleted for everyone after the selected time. The timer is
        enforced by the server, so it applies even if a device is offline.
      </p>

      <ul className="divide-y divide-line">
        {DISAPPEARING_OPTIONS.map((option) => (
          <li key={option.seconds}>
            <button
              onClick={() => setValue(option.seconds)}
              className="flex w-full items-center justify-between py-2.5 text-left text-[15px] text-ink hover:bg-hover"
            >
              {option.label}
              {value === option.seconds && <Check className="h-4 w-4 text-brand" />}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
