"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useUiStore } from "@/stores/ui";

type ConfirmPayload = {
  title: string;
  body: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
};

/** Generic "are you sure?" dialog - used for deletes, leaving groups, removal. */
export function ConfirmModal({
  open,
  onClose,
  payload,
}: {
  open: boolean;
  onClose: () => void;
  payload?: unknown;
}) {
  const toast = useUiStore((state) => state.toast);
  const [working, setWorking] = useState(false);
  const config = payload as ConfirmPayload | undefined;

  if (!config) return null;

  const run = async () => {
    setWorking(true);
    try {
      await config.onConfirm();
      onClose();
    } catch (error) {
      toast((error as Error).message || "Something went wrong", { tone: "error" });
    } finally {
      setWorking(false);
    }
  };

  return (
    <Modal
      open={open}
      title={config.title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={config.destructive ? "destructive" : "primary"}
            loading={working}
            onClick={run}
          >
            {config.confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-[14px] leading-6 text-ink-secondary">{config.body}</p>
    </Modal>
  );
}
