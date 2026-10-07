import { ChatPane } from "@/components/chat/ChatPane";

/** /chats/:id - one open conversation (a full-screen route on mobile). */
export default function ConversationPage({ params }: { params: { id: string } }) {
  const conversationId = Number(params.id);
  if (!Number.isFinite(conversationId)) {
    return <p className="p-6 text-sm text-ink-secondary">That conversation does not exist.</p>;
  }
  return <ChatPane conversationId={conversationId} />;
}
