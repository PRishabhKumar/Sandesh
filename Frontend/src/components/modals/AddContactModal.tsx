"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { TextField } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { useUiStore } from "@/stores/ui";

/** Add somebody to the address book by phone number or username. */
export function AddContactModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useUiStore((state) => state.toast);
  const [identifier, setIdentifier] = useState("");
  const [nickname, setNickname] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (identifier.trim().length < 3) {
      toast("Enter a phone number or username", { tone: "error" });
      return;
    }
    setSaving(true);
    try {
      const contact = await api.addContact(identifier.trim(), nickname.trim() || undefined);
      toast(`${contact.user.display_name} added to your contacts`, { tone: "success" });
      setIdentifier("");
      setNickname("");
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
      title="Add contact"
      onClose={onClose}
      footer={
        <Button loading={saving} onClick={submit}>
          Add contact
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <label htmlFor="contact-id" className="block text-[13px] font-medium text-ink-secondary">
            Phone number or username
          </label>
          <TextField
            id="contact-id"
            autoFocus
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder="+91 90000 00003"
            className="h-10"
            onKeyDown={(event) => event.key === "Enter" && submit()}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="contact-nickname" className="block text-[13px] font-medium text-ink-secondary">
            Nickname (optional)
          </label>
          <TextField
            id="contact-nickname"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            placeholder="How you want to see this person"
            className="h-10"
          />
        </div>

        <p className="text-[12px] leading-4 text-ink-tertiary">
          Seeded numbers run from <code className="rounded bg-field px-1">+91 90000 00003</code> to{" "}
          <code className="rounded bg-field px-1">+91 90000 00008</code>.
        </p>
      </div>
    </Modal>
  );
}
