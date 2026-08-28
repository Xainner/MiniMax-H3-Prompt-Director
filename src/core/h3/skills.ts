import type { H3Mode, MediaKind, Project, ReferenceItem } from "./types";

export const H3_SKILLS_SOURCE = "https://github.com/MiniMax-AI/MiniMax-H3/tree/main/skills";
export const H3_SKILLS_SOURCE_REVISION = "d21241f0a4b3acbb34c97dae47fa417b7065e438";
export const H3_SKILLS_ADAPTATION_VERSION = 1;

export type H3StyleSkillId =
  | "minimalist-product-ad"
  | "3d-animation-short"
  | "papercraft-stop-motion-explainer"
  | "brand-promo-video"
  | "music-video-subtitles"
  | "co-op-game-intro"
  | "paper-collage-explainer"
  | "handdrawn-live-action-fusion";

export interface H3SkillFieldDefinition {
  key: string;
  label: string;
  placeholder: string;
  required: boolean;
  multiline?: boolean;
}

export interface H3SkillDefinition {
  id: H3StyleSkillId;
  label: string;
  description: string;
  bestFor: string;
  requirements: string;
  fields: H3SkillFieldDefinition[];
  requiredReferenceGroups?: Array<{ kinds: MediaKind[]; label: string }>;
  recommendedDurationSec?: number;
  recommendedAspectRatio?: Project["brief"]["aspectRatio"];
  instructions: string;
}

export interface H3SkillProfile {
  baseId: "h3-prompt-writing";
  styleId: H3StyleSkillId | null;
  sourceRevision: string;
  adaptationVersion: number;
  inputs: Record<string, string>;
}

const fields = (...items: Array<[string, string, string, boolean?, boolean?]>): H3SkillFieldDefinition[] =>
  items.map(([key, label, placeholder, required = true, multiline = false]) => ({ key, label, placeholder, required, multiline }));

