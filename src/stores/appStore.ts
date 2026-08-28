import { create } from "zustand";
import type { H3Mode } from "@/core/h3/types";

/** Top-level views. The workspace is the editor; home is the launcher. The
 * creation wizard is a modal that overlays the launcher while a mode is
 * pending confirmation. */
export type ViewId = "home" | "workspace";

interface AppState {
  view: ViewId;
  /** Mode picked in the launcher; non-null means the wizard modal is open. */
  pendingMode: H3Mode | null;
  setView: (view: ViewId) => void;
  startWizard: (mode: H3Mode) => void;
  clearWizard: () => void;
  finishWizard: () => void;
}

export const useApp = create<AppState>((set) => ({
  view: "home",
  pendingMode: null,
  setView: (view) => set({ view }),
  startWizard: (mode) => set({ pendingMode: mode }),
  clearWizard: () => set({ pendingMode: null }),
  finishWizard: () => set({ pendingMode: null, view: "workspace" }),
}));
