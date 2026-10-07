"use client";

import { Check } from "lucide-react";
import { useEffect, useState } from "react";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { TextField } from "@/components/ui/Field";
import { api } from "@/lib/api";
import type { Contact, ConversationDetail } from "@/lib/types";
import { useUiStore } from "@/stores/ui";

/** Add people to an existing group (admin, or any member when allowed). */
export function AddMembersModal({
  open,
  onClose,
  conversation,
}: {
  open: boolean;
  onClose: () => void;
  conversation?: { id: number };
}) {
  const toast = useUiStore((state) => state.toast);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [existing, setExisting] = useState<number[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !conversation) return;
    void api.contacts().then(setContacts).catch(() => setContacts([]));
    void api
      .conversation(conversation.id)
      .then((detail: ConversationDetail) => setExisting(detail.members.map((m) => m.user.id)))
      .catch(() => setExisting([]));
    setSelected([]);
  }, [open, conversation]);

  const candidates = contacts.filter(
    (contact) =>
      !existing.includes(contact.user.id) &&
      (contact.nickname || contact.user.display_name).toLowerCase().includes(query.toLowerCase()),
  );

  const submit = async () => {
    if (!conversation || selected.length === 0) return;
    setSaving(true);
    try {
      await api.addGroupMembers(conversation.id, selected);
      toast(`${selected.length} member${selected.length > 1 ? "s" : ""} added`, { tone: "success" });
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
      title="Add members"
      onClose={onClose}
      footer={
        <Button loading={saving} disabled={selected.length === 0} onClick={submit}>
          Add {selected.length > 0 ? selected.length : ""}
        </Button>
      }
    >
      <div className="space-y-3">
        <TextField
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search contacts"
          className="h-10"
        />
        <div className="scroll-thin max-h-[300px] overflow-y-auto">
          {candidates.map((contact) => {
            const isSelected = selected.includes(contact.user.id);
            return (
              <button
                key={contact.id}
                onClick={() =>
                  setSelected((current) =>
                    current.includes(contact.user.id)
                      ? current.filter((id) => id !== contact.user.id)
                      : [...current, contact.user.id],
                  )
                }
                className="flex w-full items-center gap-3 rounded-btn px-1 py-2 text-left hover:bg-hover"
              >
                <Avatar
                  name={contact.user.display_name}
                  id={contact.user.id}
                  src={contact.user.avatar_url}
                  color={contact.user.avatar_color}
                  size={40}
                />
                <span className="min-w-0 flex-1 truncate text-[15px] text-ink">
                  {contact.nickname || contact.user.display_name}
                </span>
                {isSelected && <Check className="h-4 w-4 text-brand" />}
              </button>
            );
          })}
          {candidates.length === 0 && (
            <p className="px-1 py-3 text-[13px] text-ink-secondary">
              Everybody in your contacts is already in this group.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
