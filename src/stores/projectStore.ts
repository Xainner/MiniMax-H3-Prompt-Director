import { create } from "zustand";
import {
  buildRepairSection,
  buildWriterBrief,
  parseWindowOutput,
  parseWriterOutput,
} from "@/core/h3/assemble";
import { buildWindowBrief, renderWindows, validateWindows } from "@/core/h3/multiWindow";
import { replanShots } from "@/core/h3/plan";
import { describeReference, renderPrompt } from "@/core/h3/render";
import { defaultRoleFor, detectMode, roleMeta } from "@/core/h3/roles";
import { multiWindowSystemPrompt, writerSystemPrompt } from "@/core/h3/systemPrompt";
import {
  buildH3SkillInstructions,
  defaultH3SkillProfile,
  validateH3SkillProfile,
  type H3SkillProfile,
} from "@/core/h3/skills";
import { isModelFixable, validatePrompt } from "@/core/h3/validate";
import type {
  Brief,
  DialogueLine,
  Finding,
  H3Mode,
  Project,
  ProjectOutput,
  ReferenceItem,
  ShotDef,
  SubjectDef,
} from "@/core/h3/types";
import { errorMessage, ipc } from "@/lib/ipc";
import { createId } from "@/lib/utils";

export type GenerationStatus = "idle" | "writing" | "rendering" | "done" | "error";

interface GenerationState {
  status: GenerationStatus;
  requestId: string | null;
  /** Raw model output, shown in the console so a bad response is debuggable. */
  raw: string;
  prompt: string;
  findings: Finding[];
  windows: string[];
  windowFindings: Finding[];
  error: string | null;
}

const emptyGeneration: GenerationState = {
  status: "idle",
  requestId: null,
  raw: "",
  prompt: "",
  findings: [],
  windows: [],
  windowFindings: [],
  error: null,
};

export function createEmptyProject(): Project {
  const now = Date.now();
  return {
    schemaVersion: 2,
    id: createId("proj"),
    name: "Proyecto sin título",
    createdAt: now,
    videoSeed: randomVideoSeed(),
    h3Skill: defaultH3SkillProfile(),
    brief: {
      idea: "",
      durationSec: 10,
      aspectRatio: "9:16",
      forcedMode: null,
      dialogueLanguage: "Spanish",
      styleNote: "",
      visibleTextPolicy: "none",
      allowedText: [],
      antiMicrotext: true,
      continuityGuards: true,
      extraConstraints: "",
    },
    references: [],
    subjects: [],
    shots: [{ id: createId("shot"), cutMs: null, beat: "" }],
    dialogue: [],
    multiWindow: { enabled: false, windows: 2, carryMotionAndSound: true },
    outputs: [],
    updatedAt: now,
  };
}

function randomVideoSeed(): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0]! & 0x7fffffff;
}

function normalizeVideoSeed(seed: number): number {
  if (!Number.isFinite(seed)) return 0;
  return Math.max(0, Math.min(2_147_483_647, Math.trunc(seed)));
}

async function ensureManagedReferences(project: Project): Promise<Project> {
  let changed = project.schemaVersion !== 2;
  const references: ReferenceItem[] = [];
  for (const reference of project.references) {
    if (reference.assetId && reference.available !== false) {
      const available = await ipc.projectAssetAvailable(reference.path, reference.sizeBytes);
      references.push(available ? reference : { ...reference, available: false });
      changed ||= !available;
      continue;
    }
    try {
      const asset = await ipc.ingestProjectAsset(project.id, reference.path, "reference");
      references.push({ ...reference, path: asset.path, assetId: asset.id, sha256: asset.sha256, sizeBytes: asset.sizeBytes, available: true });
    } catch {
      references.push({ ...reference, available: false });
    }
    changed = true;
  }
  return changed ? { ...project, schemaVersion: 2, references, outputs: project.outputs ?? [] } : project;
}

