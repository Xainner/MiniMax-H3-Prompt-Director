import { create } from "zustand";
import { buildMaestroPayload } from "@/core/maestro/payload";
import { buildMaestroReferences, omniReferenceErrors } from "@/core/maestro/references";
import { validateTriggerPlacements } from "@/core/maestro/triggers";
import type {
  MaestroJob,
  MaestroLora,
  MaestroModel,
  MaestroModelCapabilities,
  MaestroRunDraft,
  MaestroUpload,
} from "@/core/maestro/types";
import type { Project } from "@/core/h3/types";
import { errorMessage, ipc } from "@/lib/ipc";

interface MaestroState {
  models: MaestroModel[];
  capabilities: MaestroModelCapabilities | null;
  loras: MaestroLora[];
  jobs: MaestroJob[];
  previewPaths: Record<string, string>;
  loadingCatalog: boolean;
  submitting: boolean;
  error: string | null;

  loadInstance: (instanceId: string) => Promise<MaestroModel[]>;
  loadModel: (instanceId: string, modelType: string) => Promise<void>;
  resumeJobs: () => Promise<void>;
  submit: (project: Project, draft: MaestroRunDraft, windows: string[]) => Promise<MaestroJob>;
  cancel: (job: MaestroJob) => Promise<void>;
  preview: (job: MaestroJob, filename: string) => Promise<string>;
  download: (job: MaestroJob, filename: string, destination: string) => Promise<string>;
}

const terminal = new Set(["completed", "failed", "cancelled"]);
const polling = new Set<string>();

export const useMaestro = create<MaestroState>((set, get) => ({
  models: [],
  capabilities: null,
  loras: [],
  jobs: [],
  previewPaths: {},
  loadingCatalog: false,
  submitting: false,
  error: null,

  loadInstance: async (instanceId) => {
    set({ loadingCatalog: true, error: null, models: [], capabilities: null, loras: [] });
    try {
      const models = await ipc.maestroModels(instanceId);
      set({ models, loadingCatalog: false });
      return models;
    } catch (error) {
      set({ error: errorMessage(error), loadingCatalog: false });
      throw error;
    }
  },

  loadModel: async (instanceId, modelType) => {
    set({ loadingCatalog: true, error: null });
    try {
      const [capabilities, loras] = await Promise.all([
        ipc.maestroModelCapabilities(instanceId, modelType),
        ipc.maestroLoras(instanceId, modelType),
      ]);
      set({ capabilities, loras, loadingCatalog: false });
    } catch (error) {
      set({ error: errorMessage(error), loadingCatalog: false });
      throw error;
    }
  },

  resumeJobs: async () => {
    const jobs = await ipc.listMaestroJobs();
    set({ jobs });
    for (const job of jobs) if (!terminal.has(job.status)) void poll(job, set, get);
  },

  submit: async (project, draft, windows) => {
    const { capabilities, loras } = get();
    if (!capabilities || capabilities.modelType !== draft.modelType) {
      throw new Error("Las capacidades del modelo Maestro no están cargadas.");
    }
    const triggerErrors = validateTriggerPlacements(windows, loras, draft.loras);
    if (triggerErrors.length > 0) throw new Error(triggerErrors.join(" "));
    set({ submitting: true, error: null });
    try {
      const uploads = new Map<string, MaestroUpload>();
      const required = capabilities.omniReference
        ? project.references.filter((reference) => ["image", "video", "audio"].includes(reference.kind))
        : project.references.filter((reference) => reference.role === "first-frame" || reference.role === "last-frame");
      for (const reference of required) {
        uploads.set(reference.id, await ipc.maestroUpload(draft.instanceId, reference.path));
      }
      const references = buildMaestroReferences(project, draft, uploads);
      if (capabilities.omniReference) {
        const errors = omniReferenceErrors(references);
        if (errors.length > 0) throw new Error(errors.join(" "));
      }
      const first = project.references.find((reference) => reference.role === "first-frame");
      const last = project.references.find((reference) => reference.role === "last-frame");
      if (!capabilities.omniReference && !first && !last) {
        throw new Error("First/Last necesita al menos una referencia first-frame o last-frame.");
      }
      const payload = buildMaestroPayload({
        project,
        draft,
        capabilities,
        windows,
        references,
        firstPath: first ? uploads.get(first.id)?.path : undefined,
        lastPath: last ? uploads.get(last.id)?.path : undefined,
      });
      const job = await ipc.maestroGenerate(draft.instanceId, project.id, payload);
      set((state) => ({ jobs: [job, ...state.jobs.filter((item) => item.jobId !== job.jobId)], submitting: false }));
      void poll(job, set, get);
      return job;
    } catch (error) {
      set({ submitting: false, error: errorMessage(error) });
      throw error;
    }
  },

  cancel: async (job) => {
    await ipc.maestroCancelJob(job.instanceId, job.jobId);
    const updated = { ...job, status: "cancelled" as const, message: "Cancelado" };
    set((state) => ({ jobs: state.jobs.map((item) => item.jobId === job.jobId ? updated : item) }));
  },

  preview: async (job, filename) => {
    const key = `${job.instanceId}:${filename}`;
    if (get().previewPaths[key]) return get().previewPaths[key]!;
    const path = await ipc.maestroDownloadOutput(job.instanceId, filename);
    set((state) => ({ previewPaths: { ...state.previewPaths, [key]: path } }));
    return path;
  },

  download: (job, filename, destination) =>
    ipc.maestroDownloadOutput(job.instanceId, filename, destination),
}));

async function poll(
  initial: MaestroJob,
  set: (partial: Partial<MaestroState> | ((state: MaestroState) => Partial<MaestroState>)) => void,
  get: () => MaestroState,
) {
  if (polling.has(initial.jobId)) return;
  polling.add(initial.jobId);
  let current = initial;
  try {
    while (!terminal.has(current.status)) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      try {
        current = await ipc.maestroJobStatus(current.instanceId, current.projectId, current.jobId);
        set((state) => ({ jobs: state.jobs.map((job) => job.jobId === current.jobId ? current : job) }));
      } catch (error) {
        const message = `Seguimiento pausado: ${errorMessage(error)}`;
        set((state) => ({ jobs: state.jobs.map((job) => job.jobId === current.jobId ? { ...job, message } : job) }));
        // The job remains bound to its original instance. Retry slowly so a
        // restarted Maestro or a brief network outage reconnects by itself.
        await new Promise((resolve) => setTimeout(resolve, 8000));
      }
    }
  } finally {
    polling.delete(initial.jobId);
    void get;
  }
}
