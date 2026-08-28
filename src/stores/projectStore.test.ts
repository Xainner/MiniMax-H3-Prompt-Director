import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The store is where the reported failure started: an image landed in the rail
 * but nothing ever cited it. These tests run against a fake Tauri bridge.
 */
const invoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => undefined) }));

const { useProject, createEmptyProject } = await import("./projectStore");
const { effectiveSubjects } = await import("@/core/h3/render");
const { numberReferences } = await import("@/core/h3/roles");

function mediaInfo(over: Record<string, unknown> = {}) {
  return {
    hash: "hash-laura",
    path: "C:/refs/laura.png",
    fileName: "laura.png",
    kind: "image",
    sizeBytes: 2048,
    width: 800,
    height: 1200,
    thumbnail: "data:image/jpeg;base64,AAAA",
    ...over,
  };
}

beforeEach(() => {
  invoke.mockReset();
  invoke.mockImplementation((command: string, args?: Record<string, unknown>) => {
    if (command === "ingest_project_asset") {
      const path = String(args?.path ?? "C:/refs/asset.bin");
      return Promise.resolve({ id: "asset_hash-laura", category: args?.category ?? "reference", originalFileName: path.split(/[\\/]/).pop(), path: `C:/managed/${path.split(/[\\/]/).pop()}`, sizeBytes: 2048, sha256: "hash-laura", available: true });
    }
    if (command === "copy_project_history" || command === "save_project") return Promise.resolve(undefined);
    if (command === "project_asset_available") return Promise.resolve(true);
    return Promise.resolve(undefined);
  });
  useProject.setState({ project: createEmptyProject(), dirty: false });
});

describe("adding a reference", () => {
  it("creates projects with a portable video seed", async () => {
    await useProject.getState().create("Seeded", "t2va");
    const { project, dirty } = useProject.getState();
    expect(project.name).toBe("Seeded");
    expect(project.videoSeed).toBeGreaterThanOrEqual(0);
    expect(project.videoSeed).toBeLessThanOrEqual(2_147_483_647);
    expect(project.schemaVersion).toBe(2);
    expect(dirty).toBe(false);
  });

  it("creates the Subject that will carry the <Picture 1> citation", async () => {
    invoke.mockResolvedValueOnce(mediaInfo());

    await useProject.getState().addReferences(["C:/refs/laura.png"]);
    const { project } = useProject.getState();

    expect(project.references).toHaveLength(1);
    expect(project.subjects).toHaveLength(1);
    expect(project.subjects[0]!.sourceRefIds).toEqual(["hash-laura"]);
    expect(project.subjects[0]!.managedSourceRefId).toBe("hash-laura");
    expect(project.subjects[0]!.label).toBe("laura");
    expect(project.subjects[0]!.description).toBe("the person");
  });

  it("does not create a Subject for a reference that defines itself", async () => {
    invoke.mockResolvedValueOnce(mediaInfo({ hash: "hash-clip", kind: "video", fileName: "toma.mp4" }));

    await useProject.getState().addReferences(["C:/refs/toma.mp4"]);
    const { project } = useProject.getState();

    // A video's role is a whole-video relationship, defined on its own (§6).
    expect(project.references).toHaveLength(1);
    expect(project.subjects).toHaveLength(0);
  });

  it("ignores a file that is already in the project", async () => {
    invoke.mockResolvedValue(mediaInfo());

    await useProject.getState().addReferences(["C:/refs/laura.png"]);
    await useProject.getState().addReferences(["C:/refs/laura.png"]);

    expect(useProject.getState().project.references).toHaveLength(1);
    expect(useProject.getState().project.subjects).toHaveLength(1);
  });
});

describe("changing a reference role", () => {
  it("creates a Subject when switching into a subject role", async () => {
    invoke.mockResolvedValueOnce(mediaInfo({ hash: "hash-frame", fileName: "cierre.png" }));

    await useProject.getState().addReferences(["C:/refs/cierre.png"]);
    // Start from a standalone role, so no subject exists yet.
    useProject.getState().patchReference("hash-frame", { role: "last-frame" });
    useProject.setState((s) => ({ project: { ...s.project, subjects: [] } }));

    useProject.getState().patchReference("hash-frame", { role: "logo" });

    const { project } = useProject.getState();
    expect(project.subjects).toHaveLength(1);
    expect(project.subjects[0]!.sourceRefIds).toEqual(["hash-frame"]);
  });

  it("does not duplicate a Subject that already claims the reference", async () => {
    invoke.mockResolvedValueOnce(mediaInfo());

    await useProject.getState().addReferences(["C:/refs/laura.png"]);
    useProject.getState().patchReference("hash-laura", { role: "wardrobe" });

    expect(useProject.getState().project.subjects).toHaveLength(1);
  });
});

