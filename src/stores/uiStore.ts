import { create } from "zustand";

export type SettingsTab = "vision" | "writer" | "maestro" | "cache";

interface UiState {
  settingsOpen: boolean;
  settingsTab: SettingsTab;
  paletteOpen: boolean;
  projectsOpen: boolean;
  consoleOpen: boolean;
  selectedReferenceId: string | null;
  lightboxReferenceId: string | null;
  briefTab: "brief" | "subjects" | "timeline";
  outputTab: "prompt" | "windows" | "maestro";

  set: <K extends keyof UiState>(key: K, value: UiState[K]) => void;
  /** Opens Ajustes on the tab that actually needs attention. */
  openSettings: (tab?: SettingsTab) => void;
  toggle: (key: "settingsOpen" | "paletteOpen" | "projectsOpen" | "consoleOpen") => void;
  closeOverlays: () => void;
}

export const useUi = create<UiState>((set) => ({
  settingsOpen: false,
  settingsTab: "vision",
  paletteOpen: false,
  projectsOpen: false,
  consoleOpen: false,
  selectedReferenceId: null,
  lightboxReferenceId: null,
  briefTab: "brief",
  outputTab: "prompt",

  set: (key, value) => set({ [key]: value } as Pick<UiState, typeof key>),
  openSettings: (tab) => set(tab ? { settingsOpen: true, settingsTab: tab } : { settingsOpen: true }),
  toggle: (key) => set((state) => ({ [key]: !state[key] }) as Pick<UiState, typeof key>),
  closeOverlays: () =>
    set({ settingsOpen: false, paletteOpen: false, projectsOpen: false, lightboxReferenceId: null }),
}));
