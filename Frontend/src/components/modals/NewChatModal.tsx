"use client";

import { Search, UserPlus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { TextField } from "@/components/ui/Field";
import { api } from "@/lib/api";
import type { Contact, User } from "@/lib/types";
import { useConversationsStore } from "@/stores/conversations";
import { useUiStore } from "@/stores/ui";

/**
 * "New chat": my contacts, a phone/username lookup, and shortcuts to the
 * new-group and add-contact screens.
 */
export function NewChatModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useUiStore((state) => state.toast);
  const openModal = useUiStore((state) => state.openModal);
  const [query, setQuery] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [matches, setMatches] = useState<User[]>([]);
  const [starting, setStarting] = useState(false);

  // contacts, filtered server-side as the user types (debounced)
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(async () => {
      try {
        const rows = await api.contacts(query || undefined);
        setContacts(rows);
      } catch {
        setContacts([]);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [open, query]);

  // "find by phone number or username": only when the query looks like one
  useEffect(() => {
    if (!open) return;
    const clean = query.trim();
    if (clean.length < 3) {
      setMatches([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const result = await api.lookupUsers(clean);
        const list = result.exact_match ? [result.exact_match, ...result.users] : result.users;
        setMatches(list);
      } catch {
        setMatches([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [open, query]);

  const startChat = async (userId: number) => {
    setStarting(true);
    try {
      const conversation = await api.openDirect(userId);
      useConversationsStore.getState().upsert(conversation);
      onClose();
      router.push(`/chats/${conversation.id}`);
    } catch (error) {
      toast((error as Error).message, { tone: "error" });
    } finally {
      setStarting(false);
    }
  };

  const contactIds = new Set(contacts.map((contact) => contact.user.id));
  const extraMatches = matches.filter((user) => !contactIds.has(user.id));

  return (
    <Modal open={open} title="New chat" onClose={onClose}>
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
          <TextField
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search or enter a phone number / username"
            className="h-10 pl-9"
          />
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => openModal("new-group")}>
            <Users className="h-4 w-4" /> New group
          </Button>
          <Button variant="secondary" size="sm" onClick={() => openModal("add-contact")}>
            <UserPlus className="h-4 w-4" /> Add contact
          </Button>
        </div>

        <div className="scroll-thin max-h-[320px] overflow-y-auto">
          {extraMatches.length > 0 && (
            <section className="mb-2">
              <h3 className="px-1 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-secondary">
                People
              </h3>
              {extraMatches.map((user) => (
                <PersonRow
                  key={`match-${user.id}`}
                  name={user.display_name}
                  subtitle={user.phone_number ?? (user.username ? `@${user.username}` : "")}
                  user={user}
                  disabled={starting}
                  onClick={() => startChat(user.id)}
                />
              ))}
            </section>
          )}

          <section>
            <h3 className="px-1 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-secondary">
              Contacts
            </h3>
            {contacts.length === 0 ? (
              <p className="px-1 py-3 text-[13px] text-ink-secondary">
                No contacts yet — add one with a phone number or username.
              </p>
            ) : (
              contacts.map((contact) => (
                <PersonRow
                  key={contact.id}
                  name={contact.nickname || contact.user.display_name}
                  subtitle={contact.user.username ? `@${contact.user.username}` : contact.user.phone_number ?? ""}
                  user={contact.user}
                  disabled={starting}
                  onClick={() => startChat(contact.user.id)}
                />
              ))
            )}
          </section>
        </div>
      </div>
    </Modal>
  );
}

function PersonRow({
  name,
  subtitle,
  user,
  onClick,
  disabled,
}: {
  name: string;
  subtitle: string;
  user: User;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3 rounded-btn px-1 py-2 text-left hover:bg-hover disabled:opacity-60"
    >
      <Avatar name={name} id={user.id} src={user.avatar_url} color={user.avatar_color} size={40} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] text-ink">{name}</span>
        <span className="block truncate text-[12px] text-ink-secondary">{subtitle}</span>
      </span>
    </button>
  );
}