export const H3_STYLE_SKILLS: readonly H3SkillDefinition[] = [
  {
    id: "minimalist-product-ad",
    label: "Minimalist Product Ad",
    description: "Publicidad limpia de producto con jerarquía visual, beneficio claro y copy controlado.",
    bestFor: "Productos físicos, lanzamientos y piezas de conversión.",
    requirements: "Producto, beneficio principal y una referencia visual del producto.",
    fields: fields(
      ["product", "Producto", "Qué producto aparece"],
      ["benefits", "Beneficios", "Beneficios que deben demostrarse", true, true],
      ["audience", "Audiencia", "A quién se dirige"],
      ["copy", "Copy", "Texto literal permitido", false],
    ),
    requiredReferenceGroups: [{ kinds: ["image"], label: "una imagen del producto" }],
    recommendedDurationSec: 10,
    recommendedAspectRatio: "9:16",
    instructions: "Build a minimalist product-ad arc: immediate visual hook, tactile feature demonstration, benefit payoff, and a clean hero composition. Use restrained premium camera movement, deliberate negative space, material detail, and only approved literal on-screen copy.",
  },
  {
    id: "3d-animation-short",
    label: "3D Animation Short",
    description: "Corto narrativo 3D con personajes coherentes, actuación clara y arco breve.",
    bestFor: "Microhistorias, personajes estilizados y narrativa familiar.",
    requirements: "Historia, estilo 3D y personajes principales.",
    fields: fields(
      ["story", "Historia", "Inicio, giro y desenlace", true, true],
      ["visualStyle", "Estilo 3D", "Materiales, iluminación y acabado"],
      ["characters", "Personajes", "Quiénes aparecen y cómo actúan", true, true],
    ),
    recommendedDurationSec: 30,
    recommendedAspectRatio: "16:9",
    instructions: "Shape a concise 3D animated story with readable silhouettes, expressive poses, motivated staging, coherent materials and lighting, and a clear setup-turn-payoff arc. Keep character morphology and wardrobe stable across every shot and window.",
  },
  {
    id: "papercraft-stop-motion-explainer",
    label: "Papercraft Stop-Motion Explainer",
    description: "Explicación educativa como maqueta de papel animada cuadro a cuadro.",
    bestFor: "Conceptos educativos, procesos y divulgación amigable.",
    requirements: "Tema, objetivo de aprendizaje y audiencia.",
    fields: fields(
      ["topic", "Tema educativo", "Qué se explica"],
      ["learningGoal", "Objetivo", "Qué debe comprender la audiencia", true, true],
      ["audience", "Audiencia", "Nivel y perfil de la audiencia"],
    ),
    recommendedDurationSec: 30,
    recommendedAspectRatio: "16:9",
    instructions: "Explain the concept through handcrafted paper layers, visible cut edges, fold logic, tabletop depth, and intentionally stepped stop-motion movement. Make each visual transformation teach one idea and preserve spatial continuity between steps.",
  },
  {
    id: "brand-promo-video",
    label: "Brand Promo Video",
    description: "Pieza promocional de marca orientada a canal, claims y llamado a la acción.",
    bestFor: "Campañas, redes sociales, lanzamientos y branding.",
    requirements: "Marca, claims verificables, canal y CTA.",
    fields: fields(
      ["brand", "Marca", "Nombre y personalidad de marca"],
      ["claims", "Claims", "Mensajes o beneficios permitidos", true, true],
      ["channel", "Canal", "Red o ubicación de publicación"],
      ["cta", "CTA", "Llamado a la acción literal", false],
    ),
    recommendedDurationSec: 15,
    recommendedAspectRatio: "9:16",
    instructions: "Create a channel-aware brand promo with an immediate branded hook, evidence for approved claims, a memorable visual motif, and a decisive final brand/CTA composition. Treat all brand wording as literal and never invent claims or fine print.",
  },
  {
    id: "music-video-subtitles",
    label: "Music Video + Subtitles",
    description: "Video musical sincronizado con letra, mood y tratamiento tipográfico controlado.",
    bestFor: "Clips musicales, lyric videos y fragmentos sociales.",
    requirements: "Letra exacta, mood y dirección tipográfica.",
    fields: fields(
      ["lyrics", "Letra", "Texto literal y orden temporal", true, true],
      ["mood", "Mood", "Emoción, energía y paleta"],
      ["typography", "Tipografía", "Ubicación, escala y comportamiento"],
    ),
    requiredReferenceGroups: [{ kinds: ["audio"], label: "el audio o soundtrack del videoclip" }],
    recommendedDurationSec: 15,
    recommendedAspectRatio: "9:16",
    instructions: "Design a rhythm-led music video whose edits, subject motion, camera energy and typography respond to the soundtrack. Render only supplied lyric fragments, verbatim and in sequence, with legible intentional typography; never fabricate lyric text.",
  },
  {
    id: "co-op-game-intro",
    label: "Co-op Game Intro",
    description: "Introducción de videojuego cooperativo con roles legibles y UI restringida.",
    bestFor: "Trailers de gameplay, intros de equipo y conceptos multijugador.",
    requirements: "Título, jugadores/roles y reglas visuales de UI.",
    fields: fields(
      ["title", "Título", "Título literal permitido"],
      ["players", "Jugadores", "Roles, habilidades y cooperación", true, true],
      ["ui", "UI", "Elementos permitidos y comportamiento", true, true],
    ),
    requiredReferenceGroups: [{ kinds: ["image"], label: "una referencia visual de personajes o interfaz" }],
    recommendedDurationSec: 15,
    recommendedAspectRatio: "16:9",
    instructions: "Stage a cooperative game intro around complementary player roles, readable objectives, cause-and-effect teamwork, escalating stakes, and a united payoff. Keep screen geography understandable and limit interface graphics and text to the explicitly approved UI specification.",
  },
  {
    id: "paper-collage-explainer",
    label: "Paper Collage Explainer",
    description: "Narración explicativa mediante collage editorial, metáforas y capas de papel.",
    bestFor: "Ensayos visuales, campañas educativas y conceptos abstractos.",
    requirements: "Narración, metáfora visual y dirección de audio.",
    fields: fields(
      ["narration", "Narración", "Texto o argumento en orden", true, true],
      ["metaphor", "Metáfora", "Sistema visual que representa la idea", true, true],
      ["audio", "Audio", "Voz, música y efectos deseados", true, true],
    ),
    recommendedDurationSec: 15,
    recommendedAspectRatio: "16:9",
    instructions: "Translate the narration into an editorial paper-collage system with torn textures, layered cutouts, symbolic scale changes and visual metaphors. Every transition must advance the explanation, while voice, music and paper-like effects remain temporally coordinated.",
  },
  {
    id: "handdrawn-live-action-fusion",
    label: "Handdrawn Live-Action Fusion",
    description: "Acción real fusionada con dibujo que responde físicamente al sujeto y al entorno.",
    bestFor: "Piezas expresivas, moda, danza y efectos ilustrados.",
    requirements: "Contacto físico, escenario y reglas de morfología dibujada.",
    fields: fields(
      ["physicalContact", "Contacto físico", "Cómo interactúan dibujo y mundo real", true, true],
      ["setting", "Escenario", "Lugar, iluminación y superficies"],
      ["morphology", "Morfología", "Forma, trazo y transformación del dibujo", true, true],
    ),
    requiredReferenceGroups: [{ kinds: ["image", "video"], label: "una referencia visual de acción real" }],
    recommendedDurationSec: 15,
    recommendedAspectRatio: "16:9",
    instructions: "Fuse live action with hand-drawn forms that obey contact, occlusion, perspective and surface attachment. Choreograph each illustrated transformation around physical interaction, while preserving the live subject's identity and the drawing system's morphology from shot to shot.",
  },
] as const;

