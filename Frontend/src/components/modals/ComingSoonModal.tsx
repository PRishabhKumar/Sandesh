"use client";

import { ComingSoon } from "@/components/ui/ComingSoon";
import { Modal } from "@/components/ui/Modal";

/**
 * Shared "Coming soon" dialog for the mocked features required by the
 * assignment: voice/video calls, Stories, linked devices, real E2EE.
 */
export function ComingSoonModal({
  open,
  onClose,
  payload,
}: {
  open: boolean;
  onClose: () => void;
  payload?: unknown;
}) {
  const feature = (payload as { feature?: string } | undefined)?.feature ?? "This feature";
  return (
    <Modal open={open} title="Coming soon" onClose={onClose}>
      <ComingSoon feature={feature} />
    </Modal>
  );
}
