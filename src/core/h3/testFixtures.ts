import type {
  Brief,
  DialogueLine,
  Project,
  ReferenceItem,
  ShotDef,
  SubjectDef,
} from "./types";

/** Minimal, valid building blocks so tests state only what they are testing. */

export function makeBrief(over: Partial<Brief> = {}): Brief {
  return {
    idea: "Una mujer saluda a cámara y presenta la marca.",
    durationSec: 10,
    aspectRatio: "9:16",
    forcedMode: null,
    dialogueLanguage: "Spanish",
    styleNote: "clean realistic social-media portrait",
    visibleTextPolicy: "none",
    allowedText: [],
    antiMicrotext: false,
    continuityGuards: true,
    extraConstraints: "",
    ...over,
  };
}

export function makeReference(over: Partial<ReferenceItem> = {}): ReferenceItem {
  return {
    id: "ref-identity",
    path: "C:/refs/laura.jpg",
    fileName: "laura.jpg",
    kind: "image",
    sizeBytes: 1024,
    role: "identity",
    retention: "fully_preserved",
    note: "",
    ...over,
  };
}

export function makeSubject(over: Partial<SubjectDef> = {}): SubjectDef {
  return {
    id: "subj-laura",
    label: "Laura",
    description: "the young woman",
    sourceRefIds: ["ref-identity"],
    attributes: "her exact facial identity, hairstyle, and body proportions",
    retention: "fully_preserved",
    appearsIn: [],
    ...over,
  };
}

export function makeShots(count: number, gapMs = 4000): ShotDef[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `shot-${i + 1}`,
    cutMs: i === 0 ? null : i * gapMs,
    beat: "",
  }));
}

export function makeDialogue(over: Partial<DialogueLine> = {}): DialogueLine {
  return {
    id: "line-1",
    shotId: "shot-1",
    subjectIds: ["subj-laura"],
    delivery: "smiles warmly and",
    text: "¡Hola! Qué gusto verte.",
    language: "Spanish",
    voiceover: false,
    scenetrans: false,
    cutoff: false,
    ...over,
  };
}

export function makeProject(over: Partial<Project> = {}): Project {
  return {
    id: "project-1",
    name: "Test",
    brief: makeBrief(),
    references: [makeReference()],
    subjects: [makeSubject()],
    shots: makeShots(2),
    dialogue: [makeDialogue()],
    multiWindow: { enabled: false, windows: 2, carryMotionAndSound: true },
    updatedAt: 0,
    ...over,
  };
}
