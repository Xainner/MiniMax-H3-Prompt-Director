import type { Project } from "@/core/h3/types";
import type { MaestroModelCapabilities, MaestroReference, MaestroRunDraft } from "./types";
import { computeMaestroGeometry } from "./geometry";

export interface MaestroPayloadInput {
  project: Project;
  draft: MaestroRunDraft;
  capabilities: MaestroModelCapabilities;
  windows: string[];
  references: MaestroReference[];
  firstPath?: string;
  lastPath?: string;
}

export function buildMaestroPayload(input: MaestroPayloadInput): Record<string, unknown> {
  const { project, draft, capabilities, references } = input;
  const windows = input.windows.map((window) => window.replace(/\s*\n+\s*/g, " ").trim()).filter(Boolean);
  const geometry = computeMaestroGeometry(
    project.brief.durationSec,
    capabilities,
    draft.windowFrames,
    draft.overlapFrames,
    draft.continuity,
  );
  if (windows.length !== geometry.windows.length) {
    throw new Error(`Maestro necesita ${geometry.windows.length} prompts de ventana; hay ${windows.length}.`);
  }
  const turboPresets = capabilities.turbo?.presets?.length
    ? capabilities.turbo.presets
    : capabilities.turbo?.filename
      ? [{
          id: capabilities.turbo.preset_id ?? "default",
          label: capabilities.turbo.label ?? capabilities.turbo.version_label ?? "Turbo",
          filename: capabilities.turbo.filename,
          steps: capabilities.turbo.steps ?? Number(capabilities.defaults.num_inference_steps ?? 20),
          weight: capabilities.turbo.weight ?? 1,
        }]
      : [];
  const managedTurboFiles = new Set(turboPresets.map((preset) => preset.filename));
  const selectedTurbo = draft.turboEnabled
    ? turboPresets.find((preset) => preset.id === draft.turboPresetId)
      ?? turboPresets.find((preset) => preset.id === capabilities.turbo?.preset_id)
      ?? turboPresets[0]
    : undefined;
  const activeLoras = draft.loras.filter((lora) => !managedTurboFiles.has(lora.filename));
  if (selectedTurbo) {
    activeLoras.push({
      filename: selectedTurbo.filename,
      weight: draft.turboWeight ?? selectedTurbo.weight,
      trigger: null,
      omitTrigger: true,
    });
  }
  const multipliers = activeLoras.map((lora) => String(lora.weight)).join(" ");
  const common: Record<string, unknown> = {
    prompt: windows.join("\n"),
    model_type: draft.modelType,
    resolution: draft.resolution,
    video_length: geometry.totalFrames,
    sliding_window_size: geometry.windowFrames,
    sliding_window_overlap: geometry.overlapFrames,
    activated_loras: activeLoras.map((lora) => lora.filename),
    loras_multipliers: multipliers,
    h3_window_prompts: windows,
    generation_mode: "video",
    image_mode: 0,
    negative_prompt: "",
    seed: -1,
    repeat_generation: 1,
    num_inference_steps: selectedTurbo?.steps ?? Number(capabilities.defaults.num_inference_steps ?? 20),
    guidance_scale: Number(capabilities.defaults.guidance_scale ?? 1),
    sliding_window_memory_override: true,
    minimax_h3_turbo_mode: Boolean(selectedTurbo),
    ...(selectedTurbo ? { minimax_h3_turbo_preset: selectedTurbo.id } : {}),
  };
  if (capabilities.omniReference) {
    return {
      ...common,
      minimax_h3_references: references,
      minimax_h3_reference_sequence: true,
      minimax_h3_sequence_prompt_mode: "manual",
      minimax_h3_sequence_continuity: draft.continuity,
      minimax_h3_sequence_clip_frames: geometry.windowFrames,
      minimax_h3_sequence_memory_override: true,
    };
  }
  return {
    ...common,
    image_start: input.firstPath,
    image_end: input.lastPath,
    minimax_h3_multi_window: geometry.windows.length > 1,
    minimax_h3_window_storyboard: false,
    multi_prompts_gen_type: geometry.windows.length > 1 ? 2 : 0,
  };
}
