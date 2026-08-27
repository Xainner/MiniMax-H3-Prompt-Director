/**
 * Domain model for MiniMax H3 prompting.
 *
 * The shapes here mirror the vocabulary of `docs/MiniMax_H3_Prompting_Guide_ES.md`
 * on purpose: references, subjects, speakers and shots are separate concepts in
 * the guide, and collapsing them is the most common way prompts go wrong (§46).
 */

export type H3Mode = "full-reference" | "t2va" | "i2va" | "fl2va" | "l2va";

export type MediaKind = "image" | "video" | "audio" | "unknown";

/** What a reference contributes. Drives tag choice and retention defaults. */
export type ReferenceRole =
  // image → cited from inside a Subject definition (§5.1)
  | "identity"
  | "wardrobe"
  | "object"
  | "environment"
  | "style"
  | "logo"
  | "screen"
  // image → has a role of its own as a concrete frame (§5)
  | "first-frame"
  | "last-frame"
  | "keyframe"
  | "composition"
  // video (§6)
  | "edit-source"
  | "continuation"
  | "camera"
  | "cut-rhythm"
  | "motion"
  // audio (§7)
  | "voice"
  | "soundtrack"
  | "music-style"
  | "sfx";

export type VisualRetention =
  | "fully_preserved"
  | "partially_preserved"
  | "attribute_transfer"
  | "weak_reference";

export type AudioRetention =
  | "fully_copy"
  | "partially_copy"
  | "reference"
  | "weak_reference";

export type Retention = VisualRetention | AudioRetention;

export interface VisionAnalysis {
  summary: string;
  subjectType: string;
  identity: string;
  wardrobe: string;
  objects: string[];
  environment: string;
  lighting: string;
  palette: string[];
  composition: string;
  style: string;
  visibleText: string[];
  h3AttributeLine: string;
}

/** A file the user dropped in. Numbering is positional per media kind. */
export interface ReferenceItem {
  /** sha256 of the file — stable across renames and reorders. */
  id: string;
  path: string;
  fileName: string;
  kind: MediaKind;
  sizeBytes: number;
  width?: number;
  height?: number;
  /** Data URL thumbnail, images only. */
  thumbnail?: string;
  role: ReferenceRole;
  retention: Retention;
  /** Shot this reference is anchored to. Frame roles only. */
  shotId?: string | null;
  /** Free-text note. Required for video/audio, which are not analysed. */
  note: string;
  analysis?: VisionAnalysis;
  analysisError?: string;
  analyzing?: boolean;
}

/** Reusable visible content (§4). One subject may draw on several references. */
export interface SubjectDef {
  id: string;
  /** Human name used in the UI only, e.g. "Laura". Never emitted verbatim. */
  label: string;
  /** What this subject *is*, in English. e.g. "the young woman". */
  description: string;
  /** Reference ids this subject is sourced from, in citation order. */
  sourceRefIds: string[];
  /** Clause that follows "preserving". Seeded from the vision analysis. */
  attributes: string;
  retention: VisualRetention;
  /** Shot ids the subject appears in. Empty = all shots. */
  appearsIn: string[];
}

export interface ShotDef {
  id: string;
  /** Cut time in milliseconds. Shot 1 must be null (§12.1). */
  cutMs: number | null;
  /** Optional beat the writer model must cover in this shot. */
  beat: string;
}

export interface DialogueLine {
  id: string;
  shotId: string;
  /**
   * Subjects speaking this line. Empty means an off-screen narrator.
   * More than one renders as a joint speaker id, e.g. `(S1,S2)` (§14.2).
   */
  subjectIds: string[];
  /**
   * Acting/delivery, kept OUTSIDE the <d> tag (§15.1). For a narrator line
   * this doubles as the narrator description, e.g. "A warm female narrator".
   */
  delivery: string;
  /** Exact words. Never rewritten (§15.2). */
  text: string;
  language: string;
  voiceover: boolean;
  /**
   * Line deliberately continues across the following cut (§17). The split
   * point is the literal `<scenetrans>` token inside `text`.
   */
  scenetrans: boolean;
  /** Line is deliberately interrupted (§18). */
  cutoff: boolean;
}

export type VisibleTextPolicy = "none" | "allow-list" | "unrestricted";

export interface Brief {
  idea: string;
  durationSec: number;
  aspectRatio: "9:16" | "16:9" | "1:1";
  /** `null` = detect from reference roles. */
  forcedMode: H3Mode | null;
  dialogueLanguage: string;
  styleNote: string;
  visibleTextPolicy: VisibleTextPolicy;
  allowedText: string[];
  /** Adds the strong anti-microtext block of §20.1. */
  antiMicrotext: boolean;
  /**
   * Emits the identity, wardrobe and duplicate-subject guards of §32–§34.
   * On by default: they are the failures the guide says models produce alone.
   */
  continuityGuards: boolean;
  extraConstraints: string;
}

export interface MultiWindowConfig {
  enabled: boolean;
  windows: number;
  carryMotionAndSound: boolean;
}

export interface Project {
  id: string;
  name: string;
  brief: Brief;
  references: ReferenceItem[];
  subjects: SubjectDef[];
  shots: ShotDef[];
  dialogue: DialogueLine[];
  multiWindow: MultiWindowConfig;
  /** Last rendered prompt, kept so reopening a project shows the result. */
  lastPrompt?: string;
  lastWindows?: string[];
  updatedAt: number;
}

// ---- computed reference numbering -------------------------------------------

/** Positional tags assigned by media kind, stable for a given ordering. */
export interface RefNumbering {
  /** referenceId → `<Picture 2>` / `<Video 1>` / `<Audio 1>` */
  tag: Record<string, string>;
  /** referenceId → 1-based index within its media kind */
  index: Record<string, number>;
}

// ---- what the writer model must return --------------------------------------

export interface WriterShot {
  index: number;
  text: string;
}

export interface WriterOutput {
  summary: string;
  styleSentence: string;
  shots: WriterShot[];
  soundscape: string;
  music: string;
  /** Optional per-subject retention wording, keyed by `<Subject N>`. */
  retentionNotes?: Record<string, string>;
}

export interface WriterWindowOutput {
  windows: { index: number; text: string; endState: string }[];
}

// ---- validation --------------------------------------------------------------

export type Severity = "error" | "warning";

export interface Finding {
  severity: Severity;
  /** Stable rule id, matches the checklist section it comes from. */
  rule: string;
  message: string;
  /** Section the problem lives in, for grouping in the UI. */
  section: string;
  /** Character offset into the rendered prompt, when locatable. */
  offset?: number;
  length?: number;
}