describe("removing a reference", () => {
  it("removes the automatically managed Subject with its only source", async () => {
    invoke.mockResolvedValueOnce(mediaInfo());

    await useProject.getState().addReferences(["C:/refs/laura.png"]);
    useProject.getState().removeReference("hash-laura");

    const { project } = useProject.getState();
    expect(project.references).toHaveLength(0);
    expect(project.subjects).toHaveLength(0);
  });

  it("keeps a user-managed Subject and only detaches the removed source", async () => {
    invoke.mockResolvedValueOnce(mediaInfo());
    await useProject.getState().addReferences(["C:/refs/laura.png"]);
    const manualId = useProject.getState().addSubject({
      label: "Personaje manual",
      description: "the supporting character",
      sourceRefIds: ["hash-laura"],
    });

    useProject.getState().removeReference("hash-laura");

    const manual = useProject.getState().project.subjects.find((subject) => subject.id === manualId);
    expect(manual?.sourceRefIds).toEqual([]);
  });

  it("replaces Picture 1 without leaving the previous person as Subject 1", async () => {
    invoke
      .mockResolvedValueOnce(mediaInfo())
      .mockResolvedValueOnce({ id: "asset_hash-laura", category: "reference", originalFileName: "laura.png", path: "C:/managed/laura.png", sizeBytes: 2048, sha256: "hash-laura", available: true })
      .mockResolvedValueOnce(
        mediaInfo({
          hash: "hash-cowgirl",
          path: "C:/refs/cowgirl.png",
          fileName: "cowgirl.png",
        }),
      );

    await useProject.getState().addReferences(["C:/refs/laura.png"]);
    useProject.getState().removeReference("hash-laura");
    await useProject.getState().addReferences(["C:/refs/cowgirl.png"]);

    const { project } = useProject.getState();
    const subjects = effectiveSubjects(project);
    expect(project.references).toHaveLength(1);
    expect(project.subjects).toHaveLength(1);
    expect(subjects[0]!.sourceRefIds).toEqual(["hash-cowgirl"]);
    expect(numberReferences(project.references).tag["hash-cowgirl"]).toBe("<Picture 1>");
  });
});

describe("planning the timeline", () => {
  it("creates evenly spaced cuts and never leaves Shot 1 with a timestamp", () => {
    useProject.getState().planShots(3);
    const { shots } = useProject.getState().project;

    expect(shots).toHaveLength(3);
    expect(shots[0]!.cutMs).toBeNull();
    expect(shots[1]!.cutMs).toBe(3333);
    expect(shots[2]!.cutMs).toBe(6667);
  });

  it("moves dialogue off a shot it removes instead of orphaning it", () => {
    useProject.getState().planShots(3);
    const before = useProject.getState().project.shots;
    useProject.getState().addDialogue(before[2]!.id);

    useProject.getState().planShots(1);
    const { shots, dialogue } = useProject.getState().project;

    expect(shots).toHaveLength(1);
    expect(dialogue[0]!.shotId).toBe(shots[0]!.id);
  });
});

