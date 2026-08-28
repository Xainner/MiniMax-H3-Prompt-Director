export interface MaestroInstance {
  id: string;
  name: string;
  baseUrl: string;
}

export interface MaestroModel {
  model_type: string;
  name: string;
  architecture: string;
  fps: number;
  is_downloaded: boolean;
}

export interface MaestroResolution {
  label: string;
  value: string;
}

export interface MaestroModelCapabilities {
  modelType: string;
  omniReference: boolean;
  fps: number;
  framesMinimum: number;
  framesMaximum: number;
  framesStep: number;
  overlapDefault: number;
  overlapMinimum: number;
  overlapMaximum: number;
  overlapStep: number;
  resolutions: MaestroResolution[];
  defaults: Record<string, unknown>;
  turbo?: MaestroTurboOption | null;
}

export interface MaestroTurboPreset {
  id: string;
  label: string;
  status?: string;
  filename: string;
  steps: number;
  weight: number;
  weight_min?: number;
  weight_max?: number;
  description?: string;
  revision?: string;
}

export interface MaestroTurboOption {
  filename?: string;
  label?: string;
  experimental?: boolean;
  preset_id?: string;
  version_label?: string;
  steps?: number;
  weight?: number;
  presets?: MaestroTurboPreset[];
  guide?: string;
}

export type MaestroImageIntent = "identity" | "scene" | "style" | "composition";
export type MaestroAudioIntent = "voice" | "drive" | "style";

export interface MaestroReference {
  id: string;
  type: "image" | "video" | "audio";
  path: string;
  filename: string;
  role: string;
  image_intent?: MaestroImageIntent;
  audio_intent?: MaestroAudioIntent;
  include_audio?: boolean;
  has_audio?: boolean;
  audio_path?: string;
  duration_seconds?: number;
}

export interface MaestroLora {
  filename: string;
  trained_words: string[];
  recommended_weights?: unknown;
  has_guide: boolean;
  guide?: string;
}

export interface MaestroLoraSelection {
  filename: string;
  weight: number;
  trigger: string | null;
  omitTrigger: boolean;
}

export interface MaestroWindowGeometry {
  index: number;
  startFrame: number;
  endFrame: number;
  startSeconds: number;
  endSeconds: number;
  frames: number;
}

export interface MaestroRunDraft {
  instanceId: string;
  modelType: string;
  resolution: string;
  continuity: boolean;
  overlapFrames?: number;
  windowFrames?: number;
  turboEnabled?: boolean;
  turboPresetId?: string;
  turboWeight?: number;
  referenceIntents: Record<string, MaestroImageIntent | MaestroAudioIntent>;
  loras: MaestroLoraSelection[];
  reviewedWindows: string[];
}

export type MaestroJobStatus = "held" | "queued" | "running" | "completed" | "failed" | "cancelled";

export interface MaestroJob {
  jobId: string;
  instanceId: string;
  projectId: string;
  seed: number;
  status: MaestroJobStatus;
  progress: number;
  step: number;
  totalSteps: number;
  phase: string;
  message: string;
  outputFiles: string[];
  error?: string | null;
}

export interface MaestroUpload {
  filename: string;
  path: string;
  url: string;
  fps?: number;
  frameCount?: number;
  durationSeconds?: number;
  hasAudio?: boolean;
}

export interface MaestroTestResult {
  ok: boolean;
  latencyMs: number;
  message: string;
}

export interface TriggerPlacement {
  filename: string;
  trigger: string | null;
  windowIndexes: number[];
  omitted: boolean;
  reason?: string;
}
