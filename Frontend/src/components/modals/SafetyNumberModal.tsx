"use client";

import { ShieldCheck } from "lucide-react";
import { useMemo } from "react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { COPY } from "@/lib/constants";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";

/**
 * Safety-number screen.
 *
 * Real Signal derives this from both parties' identity keys (X3DH). Here the
 * digits are a deterministic hash of the two user ids - enough to show the
 * *flow*, and clearly labelled as simulated. Being explicit about what is
 * mocked is part of the assignment's rules.
 */
export function SafetyNumberModal({
  open,
  onClose,
  conversation,
}: {
  open: boolean;
  onClose: () => void;
  conversation?: { id: number; title: string };
}) {
  const me = useAuthStore((state) => state.user);
  const toast = useUiStore((state) => state.toast);

  const blocks = useMemo(() => {
    const seed = `${me?.id ?? 0}:${conversation?.id ?? 0}:signal-clone`;
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) {
      hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
    }
    return Array.from({ length: 3 }, (_, block) =>
      Array.from({ length: 5 }, (_, position) => {
        const value = (hash >>> ((block * 5 + position) % 24)) % 100000;
        return String(value).padStart(5, "0");
      }),
    );
  }, [me?.id, conversation?.id]);

  const combined = blocks.flat().join(" ");

  return (
    <Modal open={open} title="Safety number" onClose={onClose}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={async () => {
              await navigator.clipboard.writeText(combined);
              toast("Safety number copied", { tone: "success" });
            }}
          >
            Copy
          </Button>
          <Button onClick={onClose}>Done</Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-ink-secondary">
          <ShieldCheck className="h-5 w-5 text-brand" />
          <p className="text-[14px] font-medium text-ink">
            Verify {conversation?.title ?? "this conversation"}
          </p>
        </div>

        <div className="space-y-2 rounded-card bg-field p-4 font-mono text-[15px] leading-6 text-ink">
          {blocks.map((block, index) => (
            <p key={index}>{block.join(" ")}</p>
          ))}
        </div>

        <p className="text-[12px] leading-5 text-ink-tertiary">{COPY.safetyNumberNote}</p>
      </div>
    </Modal>
  );
}