describe("repairing a prompt", () => {
  const writerJson = JSON.stringify({
    summary: "A short clip of the referenced person.",
    styleSentence: "The target video uses a clean realistic aesthetic with soft lighting.",
    shots: [
      {
        index: 1,
        text: "A medium portrait framing centers the subject against a blurred interior while the camera holds nearly static.",
      },
    ],
    soundscape: "Soft indoor ambience.",
    music: "N/A",
  });

  it("re-renders deterministically instead of letting the model rewrite the prompt", async () => {
    invoke.mockResolvedValueOnce(mediaInfo());
    await useProject.getState().addReferences(["C:/refs/laura.png"]);

    useProject.setState((s) => ({
      generation: {
        ...s.generation,
        prompt: "algo roto",
        findings: [
          {
            severity: "error",
            rule: "shot.empty",
            section: "detailed_description",
            message: "[Shot 1] no tiene descripción.",
          },
        ],
      },
    }));

    invoke.mockResolvedValueOnce(writerJson);
    await useProject.getState().repair();

    const { prompt } = useProject.getState().generation;

    // The exact regression that broke the user's prompt: the model's own
    // formatting replacing the deterministic sections.
    expect(prompt).not.toContain("<Subject 1>:");
    expect(prompt).toContain("<Subject 1> is the person from <Picture 1>");
    expect([...prompt.matchAll(/^([a-z_]+):$/gm)].map((m) => m[1])).toEqual([
      "subject_definitions",
      "summary",
      "retention_analysis",
      "detailed_description",
      "overall_soundscape",
      "non_diegetic_music",
    ]);
    expect(prompt).toMatch(/^subject_definitions:/);
  });

  it("does nothing when no error is something the model could fix", async () => {
    invoke.mockResolvedValueOnce(mediaInfo());
    await useProject.getState().addReferences(["C:/refs/laura.png"]);

    useProject.setState((s) => ({
      generation: {
        ...s.generation,
        findings: [
          {
            severity: "error",
            rule: "shot.beyondDuration",
            section: "detailed_description",
            message: "El corte cae fuera de la duración.",
          },
        ],
      },
    }));

    invoke.mockClear();
    await useProject.getState().repair();
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("opening an older project", () => {
  it("materialises the missing Subject so the tab matches the prompt", async () => {
    const legacy = {
      ...createEmptyProject(),
      id: "legacy",
      references: [
        {
          id: "hash-wachi",
          path: "C:/refs/Wachi.jpg",
          fileName: "Wachi.jpg",
          kind: "image",
          sizeBytes: 87000,
          role: "identity",
          retention: "fully_preserved",
          note: "",
          analysis: { h3AttributeLine: "her exact facial geometry and outfit" },
        },
      ],
      subjects: [],
    };

    invoke.mockResolvedValueOnce(JSON.stringify(legacy));
    await useProject.getState().open("legacy");

    const { project } = useProject.getState();
    expect(project.subjects).toHaveLength(1);
    expect(project.subjects[0]!.sourceRefIds).toEqual(["hash-wachi"]);
    expect(project.subjects[0]!.attributes).toBe("her exact facial geometry and outfit");
    expect(project.subjects[0]!.managedSourceRefId).toBe("hash-wachi");
  });

  it("adopts the automatic Subject shape saved by older builds", async () => {
    const legacy = {
      ...createEmptyProject(),
      id: "legacy-subject",
      references: [
        {
          id: "hash-wachi",
          path: "C:/refs/Wachi.jpg",
          fileName: "Wachi.jpg",
          kind: "image",
          sizeBytes: 87000,
          role: "identity",
          retention: "fully_preserved",
          note: "",
        },
      ],
      subjects: [
        {
          id: "old-auto-subject",
          label: "Wachi",
          description: "the person",
          sourceRefIds: ["hash-wachi"],
          attributes: "her exact facial geometry",
          retention: "fully_preserved",
          appearsIn: [],
        },
      ],
    };

    invoke.mockResolvedValueOnce(JSON.stringify(legacy));
    await useProject.getState().open("legacy-subject");

    expect(useProject.getState().project.subjects[0]!.managedSourceRefId).toBe("hash-wachi");
    useProject.getState().removeReference("hash-wachi");
    expect(useProject.getState().project.subjects).toHaveLength(0);
  });

  it("re-validates the stored prompt instead of trusting it", async () => {
    const stale = {
      ...createEmptyProject(),
      id: "stale",
      // A prompt from an older build: sections empty, no reference cited.
      lastPrompt: "subject_definitions:\n\nsummary:\n\nhola",
      references: [
        {
          id: "hash-x",
          path: "C:/x.png",
          fileName: "x.png",
          kind: "image",
          sizeBytes: 10,
          role: "identity",
          retention: "fully_preserved",
          note: "",
        },
      ],
      subjects: [],
    };

    invoke.mockResolvedValueOnce(JSON.stringify(stale));
    await useProject.getState().open("stale");

    const { findings } = useProject.getState().generation;
    expect(findings.filter((f) => f.severity === "error").length).toBeGreaterThan(0);
    expect(findings.map((f) => f.rule)).toContain("reference.notCited");
  });

  it("fills in brief fields that did not exist when it was saved", async () => {
    const { continuityGuards: _drop, ...briefWithoutField } = createEmptyProject().brief;
    invoke.mockResolvedValueOnce(
      JSON.stringify({ ...createEmptyProject(), id: "old", brief: briefWithoutField }),
    );

    await useProject.getState().open("old");

    // The switch must not read "off" while the renderer emits the guards.
    expect(useProject.getState().project.brief.continuityGuards).toBe(true);
  });

  it("migrates projects without a skill profile to the permanent H3 base", async () => {
    const { h3Skill: _drop, ...legacy } = createEmptyProject();
    invoke.mockResolvedValueOnce(JSON.stringify({ ...legacy, id: "old-skill" }));

    await useProject.getState().open("old-skill");

    expect(useProject.getState().project.h3Skill).toMatchObject({
      baseId: "h3-prompt-writing",
      styleId: null,
      inputs: {},
    });
  });
});

describe("the safety net", () => {
  it("still derives a Subject for an unclaimed image loaded by an older project", async () => {
    invoke.mockResolvedValueOnce(mediaInfo());
    await useProject.getState().addReferences(["C:/refs/laura.png"]);

    // Simulate a project saved before the store created Subjects automatically.
    useProject.setState((s) => ({ project: { ...s.project, subjects: [] } }));

    const { project } = useProject.getState();
    const derived = effectiveSubjects(project);
    expect(derived).toHaveLength(1);
    expect(derived[0]!.sourceRefIds).toEqual(["hash-laura"]);
    expect(numberReferences(project.references).tag["hash-laura"]).toBe("<Picture 1>");
  });
});