export function defaultH3SkillProfile(): H3SkillProfile {
  return {
    baseId: "h3-prompt-writing",
    styleId: null,
    sourceRevision: H3_SKILLS_SOURCE_REVISION,
    adaptationVersion: H3_SKILLS_ADAPTATION_VERSION,
    inputs: {},
  };
}

export function getH3StyleSkill(id: H3StyleSkillId | null): H3SkillDefinition | undefined {
  return id ? H3_STYLE_SKILLS.find((skill) => skill.id === id) : undefined;
}

export function validateH3SkillProfile(profile: H3SkillProfile, references?: ReferenceItem[]): string[] {
  const skill = getH3StyleSkill(profile.styleId);
  if (!profile.styleId) return [];
  if (!skill) return ["La Skill MiniMax H3 seleccionada no existe en este catálogo."];
  const errors = skill.fields
    .filter((field) => field.required && !profile.inputs[field.key]?.trim())
    .map((field) => `Completa «${field.label}» en Skill MiniMax H3.`);
  if (references) {
    for (const group of skill.requiredReferenceGroups ?? []) {
      const found = references.some((reference) => reference.available !== false && group.kinds.includes(reference.kind));
      if (!found) errors.push(`Agrega ${group.label} para usar «${skill.label}».`);
    }
  }
  return errors;
}

export function buildH3SkillInstructions(project: Project, mode: H3Mode): string {
  const profile = project.h3Skill;
  const skill = getH3StyleSkill(profile.styleId);
  const technicalVariant = mode === "full-reference" ? "ref-en.txt" : "base-en.txt";
  const base = `=== MINIMAX H3 SKILL PROFILE ===\nAlways apply the official h3-prompt-writing technical structure (${technicalVariant}), already enforced by Director's output contract. Director's deterministic renderer remains authoritative for section order, canonical references, subject numbering, retention, dialogue tags and literal dialogue.`;
  if (!skill) return base;
  const values = skill.fields
    .map((field) => `${field.label}: ${profile.inputs[field.key]?.trim() || "not supplied"}`)
    .join("\n");
  return `${base}\n\nOPTIONAL STYLE WORKFLOW — ${skill.label}\n${skill.instructions}\nWorkflow inputs:\n${values}\n\nSTYLE SAFETY: Use this workflow only to guide visual language, local storyboard actions, camera, movement and audio. It MUST NOT change or reinterpret literal dialogue or approved text, canonical reference tags, subject identities, retention, seed, Maestro window geometry, LoRA names, weights or trigger words. It MUST NOT introduce external tools, intermediate image generation, or production steps outside Director and Maestro.`;
}
