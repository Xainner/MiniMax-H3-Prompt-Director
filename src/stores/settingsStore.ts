import { create } from "zustand";
import { errorMessage, ipc, type Profile, type SettingsView, type TestResult } from "@/lib/ipc";

interface SettingsState {
  settings: SettingsView | null;
  loading: boolean;
  error: string | null;
  testing: Record<string, boolean>;
  lastTest: Record<string, TestResult | undefined>;

  load: () => Promise<void>;
  saveProfile: (profile: Profile) => Promise<void>;
  setApiKey: (profileId: string, key: string) => Promise<void>;
  clearApiKey: (profileId: string) => Promise<void>;
  copyApiKey: (from: string, to: string) => Promise<void>;
  test: (profile: Profile, key?: string) => Promise<TestResult>;
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: null,
  loading: false,
  error: null,
  testing: {},
  lastTest: {},

  load: async () => {
    set({ loading: true, error: null });
    try {
      set({ settings: await ipc.getSettings(), loading: false });
    } catch (e) {
      set({ error: errorMessage(e), loading: false });
    }
  },

  saveProfile: async (profile) => {
    set({ settings: await ipc.saveProfile(profile) });
  },

  setApiKey: async (profileId, key) => {
    set({ settings: await ipc.setApiKey(profileId, key) });
  },

  clearApiKey: async (profileId) => {
    set({ settings: await ipc.clearApiKey(profileId) });
  },

  copyApiKey: async (from, to) => {
    set({ settings: await ipc.copyApiKey(from, to) });
  },

  test: async (profile, key) => {
    set({ testing: { ...get().testing, [profile.id]: true } });
    try {
      const result = await ipc.testProfile(profile, key);
      set({
        lastTest: { ...get().lastTest, [profile.id]: result },
        testing: { ...get().testing, [profile.id]: false },
      });
      return result;
    } catch (e) {
      const result: TestResult = { ok: false, latencyMs: 0, message: errorMessage(e) };
      set({
        lastTest: { ...get().lastTest, [profile.id]: result },
        testing: { ...get().testing, [profile.id]: false },
      });
      return result;
    }
  },
}));

/** True when a profile has enough configuration to be called. */
export function isProfileUsable(profile: Profile | undefined): boolean {
  return Boolean(profile && profile.baseUrl.trim() && profile.model.trim());
}
