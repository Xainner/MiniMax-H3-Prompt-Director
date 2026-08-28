import type { Project, ReferenceItem, ReferenceRole } from "@/core/h3/types";
import type { MaestroAudioIntent, MaestroImageIntent, MaestroReference, MaestroRunDraft, MaestroUpload } from "./types";

const IMAGE_INTENT: Partial<Record<ReferenceRole, MaestroImageIntent>> = {
  identity: "identity",
  wardrobe: "identity",
  object: "identity",
  logo: "identity",
  screen: "identity",
  environment: "scene",
  style: "style",
  composition: "composition",
  keyframe: "composition",
  "first-frame": "composition",
  "last-frame": "composition",
};

const AUDIO_INTENT: Partial<Record<ReferenceRole, MaestroAudioIntent>> = {
  voice: "voice",
  soundtrack: "drive",
  "music-style": "style",
  sfx: "style",
};

export function defaultMaestroIntent(reference: ReferenceItem): MaestroImageIntent | MaestroAudioIntent | undefined {
  if (reference.kind === "image") return IMAGE_INTENT[reference.role] ?? "composition";
  if (reference.kind === "audio") return AUDIO_INTENT[reference.role] ?? "style";
  return undefined;
}

export function buildMaestroReferences(
  project: Project,
  draft: MaestroRunDraft,
  uploads: Map<string, MaestroUpload>,
): MaestroReference[] {
  return project.references.flatMap((reference) => {
    const upload = uploads.get(reference.id);
    if (!upload || !["image", "video", "audio"].includes(reference.kind)) return [];
    const intent = draft.referenceIntents[reference.id] ?? defaultMaestroIntent(reference);
    const base: MaestroReference = {
      id: reference.id,
      type: reference.kind as "image" | "video" | "audio",
      path: upload.path,
      filename: upload.filename,
      role: reference.note.trim() || reference.role,
      duration_seconds: upload.durationSeconds,
    };
    if (reference.kind === "image") base.image_intent = intent as MaestroImageIntent;
    if (reference.kind === "audio") base.audio_intent = intent as MaestroAudioIntent;
    if (reference.kind === "video") {
      base.include_audio = upload.hasAudio ?? true;
      base.has_audio = upload.hasAudio;
    }
    return [base];
  });
}

export function omniReferenceErrors(references: MaestroReference[]): string[] {
  const counts = {
    image: references.filter((r) => r.type === "image").length,
    video: references.filter((r) => r.type === "video").length,
    audio: references.filter((r) => r.type === "audio").length,
  };
  const errors: string[] = [];
  if (references.length === 0 || counts.image + counts.video === 0) errors.push("Omni necesita al menos una imagen o video.");
  if (references.length > 12) errors.push("Omni acepta como máximo 12 referencias.");
  if (counts.image > 9) errors.push("Omni acepta como máximo 9 imágenes.");
  if (counts.video > 3) errors.push("Omni acepta como máximo 3 videos.");
  if (counts.audio > 3) errors.push("Omni acepta como máximo 3 audios.");
  if (references.filter((r) => r.audio_intent === "drive").length > 1) errors.push("Solo puede existir un soundtrack exacto (drive).");
  return errors;
}

