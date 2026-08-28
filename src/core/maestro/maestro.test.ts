import { describe, expect, it } from "vitest";
import { computeMaestroGeometry } from "./geometry";
import { buildMaestroPayload } from "./payload";
import { buildMaestroReferences } from "./references";
import { applyLoraTriggers, validateTriggerPlacements } from "./triggers";
import { makeProject, makeReference } from "@/core/h3/testFixtures";
import type { MaestroModelCapabilities, MaestroRunDraft } from "./types";

const caps: MaestroModelCapabilities = {
  modelType: "minimax_h3_ref2va", omniReference: true, fps: 24,
  framesMinimum: 124, framesMaximum: 345, framesStep: 17,
  overlapDefault: 18, overlapMinimum: 1, overlapMaximum: 103, overlapStep: 17,
  resolutions: [], defaults: {},
};

describe("Maestro geometry", () => {
  it("matches native committed window boundaries", () => {
    const result = computeMaestroGeometry(30, caps);
    expect(result.totalFrames).toBe(720);
    expect(result.windowFrames).toBe(345);
    expect(result.overlapFrames).toBe(18);
    expect(result.windows.map((w) => [w.startFrame, w.endFrame])).toEqual([[0, 345], [345, 672], [672, 720]]);
  });
});

describe("LoRA triggers", () => {
  it("preserves an exact leetspeak trigger", () => {
    const catalog = [{ filename: "digicam.safetensors", trained_words: ["d1g1cam"], has_guide: false }];
    const selected = [{ filename: "digicam.safetensors", weight: 0.8, trigger: "d1g1cam", omitTrigger: false }];
    const result = applyLoraTriggers(["A portrait remains still."], catalog, selected, "portrait");
    expect(result.windows[0]).toContain("d1g1cam");
    expect(validateTriggerPlacements(result.windows, catalog, selected)).toEqual([]);
  });

  it("does not invent triggers for metadata-free LoRAs", () => {
    const result = applyLoraTriggers(["A portrait."], [{ filename: "turbo.safetensors", trained_words: [], has_guide: true }], [{ filename: "turbo.safetensors", weight: 1, trigger: null, omitTrigger: false }], "portrait");
    expect(result.windows).toEqual(["A portrait."]);
    expect(result.placements[0]?.omitted).toBe(true);
  });

  it("rejects a duplicated exact trigger", () => {
    const catalog = [{ filename: "combat.safetensors", trained_words: ["prfight2"], has_guide: false }];
    const selected = [{ filename: "combat.safetensors", weight: 0.8, trigger: "prfight2", omitTrigger: false }];
    expect(validateTriggerPlacements(["prfight2 action prfight2"], catalog, selected)[0]).toContain("duplicado");
  });
});

describe("Maestro references and payload", () => {
  const draft: MaestroRunDraft = {
    instanceId: "gpu0", modelType: "minimax_h3_ref2va", resolution: "1280x720",
    continuity: true, referenceIntents: {}, loras: [], reviewedWindows: [],
  };

  it("preserves the visible media order after Picture 1 changes", () => {
    const project = makeProject({
      references: [
        makeReference({ id: "new-picture", fileName: "new.png", path: "C:/new.png" }),
        makeReference({ id: "old-picture", fileName: "old.png", path: "C:/old.png", role: "style" }),
      ],
    });
    const uploads = new Map([
      ["new-picture", { filename: "u-new.png", path: "/uploads/u-new.png", url: "" }],
      ["old-picture", { filename: "u-old.png", path: "/uploads/u-old.png", url: "" }],
    ]);
    const references = buildMaestroReferences(project, draft, uploads);
    expect(references.map((reference) => reference.id)).toEqual(["new-picture", "old-picture"]);
    expect(references.map((reference) => reference.image_intent)).toEqual(["identity", "style"]);
  });

  it("uses Maestro manual sequence fields and exact reviewed prompts", () => {
    const project = makeProject({ brief: { ...makeProject().brief, durationSec: 30 } });
    const windows = ["Window one.", "Window two.", "Window three."];
    const payload = buildMaestroPayload({ project, draft, capabilities: caps, windows, references: [] });
    expect(payload.minimax_h3_sequence_prompt_mode).toBe("manual");
    expect(payload.h3_window_prompts).toEqual(windows);
    expect(payload.prompt).toBe(windows.join("\n"));
  });

  it("sends the selected Maestro Turbo preset, steps, filename and weight", () => {
    const turboCaps: MaestroModelCapabilities = {
      ...caps,
      turbo: {
        preset_id: "v4-step600-ema",
        presets: [
          { id: "v4-step600-ema", label: "V4", filename: "turbo-v4.safetensors", steps: 6, weight: 1 },
          { id: "v1-ckpt500", label: "Legacy", filename: "turbo-v1.safetensors", steps: 6, weight: 0.5 },
        ],
      },
    };
    const turboDraft: MaestroRunDraft = {
      ...draft,
      turboEnabled: true,
      turboPresetId: "v1-ckpt500",
      turboWeight: 0.65,
      loras: [{ filename: "style.safetensors", weight: 0.8, trigger: null, omitTrigger: true }],
    };
    const project = makeProject({ brief: { ...makeProject().brief, durationSec: 30 } });
    const payload = buildMaestroPayload({ project, draft: turboDraft, capabilities: turboCaps, windows: ["W1", "W2", "W3"], references: [] });
    expect(payload.minimax_h3_turbo_mode).toBe(true);
    expect(payload.minimax_h3_turbo_preset).toBe("v1-ckpt500");
    expect(payload.num_inference_steps).toBe(6);
    expect(payload.activated_loras).toEqual(["style.safetensors", "turbo-v1.safetensors"]);
    expect(payload.loras_multipliers).toBe("0.8 0.65");
  });

  it("does not send a managed Turbo LoRA when Turbo is disabled", () => {
    const turboCaps: MaestroModelCapabilities = {
      ...caps,
      defaults: { num_inference_steps: 20 },
      turbo: { presets: [{ id: "v4", label: "V4", filename: "turbo-v4.safetensors", steps: 6, weight: 1 }] },
    };
    const oldDraft = {
      ...draft,
      loras: [{ filename: "turbo-v4.safetensors", weight: 1, trigger: null, omitTrigger: true }],
    };
    const project = makeProject({ brief: { ...makeProject().brief, durationSec: 30 } });
    const payload = buildMaestroPayload({ project, draft: oldDraft, capabilities: turboCaps, windows: ["W1", "W2", "W3"], references: [] });
    expect(payload.minimax_h3_turbo_mode).toBe(false);
    expect(payload.activated_loras).toEqual([]);
    expect(payload.num_inference_steps).toBe(20);
  });

  it("bypasses the First/Last storyboard planner", () => {
    const flCaps = { ...caps, modelType: "minimax_h3", omniReference: false };
    const flDraft = { ...draft, modelType: "minimax_h3" };
    const project = makeProject({ brief: { ...makeProject().brief, durationSec: 30 } });
    const payload = buildMaestroPayload({
      project,
      draft: flDraft,
      capabilities: flCaps,
      windows: ["W1", "W2", "W3"],
      references: [],
      firstPath: "/uploads/start.png",
      lastPath: "/uploads/end.png",
    });
    expect(payload.minimax_h3_window_storyboard).toBe(false);
    expect(payload.multi_prompts_gen_type).toBe(2);
    expect(payload.image_start).toBe("/uploads/start.png");
    expect(payload.sliding_window_memory_override).toBe(true);
  });
});
