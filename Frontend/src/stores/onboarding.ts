"use client";

/**
 * Tiny store for the onboarding wizard.
 *
 * It only carries the identifier between steps (phone -> verify -> profile), so
 * a page refresh at step 3 does not lose it.
 */

import { create } from "zustand";

type OnboardingState = {
  identifier: string;
  setIdentifier: (identifier: string) => void;
  reset: () => void;
};

export const useOnboardingStore = create<OnboardingState>((set) => ({
  identifier: "",
  setIdentifier: (identifier) => set({ identifier }),
  reset: () => set({ identifier: "" }),
}));
