import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { MediaKind, VisionAnalysis } from "@/core/h3/types";
import type {
  MaestroInstance,
  MaestroJob,
  MaestroLora,
  MaestroModel,
  MaestroModelCapabilities,
  MaestroTestResult,
  MaestroUpload,
} from "@/core/maestro/types";
import type { ProjectAsset, ProjectExportOptions, ProjectExportReport, ProjectImportPreview, ProjectImportStrategy } from "@/core/projects/types";

/** Mirrors `settings::Profile`. The API key is never part of this shape. */
export interface Profile {
  id: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  timeoutSecs: number;
  extraHeaders: [string, string][];
}

export type ProfileView = Profile & { hasKey: boolean };

export interface SettingsView {
  vision: ProfileView;
  writer: ProfileView;
}

export interface TestResult {
  ok: boolean;
  latencyMs: number;
  message: string;
}

export interface MediaInfo {
  hash: string;
  path: string;
  fileName: string;
  kind: MediaKind;
  sizeBytes: number;
  width?: number;
  height?: number;
  thumbnail?: string;
}

export type VisionResult = VisionAnalysis & { cached: boolean };

export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  schemaVersion: number;
  referenceCount: number;
  totalSize: number;
}

export interface HistoryEntry {
  id: string;
  mode: string;
  content: string;
  createdAt: number;
}

export const ipc = {
  getSettings: () => invoke<SettingsView>("get_settings"),
  saveProfile: (profile: Profile) => invoke<SettingsView>("save_profile", { profile }),
  setApiKey: (profileId: string, key: string) =>
    invoke<SettingsView>("set_api_key", { profileId, key }),
  clearApiKey: (profileId: string) => invoke<SettingsView>("clear_api_key", { profileId }),
  copyApiKey: (from: string, to: string) => invoke<SettingsView>("copy_api_key", { from, to }),
  testProfile: (profile: Profile, key?: string) =>
    invoke<TestResult>("test_profile", { profile, key: key ?? null }),

  inspectMedia: (path: string) => invoke<MediaInfo>("inspect_media", { path }),
  mediaPreview: (path: string, maxPx = 1600) =>
    invoke<string>("media_preview", { path, maxPx }),
  exportText: (path: string, contents: string) =>
    invoke<void>("export_text", { path, contents }),

  analyzeReference: (args: { path: string; hash: string; hint?: string; force?: boolean }) =>
    invoke<VisionResult>("analyze_reference", {
      path: args.path,
      hash: args.hash,
      hint: args.hint ?? null,
      force: args.force ?? false,
    }),
  clearVisionCache: () => invoke<number>("clear_vision_cache"),

  generatePrompt: (args: {
    requestId: string;
    system: string;
    user: string;
    temperature?: number;
  }) =>
    invoke<string>("generate_prompt", {
      requestId: args.requestId,
      system: args.system,
      user: args.user,
      temperature: args.temperature ?? null,
    }),
  cancelRequest: (requestId: string) => invoke<void>("cancel_request", { requestId }),

  listProjects: () => invoke<ProjectSummary[]>("list_projects"),
  loadProject: (id: string) => invoke<string | null>("load_project", { id }),
  saveProject: (id: string, name: string, data: string) =>
    invoke<void>("save_project", { id, name, data }),
  deleteProject: (id: string) => invoke<void>("delete_project", { id }),
  ingestProjectAsset: (projectId: string, path: string, category: "reference" | "output") =>
    invoke<ProjectAsset>("ingest_project_asset", { projectId, path, category }),
  projectAssetAvailable: (path: string, sizeBytes: number) =>
    invoke<boolean>("project_asset_available", { path, sizeBytes }),
  previewProjectPackage: (path: string) =>
    invoke<ProjectImportPreview>("preview_project_package", { path }),
  exportProjectPackage: (options: ProjectExportOptions) =>
    invoke<ProjectExportReport>("export_project_package", { options }),
  importProjectPackage: (path: string, strategy: ProjectImportStrategy) =>
    invoke<string>("import_project_package", { path, strategy }),

  addHistory: (id: string, projectId: string, mode: string, content: string) =>
    invoke<void>("add_history", { id, projectId, mode, content }),
  listHistory: (projectId: string) => invoke<HistoryEntry[]>("list_history", { projectId }),
  copyProjectHistory: (fromProjectId: string, toProjectId: string) =>
    invoke<void>("copy_project_history", { fromProjectId, toProjectId }),

  listMaestroInstances: () => invoke<MaestroInstance[]>("list_maestro_instances"),
  saveMaestroInstance: (instance: MaestroInstance) =>
    invoke<MaestroInstance[]>("save_maestro_instance", { instance }),
  deleteMaestroInstance: (id: string) =>
    invoke<MaestroInstance[]>("delete_maestro_instance", { id }),
  testMaestroInstance: (instance: MaestroInstance) =>
    invoke<MaestroTestResult>("test_maestro_instance", { instance }),
  maestroModels: (instanceId: string) =>
    invoke<MaestroModel[]>("maestro_models", { instanceId }),
  maestroModelCapabilities: (instanceId: string, modelType: string) =>
    invoke<MaestroModelCapabilities>("maestro_model_capabilities", { instanceId, modelType }),
  maestroLoras: (instanceId: string, modelType: string) =>
    invoke<MaestroLora[]>("maestro_loras", { instanceId, modelType }),
  maestroUpload: (instanceId: string, path: string) =>
    invoke<MaestroUpload>("maestro_upload", { instanceId, path }),
  maestroGenerate: (instanceId: string, projectId: string, payload: Record<string, unknown>) =>
    invoke<MaestroJob>("maestro_generate", { instanceId, projectId, payload }),
  maestroJobStatus: (instanceId: string, projectId: string, jobId: string) =>
    invoke<MaestroJob>("maestro_job_status", { instanceId, projectId, jobId }),
  maestroCancelJob: (instanceId: string, jobId: string) =>
    invoke<void>("maestro_cancel_job", { instanceId, jobId }),
  listMaestroJobs: () => invoke<MaestroJob[]>("list_maestro_jobs"),
  maestroDownloadOutput: (instanceId: string, filename: string, destination?: string) =>
    invoke<string>("maestro_download_output", {
      instanceId,
      filename,
      destination: destination ?? null,
    }),
};

export interface StreamChunk {
  requestId: string;
  delta: string;
}

export function onLlmChunk(handler: (chunk: StreamChunk) => void): Promise<UnlistenFn> {
  return listen<StreamChunk>("llm:chunk", (event) => handler(event.payload));
}

/** Backend errors arrive as plain Spanish strings; anything else is a bug. */
export function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "Ocurrió un error inesperado.";
}
