import { create } from "zustand";
import { useProject } from "@/stores/projectStore";
import { useMaestro } from "@/stores/maestroStore";

type TransitionAction = () => void | Promise<void>;

interface ProjectTransitionState {
  open: boolean;
  running: boolean;
  action: TransitionAction | null;
  request: (action: TransitionAction) => Promise<void>;
  saveAndContinue: () => Promise<void>;
  discardAndContinue: () => Promise<void>;
  cancel: () => void;
}

async function finishTransition(action: TransitionAction, save: boolean): Promise<void> {
  const project = useProject.getState();
  const activeJobs = useMaestro.getState().jobs.filter(
    (job) => job.projectId === project.project.id && !["completed", "failed", "cancelled"].includes(job.status),
  );
  for (const job of activeJobs) await useMaestro.getState().cancel(job);
  if (["writing", "rendering"].includes(useProject.getState().generation.status)) {
    await useProject.getState().cancel().catch(() => undefined);
  }
  if (save) await project.save();
  else useProject.setState({ dirty: false });
  await action();
}

export const useProjectTransition = create<ProjectTransitionState>((set, get) => ({
  open: false,
  running: false,
  action: null,

  request: async (action) => {
    if (!useProject.getState().dirty) {
      await finishTransition(action, false);
      return;
    }
    set({ open: true, action });
  },

  saveAndContinue: async () => {
    const action = get().action;
    if (!action || get().running) return;
    set({ running: true });
    try { await finishTransition(action, true); set({ open: false, action: null }); }
    finally { set({ running: false }); }
  },

  discardAndContinue: async () => {
    const action = get().action;
    if (!action || get().running) return;
    set({ running: true });
    try { await finishTransition(action, false); set({ open: false, action: null }); }
    finally { set({ running: false }); }
  },

  cancel: () => set({ open: false, action: null }),
}));
