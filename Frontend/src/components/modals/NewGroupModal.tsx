"use client";

import { Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { TextArea, TextField } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { DISAPPEARING_OPTIONS } from "@/lib/constants";
import type { Contact } from "@/lib/types";
import { useConversationsStore } from "@/stores/conversations";
import { useUiStore } from "@/stores/ui";

/**
 * "New group" in two steps, like Signal:
 *   1. pick members (chips + search)
 *   2. name it, add a description and pick a disappearing timer
 */
export function NewGroupModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useUiStore((state) => state.toast);
  const [step, setStep] = useState<1 | 2>(1);
  const [query, setQuery] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Contact[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [timer, setTimer] = useState(0);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep(1);
      setSelected([]);
      setName("");
      setDescription("");
      setTimer(0);
      setQuery("");
      return;
    }
    void api.contacts().then(setContacts).catch(() => setContacts([]));
  }, [open]);

  const filtered = contacts.filter((contact) =>
    (contact.nickname || contact.user.display_name).toLowerCase().includes(query.toLowerCase()),
  );

  const toggle = (contact: Contact) =>
    setSelected((current) =>
      current.some((item) => item.id === contact.id)
        ? current.filter((item) => item.id !== contact.id)
        : [...current, contact],
    );

  const create = async () => {
    if (!name.trim()) {
      toast("Give the group a name", { tone: "error" });
      return;
    }
    setCreating(true);
    try {
      const group = await api.createGroup({
        name: name.trim(),
        description: description.trim() || null,
        member_ids: selected.map((contact) => contact.user.id),
        disappearing_secs: timer,
      });
      useConversationsStore.getState().upsert(group);
      toast(`Group "${group.title}" created`, { tone: "success" });
      onClose();
      router.push(`/chats/${group.id}`);
    } catch (error) {
      toast((error as Error).message, { tone: "error" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal
      open={open}
      title={step === 1 ? "Add group members" : "New group"}
      onClose={onClose}
      footer={
        step === 1 ? (
          <Button onClick={() => setStep(2)} disabled={selected.length === 0}>
            Next
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button loading={creating} onClick={create}>
              Create
            </Button>
          </>
        )
      }
    >
      {step === 1 ? (
        <div className="space-y-3">
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selected.map((contact) => (
                <span
                  key={contact.id}
                  className="flex items-center gap-1.5 rounded-full bg-selected py-1 pl-1 pr-2 text-[13px] text-ink"
                >
                  <Avatar
                    name={contact.user.display_name}
                    id={contact.user.id}
                    src={contact.user.avatar_url}
                    color={contact.user.avatar_color}
                    size={24}
                  />
                  {contact.user.display_name}
                  <button onClick={() => toggle(contact)} aria-label={`Remove ${contact.user.display_name}`}>
                    <X className="h-3.5 w-3.5 text-ink-secondary" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <TextField
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search contacts"
            className="h-10"
          />

          <div className="scroll-thin max-h-[280px] overflow-y-auto">
            {filtered.map((contact) => {
              const isSelected = selected.some((item) => item.id === contact.id);
              return (
                <button
                  key={contact.id}
                  onClick={() => toggle(contact)}
                  className="flex w-full items-center gap-3 rounded-btn px-1 py-2 text-left hover:bg-hover"
                >
                  <Avatar
                    name={contact.user.display_name}
                    id={contact.user.id}
                    src={contact.user.avatar_url}
                    color={contact.user.avatar_color}
                    size={40}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] text-ink">
                      {contact.nickname || contact.user.display_name}
                    </span>
                    <span className="block truncate text-[12px] text-ink-secondary">
                      {contact.user.about ?? ""}
                    </span>
                  </span>
                  {isSelected && <Check className="h-4 w-4 text-brand" />}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="px-1 py-3 text-[13px] text-ink-secondary">No contacts match that search.</p>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="block text-[13px] font-medium text-ink-secondary" htmlFor="group-name">
              Group name
            </label>
            <TextField
              id="group-name"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Weekend Trek"
              className="h-10"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-[13px] font-medium text-ink-secondary" htmlFor="group-desc">
              Description (optional)
            </label>
            <TextArea
              id="group-desc"
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What is this group about?"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-[13px] font-medium text-ink-secondary" htmlFor="group-timer">
              Disappearing messages
            </label>
            <select
              id="group-timer"
              value={timer}
              onChange={(event) => setTimer(Number(event.target.value))}
              className="h-10 w-full rounded-btn border border-line bg-field px-3 text-sm text-ink"
            >
              {DISAPPEARING_OPTIONS.map((option) => (
                <option key={option.seconds} value={option.seconds}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <p className="text-[12px] text-ink-tertiary">
            {selected.length} member{selected.length === 1 ? "" : "s"} · you will be the group admin
          </p>
        </div>
      )}
    </Modal>
  );
}
