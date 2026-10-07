import { EmptyChatPane } from "@/components/chat/EmptyChatPane";

/**
 * /chats - the list is in the shell's left pane, so this route renders the
 * resting state of the chat pane ("Select a conversation…").
 * On mobile this route *is* the chat list.
 */
export default function ChatsPage() {
  return <EmptyChatPane />;
}
