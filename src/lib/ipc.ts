import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { MediaKind, VisionAnalysis } from "@/core/h3/types";

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
  updatedAt: number;
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

  addHistory: (id: string, projectId: string, mode: string, content: string) =>
    invoke<void>("add_history", { id, projectId, mode, content }),
  listHistory: (projectId: string) => invoke<HistoryEntry[]>("list_history", { projectId }),
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
