import { create } from "zustand";
import type { MaestroInstance, MaestroTestResult } from "@/core/maestro/types";
import { errorMessage, ipc, type Profile, type SettingsView, type TestResult } from "@/lib/ipc";

interface SettingsState {
  settings: SettingsView | null;
  loading: boolean;
  error: string | null;
  testing: Record<string, boolean>;
  lastTest: Record<string, TestResult | undefined>;
  maestroInstances: MaestroInstance[];
  maestroTesting: Record<string, boolean>;
  maestroTests: Record<string, MaestroTestResult | undefined>;

  load: () => Promise<void>;
  saveProfile: (profile: Profile) => Promise<void>;
  setApiKey: (profileId: string, key: string) => Promise<void>;
  clearApiKey: (profileId: string) => Promise<void>;
  copyApiKey: (from: string, to: string) => Promise<void>;
  test: (profile: Profile, key?: string) => Promise<TestResult>;
  saveMaestroInstance: (instance: MaestroInstance) => Promise<void>;
  deleteMaestroInstance: (id: string) => Promise<void>;
  testMaestroInstance: (instance: MaestroInstance) => Promise<MaestroTestResult>;
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: null,
  loading: false,
  error: null,
  testing: {},
  lastTest: {},
  maestroInstances: [],
  maestroTesting: {},
  maestroTests: {},

  load: async () => {
    set({ loading: true, error: null });
    try {
      const [settings, maestroInstances] = await Promise.all([
        ipc.getSettings(),
        ipc.listMaestroInstances(),
      ]);
      set({ settings, maestroInstances, loading: false });
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

  saveMaestroInstance: async (instance) => {
    set({ maestroInstances: await ipc.saveMaestroInstance(instance) });
  },

  deleteMaestroInstance: async (id) => {
    set({ maestroInstances: await ipc.deleteMaestroInstance(id) });
  },

  testMaestroInstance: async (instance) => {
    set({ maestroTesting: { ...get().maestroTesting, [instance.id]: true } });
    try {
      const result = await ipc.testMaestroInstance(instance);
      set({
        maestroTests: { ...get().maestroTests, [instance.id]: result },
        maestroTesting: { ...get().maestroTesting, [instance.id]: false },
      });
      return result;
    } catch (error) {
      const result: MaestroTestResult = { ok: false, latencyMs: 0, message: errorMessage(error) };
      set({
        maestroTests: { ...get().maestroTests, [instance.id]: result },
        maestroTesting: { ...get().maestroTesting, [instance.id]: false },
      });
      return result;
    }
  },
}));

/** True when a profile has enough configuration to be called. */
export function isProfileUsable(profile: Profile | undefined): boolean {
  return Boolean(profile && profile.baseUrl.trim() && profile.model.trim());
}