function generationFromProject(project: Project): GenerationState {
  const mode = project.brief.forcedMode ?? detectMode(project.references);
  const prompt = project.lastPrompt ?? "";
  const windows = project.lastWindows ?? [];
  return {
    ...emptyGeneration,
    prompt,
    windows,
    findings: prompt ? validatePrompt(prompt, project, mode) : [],
    windowFindings: windows.length > 0 ? validateWindows(windows, project) : [],
    status: prompt ? "done" : "idle",
  };
}

/**
 * Projects saved before subject-role references auto-created a Subject would
 * show an empty Subjects tab while the prompt (via `effectiveSubjects`) talks
 * about one. Materialise them on load so both views agree.
 */
function backfillSubjects(project: Project): Project {
  // A project saved before a brief field existed must not show that field as
  // "off" while the renderer treats it as on.
  const defaults = createEmptyProject();
  project = {
    ...project,
    brief: { ...defaults.brief, ...project.brief },
    multiWindow: { ...defaults.multiWindow, ...project.multiWindow },
    h3Skill: {
      ...defaults.h3Skill,
      ...project.h3Skill,
      inputs: { ...defaults.h3Skill.inputs, ...project.h3Skill?.inputs },
    },
  };

  // Subjects created automatically by older builds predate the lifecycle
  // marker. Adopt only the high-confidence shape produced by addReferences:
  // one source, its filename as label, the default description and no shot
  // scoping. Manually modelled Subjects remain untouched.
  project = {
    ...project,
    subjects: project.subjects.map((subject) => {
      if (subject.managedSourceRefId || subject.sourceRefIds.length !== 1) return subject;
      const ref = project.references.find((candidate) => candidate.id === subject.sourceRefIds[0]);
      if (!ref) return subject;
      const defaultLabel = ref.fileName.replace(/\.[^.]+$/, "");
      const looksAutomatic =
        subject.label === defaultLabel &&
        subject.description === describeReference(ref) &&
        (subject.appearsIn?.length ?? 0) === 0;
      return looksAutomatic ? { ...subject, managedSourceRefId: ref.id } : subject;
    }),
  };

  const claimed = new Set(project.subjects.flatMap((s) => s.sourceRefIds));
  const missing = project.references.filter(
    (ref) => !roleMeta(ref.role).standalone && !claimed.has(ref.id),
  );
  if (missing.length === 0) return project;

  return {
    ...project,
    subjects: [
      ...project.subjects,
      ...missing.map<SubjectDef>((ref) => ({
        id: createId("subj"),
        managedSourceRefId: ref.id,
        label: ref.fileName.replace(/\.[^.]+$/, ""),
        description: describeReference(ref),
        sourceRefIds: [ref.id],
        attributes: ref.analysis?.h3AttributeLine ?? "",
        retention: "fully_preserved",
        appearsIn: [],
      })),
    ],
  };
}

interface ProjectState {
  project: Project;
  dirty: boolean;
  generation: GenerationState;

  // project lifecycle
  reset: () => void;
  create: (name: string, mode: H3Mode) => Promise<void>;
  rename: (name: string) => void;
  hydrate: (project: Project) => void;
  /** `force=false` is reserved for autosave so a discarded stale write can abort. */
  save: (force?: boolean) => Promise<void>;
  saveAs: (name: string) => Promise<void>;
  open: (id: string) => Promise<void>;

  // brief
  patchBrief: (patch: Partial<Brief>) => void;
  patchH3Skill: (patch: Partial<H3SkillProfile>) => void;
  patchMultiWindow: (patch: Partial<Project["multiWindow"]>) => void;
  patchMaestro: (patch: Partial<NonNullable<Project["maestro"]>>) => void;

  // references
  addReferences: (paths: string[]) => Promise<void>;
  patchReference: (id: string, patch: Partial<ReferenceItem>) => void;
  removeReference: (id: string) => void;
  reorderReferences: (ids: string[]) => void;
  analyzeReference: (id: string, force?: boolean) => Promise<void>;
  analyzeAll: () => Promise<void>;
  relinkReference: (id: string, path: string) => Promise<void>;
  setVideoSeed: (seed: number) => void;
  addOutput: (output: ProjectOutput) => void;

  // subjects
  addSubject: (seed?: Partial<SubjectDef>) => string;
  patchSubject: (id: string, patch: Partial<SubjectDef>) => void;
  removeSubject: (id: string) => void;

  // shots
  addShot: () => void;
  planShots: (count: number) => void;
  patchShot: (id: string, patch: Partial<ShotDef>) => void;
  removeShot: (id: string) => void;

  // dialogue
  addDialogue: (shotId: string) => void;
  patchDialogue: (id: string, patch: Partial<DialogueLine>) => void;
  removeDialogue: (id: string) => void;

  // generation
  mode: () => H3Mode;
  generate: () => Promise<void>;
  repair: () => Promise<void>;
  generateWindows: (count?: number) => Promise<void>;
  setGeneratedWindows: (windows: string[]) => void;
  cancel: () => Promise<void>;
  clearGeneration: () => void;
}

export const useProject = create<ProjectState>((set, get) => {
  /** Every mutation funnels through here so `dirty` and `updatedAt` stay honest. */
  const mutate = (fn: (project: Project) => Project) => {
    set((state) => ({
      project: { ...fn(state.project), updatedAt: Date.now() },
      dirty: true,
    }));
  };

  return {
    project: createEmptyProject(),
    dirty: false,
    generation: emptyGeneration,

    reset: () => set({ project: createEmptyProject(), dirty: false, generation: emptyGeneration }),

    create: async (name, mode) => {
      const project = createEmptyProject();
      project.name = name.trim() || "Proyecto sin título";
      project.brief.forcedMode = mode;
      await ipc.saveProject(project.id, project.name, JSON.stringify(project));
      set({ project, dirty: false, generation: emptyGeneration });
    },

    rename: (name) => mutate((p) => ({ ...p, name })),

    hydrate: (project) => set({ project, dirty: false, generation: emptyGeneration }),

    save: async (force = true) => {
      const source = get().project;
      const project = await ensureManagedReferences(source);
      const current = get();
      // An autosave that began before "Descartar" or before another project
      // was opened must never write its stale snapshot afterwards.
      if ((!force && !current.dirty) || current.project.id !== source.id || current.project.updatedAt !== source.updatedAt) return;
      await ipc.saveProject(project.id, project.name, JSON.stringify(project));
      if (get().project.id === source.id && get().project.updatedAt === source.updatedAt) {
        set({ project, dirty: false });
      }
    },

    saveAs: async (name) => {
      const source = await ensureManagedReferences(get().project);
      const nextId = createId("proj");
      const references = await Promise.all(source.references.map(async (reference) => {
        if (!reference.available) return { ...reference };
        const asset = await ipc.ingestProjectAsset(nextId, reference.path, "reference");
        return { ...reference, path: asset.path, assetId: asset.id, sha256: asset.sha256, sizeBytes: asset.sizeBytes, available: true };
      }));
      const outputs = await Promise.all(source.outputs.map(async (output) => {
        if (!output.available) return { ...output };
        const asset = await ipc.ingestProjectAsset(nextId, output.path, "output");
        return { ...output, id: asset.id, path: asset.path, sha256: asset.sha256, sizeBytes: asset.sizeBytes, available: true };
      }));
      const now = Date.now();
      const project = { ...source, id: nextId, name: name.trim() || `${source.name} copia`, createdAt: now, updatedAt: now, references, outputs };
      await ipc.saveProject(project.id, project.name, JSON.stringify(project));
      await ipc.copyProjectHistory(source.id, project.id);
      set({ project, dirty: false, generation: generationFromProject(project) });
    },

    open: async (id) => {
      const raw = await ipc.loadProject(id);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Project;
      const project = await ensureManagedReferences(backfillSubjects({ ...createEmptyProject(), ...parsed, schemaVersion: 2, outputs: parsed.outputs ?? [] }));
      const migrated = parsed.schemaVersion !== 2 || typeof parsed.videoSeed !== "number" || !parsed.h3Skill || parsed.references.some((reference) => !reference.assetId || reference.available === false);
      if (migrated) await ipc.saveProject(project.id, project.name, JSON.stringify(project));

      // Re-validate what was stored. A prompt saved by an older build must not
      // be presented as valid just because nobody checked it again.
      set({
        project,
        dirty: false,
        generation: generationFromProject(project),
      });
    },

    patchBrief: (patch) => mutate((p) => ({ ...p, brief: { ...p.brief, ...patch } })),

    patchH3Skill: (patch) =>
      mutate((p) => ({
        ...p,
        h3Skill: {
          ...p.h3Skill,
          ...patch,
          inputs: patch.inputs ? { ...p.h3Skill.inputs, ...patch.inputs } : p.h3Skill.inputs,
        },
      })),

    patchMultiWindow: (patch) =>
      mutate((p) => ({ ...p, multiWindow: { ...p.multiWindow, ...patch } })),

    patchMaestro: (patch) =>
      mutate((p) => ({
        ...p,
        maestro: {
          instanceId: "",
          modelType: "",
          resolution: "",
          continuity: true,
          turboEnabled: false,
          referenceIntents: {},
          loras: [],
          reviewedWindows: [],
          ...p.maestro,
          ...patch,
        },
      })),

    addReferences: async (paths) => {
      for (const path of paths) {
        try {
          const info = await ipc.inspectMedia(path);
          if (get().project.references.some((r) => r.id === info.hash)) continue;

          const role = defaultRoleFor(info.kind);
          const asset = await ipc.ingestProjectAsset(get().project.id, info.path, "reference");
          const item: ReferenceItem = {
            id: info.hash,
            path: asset.path,
            fileName: info.fileName,
            kind: info.kind,
            sizeBytes: asset.sizeBytes,
            assetId: asset.id,
            sha256: asset.sha256,
            available: true,
            width: info.width,
            height: info.height,
            thumbnail: info.thumbnail,
            role,
            retention: roleMeta(role).defaultRetention,
            note: "",
            shotId: null,
          };
          mutate((p) => ({ ...p, references: [...p.references, item] }));
          // A subject-role reference reaches the prompt only through a Subject
          // (§5.1), so create one immediately instead of letting the image sit
          // in the rail without ever being cited.
          if (!roleMeta(role).standalone) {
            get().addSubject({
              managedSourceRefId: item.id,
              label: item.fileName.replace(/\.[^.]+$/, ""),
              description: describeReference(item),
              sourceRefIds: [item.id],
              retention: "fully_preserved",
            });
          }
        } catch (e) {
          const message = errorMessage(e);
          set((state) => ({
            generation: { ...state.generation, error: message },
          }));
          throw e;
        }
      }
    },

    relinkReference: async (id, path) => {
      const current = get().project.references.find((reference) => reference.id === id);
      if (!current) return;
      const info = await ipc.inspectMedia(path);
      if (current.sha256 && info.hash !== current.sha256) throw new Error("El archivo elegido no coincide con el checksum de la referencia original.");
      const asset = await ipc.ingestProjectAsset(get().project.id, path, "reference");
      get().patchReference(id, { path: asset.path, assetId: asset.id, sha256: asset.sha256, sizeBytes: asset.sizeBytes, available: true, analysisError: undefined });
    },

    setVideoSeed: (seed) => mutate((project) => ({ ...project, videoSeed: normalizeVideoSeed(seed) })),

    addOutput: (output) => mutate((project) => ({
      ...project,
      outputs: [...project.outputs.filter((item) => item.id !== output.id), output],
    })),

    patchReference: (id, patch) => {
      mutate((p) => ({
        ...p,
        references: p.references.map((r) => {
          if (r.id !== id) return r;
          const next = { ...r, ...patch };
          // Changing the role resets retention to that role's sane default.
          if (patch.role && patch.role !== r.role && !patch.retention) {
            next.retention = roleMeta(patch.role).defaultRetention;
          }
          return next;
        }),
      }));

      // Switching into a subject role needs a Subject to carry the citation.
      if (patch.role && !roleMeta(patch.role).standalone) {
        const state = get();
        const claimed = state.project.subjects.some((s) => s.sourceRefIds.includes(id));
          if (!claimed) {
          const ref = state.project.references.find((r) => r.id === id);
            state.addSubject({
              managedSourceRefId: id,
              label: ref?.fileName.replace(/\.[^.]+$/, "") ?? "",
            description: ref ? describeReference(ref) : "",
            sourceRefIds: [id],
            attributes: ref?.analysis?.h3AttributeLine ?? "",
            retention: "fully_preserved",
          });
        }
      }
    },

    removeReference: (id) =>
      mutate((p) => {
        const removedSubjectIds = new Set(
          p.subjects
            .filter(
              (subject) =>
                subject.managedSourceRefId === id &&
                subject.sourceRefIds.length === 1 &&
                subject.sourceRefIds[0] === id,
            )
            .map((subject) => subject.id),
        );

        return {
          ...p,
          maestro: p.maestro
            ? {
                ...p.maestro,
                referenceIntents: Object.fromEntries(
                  Object.entries(p.maestro.referenceIntents).filter(([refId]) => refId !== id),
                ),
              }
            : undefined,
          references: p.references.filter((reference) => reference.id !== id),
          subjects: p.subjects
            .filter((subject) => !removedSubjectIds.has(subject.id))
            .map((subject) => {
              const sourceRefIds = subject.sourceRefIds.filter((refId) => refId !== id);
              return subject.managedSourceRefId === id
                ? { ...subject, sourceRefIds, managedSourceRefId: undefined }
                : { ...subject, sourceRefIds };
            }),
          dialogue: p.dialogue.map((line) => ({
            ...line,
            subjectIds: line.subjectIds.filter((subjectId) => !removedSubjectIds.has(subjectId)),
          })),
        };
      }),

    reorderReferences: (ids) =>
      mutate((p) => {
        const byId = new Map(p.references.map((r) => [r.id, r]));
        const next = ids.map((id) => byId.get(id)).filter(Boolean) as ReferenceItem[];
        for (const ref of p.references) if (!ids.includes(ref.id)) next.push(ref);
        return { ...p, references: next };
      }),

    analyzeReference: async (id, force) => {
      const ref = get().project.references.find((r) => r.id === id);
      if (!ref || ref.kind !== "image") return;

      get().patchReference(id, { analyzing: true, analysisError: undefined });
      try {
        const result = await ipc.analyzeReference({
          path: ref.path,
          hash: ref.id,
          hint: `${roleMeta(ref.role).label}${ref.note ? ` — ${ref.note}` : ""}`,
          force,
        });
        const { cached: _cached, ...analysis } = result;
        get().patchReference(id, { analysis, analyzing: false });

        // Fill in whatever the user has not written by hand yet, so the freshly
        // analysed image immediately produces a usable Subject definition.
        for (const subject of get().project.subjects) {
          if (!subject.sourceRefIds.includes(id)) continue;
          const patch: Partial<SubjectDef> = {};
          if (!subject.attributes.trim() && analysis.h3AttributeLine) {
            patch.attributes = analysis.h3AttributeLine;
          }
          if (!subject.description.trim() && ref) {
            patch.description = describeReference({ ...ref, analysis });
          }
          if (Object.keys(patch).length > 0) get().patchSubject(subject.id, patch);
        }
      } catch (e) {
        get().patchReference(id, { analyzing: false, analysisError: errorMessage(e) });
        throw e;
      }
    },

    analyzeAll: async () => {
      const images = get().project.references.filter((r) => r.kind === "image" && !r.analysis);
      for (const ref of images) {
        await get().analyzeReference(ref.id);
      }
    },

    addSubject: (seed) => {
      const id = seed?.id ?? createId("subj");
      const subject: SubjectDef = {
        id,
        label: "",
        description: "",
        sourceRefIds: [],
        attributes: "",
        retention: "fully_preserved",
        appearsIn: [],
        ...seed,
      };
      mutate((p) => ({ ...p, subjects: [...p.subjects, subject] }));
      return id;
    },

    patchSubject: (id, patch) =>
      mutate((p) => ({
        ...p,
        subjects: p.subjects.map((s) => {
          if (s.id !== id) return s;
          const next = { ...s, ...patch };
          if (
            patch.sourceRefIds &&
            s.managedSourceRefId &&
            (patch.sourceRefIds.length !== 1 || patch.sourceRefIds[0] !== s.managedSourceRefId)
          ) {
            next.managedSourceRefId = undefined;
          }
          return next;
        }),
      })),

    removeSubject: (id) =>
      mutate((p) => ({
        ...p,
        subjects: p.subjects.filter((s) => s.id !== id),
        dialogue: p.dialogue.map((line) => ({
          ...line,
          subjectIds: line.subjectIds.filter((s) => s !== id),
        })),
      })),

    addShot: () =>
      mutate((p) => {
        const previous = p.shots[p.shots.length - 1];
        const previousMs = previous?.cutMs ?? 0;
        const step = Math.max(1000, Math.round((p.brief.durationSec * 1000) / (p.shots.length + 1)));
        const cutMs = Math.min(previousMs + step, Math.round(p.brief.durationSec * 1000) - 500);
        return { ...p, shots: [...p.shots, { id: createId("shot"), cutMs, beat: "" }] };
      }),

    planShots: (count) =>
      mutate((p) => {
        const { shots, removedIds, fallbackId } = replanShots(
          p.shots,
          p.brief.durationSec,
          count,
          () => createId("shot"),
        );
        const removed = new Set(removedIds);
        return {
          ...p,
          shots,
          // Nothing may end up pointing at a shot that no longer exists.
          dialogue: p.dialogue.map((line) =>
            removed.has(line.shotId) ? { ...line, shotId: fallbackId } : line,
          ),
          references: p.references.map((r) =>
            r.shotId && removed.has(r.shotId) ? { ...r, shotId: fallbackId } : r,
          ),
        };
      }),

    patchShot: (id, patch) =>
      mutate((p) => ({
        ...p,
        shots: p.shots.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      })),

    removeShot: (id) =>
      mutate((p) => {
        if (p.shots.length <= 1) return p;
        const shots = p.shots.filter((s) => s.id !== id);
        // Shot 1 must never carry a timestamp (§12.1).
        const normalised = shots.map((s, i) => (i === 0 ? { ...s, cutMs: null } : s));
        const fallbackId = normalised[0]!.id;
        return {
          ...p,
          shots: normalised,
          dialogue: p.dialogue.map((line) =>
            line.shotId === id ? { ...line, shotId: fallbackId } : line,
          ),
          references: p.references.map((r) => (r.shotId === id ? { ...r, shotId: null } : r)),
        };
      }),

    addDialogue: (shotId) =>
      mutate((p) => ({
        ...p,
        dialogue: [
          ...p.dialogue,
          {
            id: createId("line"),
            shotId,
            subjectIds: p.subjects[0] ? [p.subjects[0].id] : [],
            delivery: "",
            text: "",
            language: p.brief.dialogueLanguage,
            voiceover: false,
            scenetrans: false,
            cutoff: false,
          },
        ],
      })),

    patchDialogue: (id, patch) =>
      mutate((p) => ({
        ...p,
        dialogue: p.dialogue.map((l) => (l.id === id ? { ...l, ...patch } : l)),
      })),

    removeDialogue: (id) =>
      mutate((p) => ({ ...p, dialogue: p.dialogue.filter((l) => l.id !== id) })),

    mode: () => {
      const { project } = get();
      return project.brief.forcedMode ?? detectMode(project.references);
    },

    generate: async () => {
      const { project } = get();
      const mode = get().mode();
      const skillErrors = validateH3SkillProfile(project.h3Skill, project.references);
      if (skillErrors.length > 0) throw new Error(skillErrors.join(" "));
      const requestId = createId("req");

      set({
        generation: { ...emptyGeneration, status: "writing", requestId },
      });

      try {
        const raw = await ipc.generatePrompt({
          requestId,
          system: writerSystemPrompt(buildH3SkillInstructions(project, mode)),
          user: buildWriterBrief(project, mode),
        });

        set((state) => ({ generation: { ...state.generation, raw, status: "rendering" } }));

        const writer = parseWriterOutput(raw, project.shots.length);
        const prompt = renderPrompt({ project, writer, mode });
        const findings = validatePrompt(prompt, project, mode);

        set((state) => ({
          project: { ...state.project, lastPrompt: prompt },
          dirty: true,
          generation: { ...state.generation, prompt, findings, status: "done" },
        }));

        await ipc.addHistory(createId("hist"), project.id, mode, prompt).catch(() => undefined);
      } catch (e) {
        set((state) => ({
          generation: { ...state.generation, status: "error", error: errorMessage(e) },
        }));
        throw e;
      }
    },

    repair: async () => {
      const { project, generation } = get();
      const mode = get().mode();
      const skillErrors = validateH3SkillProfile(project.h3Skill, project.references);
      if (skillErrors.length > 0) throw new Error(skillErrors.join(" "));
      const fixable = generation.findings.filter(
        (f) => f.severity === "error" && isModelFixable(f),
      );
      if (fixable.length === 0) return;

      const requestId = createId("req");
      set((state) => ({
        generation: { ...state.generation, status: "writing", requestId, error: null },
      }));

      try {
        // Same writer pass, plus the violations. The prompt is then re-rendered
        // by the app, so no structural guarantee can be lost in a repair.
        const raw = await ipc.generatePrompt({
          requestId,
          system: writerSystemPrompt(buildH3SkillInstructions(project, mode)),
          user: `${buildWriterBrief(project, mode)}\n\n${buildRepairSection(fixable)}`,
          temperature: 0,
        });

        set((state) => ({ generation: { ...state.generation, raw, status: "rendering" } }));

        const writer = parseWriterOutput(raw, project.shots.length);
        const prompt = renderPrompt({ project, writer, mode });
        const findings = validatePrompt(prompt, project, mode);

        set((state) => ({
          project: { ...state.project, lastPrompt: prompt },
          dirty: true,
          generation: { ...state.generation, prompt, findings, status: "done" },
        }));
      } catch (e) {
        set((state) => ({
          generation: { ...state.generation, status: "error", error: errorMessage(e) },
        }));
        throw e;
      }
    },

    generateWindows: async (requestedCount) => {
      const { project } = get();
      const mode = get().mode();
      const skillErrors = validateH3SkillProfile(project.h3Skill, project.references);
      if (skillErrors.length > 0) throw new Error(skillErrors.join(" "));
      const requestId = createId("req");
      const windowCount = Math.max(1, requestedCount ?? project.multiWindow.windows);

      set((state) => ({
        generation: { ...state.generation, status: "writing", requestId, raw: "", error: null },
      }));

      try {
        const raw = await ipc.generatePrompt({
          requestId,
          system: multiWindowSystemPrompt(buildH3SkillInstructions(project, mode)),
          user: buildWindowBrief(project, mode, windowCount),
        });

        set((state) => ({ generation: { ...state.generation, raw, status: "rendering" } }));

        const parsed = parseWindowOutput(raw, windowCount);
        const windows = renderWindows(project, parsed);
        const windowFindings = validateWindows(windows, project);

        set((state) => ({
          project: { ...state.project, lastWindows: windows },
          dirty: true,
          generation: { ...state.generation, windows, windowFindings, status: "done" },
        }));
      } catch (e) {
        set((state) => ({
          generation: { ...state.generation, status: "error", error: errorMessage(e) },
        }));
        throw e;
      }
    },

    setGeneratedWindows: (windows) => {
      const normalized = windows.map((window) => window.replace(/\s*\n+\s*/g, " ").trim());
      const { project } = get();
      const windowFindings = validateWindows(normalized, project);
      set((state) => ({
        project: {
          ...state.project,
          lastWindows: normalized,
          maestro: state.project.maestro
            ? { ...state.project.maestro, reviewedWindows: normalized }
            : state.project.maestro,
          updatedAt: Date.now(),
        },
        dirty: true,
        generation: { ...state.generation, windows: normalized, windowFindings, status: "done" },
      }));
    },

    cancel: async () => {
      const { requestId } = get().generation;
      if (!requestId) return;
      await ipc.cancelRequest(requestId);
      set((state) => ({ generation: { ...state.generation, status: "idle", requestId: null } }));
    },

    clearGeneration: () => set({ generation: emptyGeneration }),
  };
});
