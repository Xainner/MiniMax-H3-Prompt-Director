import { describe, expect, it } from "vitest";
import { buildWriterBrief } from "./assemble";
import { renderWindows, validateWindows } from "./multiWindow";
import { renderPrompt } from "./render";
import { detectMode, numberReferences, taskPrefixes } from "./roles";
import {
  makeBrief,
  makeDialogue,
  makeProject,
  makeReference,
  makeShots,
  makeSubject,
} from "./testFixtures";
import { validatePrompt } from "./validate";
import type { H3Mode, Project, WriterOutput } from "./types";

/**
 * A walk through `docs/MiniMax_H3_Prompting_Guide_ES.md`, scenario by scenario.
 * Each block names the section it enforces so a future change to the renderer
 * has to argue with the guide, not with a nameless assertion.
 */

const writer: WriterOutput = {
  summary: "The target video shows the referenced subjects in a short branded clip.",
  styleSentence: "The target video uses a clean realistic aesthetic with soft directional lighting.",
  shots: [
    { index: 1, text: "A medium framing establishes the scene." },
    { index: 2, text: "The camera pushes in with small amplitude at slow speed." },
  ],
  soundscape: "Soft indoor ambience with subtle clothing movement.",
  music: "N/A",
};

function render(project: Project, mode?: H3Mode, output: WriterOutput = writer) {
  const resolved = mode ?? project.brief.forcedMode ?? detectMode(project.references);
  const prompt = renderPrompt({ project, writer: output, mode: resolved });
  const findings = validatePrompt(prompt, project, resolved);
  return { prompt, findings, errors: findings.filter((f) => f.severity === "error") };
}

// ---- §1 generation modes ------------------------------------------------------

describe("§1.1 T2VA — text only", () => {
  const project = makeProject({ references: [], subjects: [], dialogue: [], shots: makeShots(2) });

  it("uses integrated_multimodal_description and no subject_definitions", () => {
    const { prompt, errors } = render(project, "t2va");
    expect(prompt).toContain("integrated_multimodal_description:");
    expect(prompt).not.toContain("subject_definitions:");
    expect(prompt).toContain("overall_soundscape:");
    expect(prompt).toContain("non_diegetic_music:");
    expect(errors).toEqual([]);
  });

  it("is what mode detection picks with no references", () => {
    expect(detectMode([])).toBe("t2va");
  });
});

describe("§1.2 I2VA — the image is the frame at 0.00s", () => {
  const project = makeProject({
    references: [makeReference({ id: "first", role: "first-frame" })],
    subjects: [],
    dialogue: [],
    shots: makeShots(1),
  });

  it("opens with the alignment sentence and develops from the frame", () => {
    const { prompt, errors } = render(project, "i2va", { ...writer, shots: [writer.shots[0]!] });
    expect(prompt.startsWith("For the target video, at 0.00 seconds into the target video,")).toBe(true);
    expect(prompt).toContain("<Picture 1> (from [Shot 1]) is fully referenced.");
    expect(prompt).toContain("The shot begins from <Picture 1>.");
    expect(errors).toEqual([]);
  });
});

describe("§1.3 FL2VA — describe the path between both frames", () => {
  const project = makeProject({
    brief: makeBrief({ durationSec: 8 }),
    references: [
      makeReference({ id: "first", role: "first-frame" }),
      makeReference({ id: "last", role: "last-frame" }),
    ],
    subjects: [],
    dialogue: [],
    shots: makeShots(1),
  });

  it("aligns Picture 1 to 0.00s and Picture 2 to the end", () => {
    const { prompt, errors } = render(project, "fl2va", { ...writer, shots: [writer.shots[0]!] });
    expect(prompt).toContain(
      "Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 1) aligns with the 8.00-second mark",
    );
    expect(prompt).toContain("The shot begins from <Picture 1>.");
    expect(prompt).toContain("progressively converges toward <Picture 2>");
    expect(errors).toEqual([]);
  });

  it("is what mode detection picks for exactly one first and one last frame", () => {
    expect(detectMode(project.references)).toBe("fl2va");
  });
});

describe("§1.4 L2VA — converge toward the supplied last frame", () => {
  const project = makeProject({
    references: [makeReference({ id: "last", role: "last-frame" })],
    subjects: [],
    dialogue: [],
    shots: makeShots(1),
  });

  it("aligns the picture to the end of the video", () => {
    const { prompt, errors } = render(project, "l2va", { ...writer, shots: [writer.shots[0]!] });
    expect(prompt).toContain("<Picture 1> (from [Shot 1]) aligns with the 10.00-second mark");
    expect(prompt).toContain("progressively converges toward <Picture 1>");
    expect(errors).toEqual([]);
  });
});

// ---- §2–§5 references and subjects --------------------------------------------

describe("§2 Full-Reference — the six sections in order", () => {
  it("emits exactly the required order", () => {
    const { prompt, errors } = render(makeProject());
    expect([...prompt.matchAll(/^([a-z_]+):$/gm)].map((m) => m[1])).toEqual([
      "subject_definitions",
      "summary",
      "retention_analysis",
      "detailed_description",
      "overall_soundscape",
      "non_diegetic_music",
    ]);
    expect(errors).toEqual([]);
  });
});

describe("§4.3 + §46 — an image is a source, never the moving character", () => {
  it("cites a loaded image even when the user defined no Subject", () => {
    // The reported failure: one image in the rail, nothing else touched.
    const project = makeProject({
      references: [makeReference({ id: "solo", fileName: "laura.png", role: "identity" })],
      subjects: [],
      dialogue: [],
    });

    const { prompt, errors } = render(project);
    expect(prompt).toContain("<Picture 1>");
    expect(prompt).toContain("<Subject 1> is the person from <Picture 1>");
    expect(errors).toEqual([]);
  });

  it("flags a prompt where a loaded reference is never mentioned", () => {
    const project = makeProject();
    const { prompt } = render(project);
    const stripped = prompt.replaceAll("<Picture 1>", "the woman");
    const rules = validatePrompt(stripped, project, "full-reference").map((f) => f.rule);
    expect(rules).toContain("reference.notCited");
  });
});

describe("§4.1 — one Subject drawing on several references", () => {
  it("names each source with its own clause", () => {
    const project = makeProject({
      references: [
        makeReference({ id: "face", role: "identity" }),
        makeReference({ id: "outfit", role: "wardrobe" }),
        makeReference({ id: "walk", kind: "video", role: "motion", note: "walking motion" }),
      ],
      subjects: [
        makeSubject({
          description: "the woman",
          sourceRefIds: ["face", "outfit", "walk"],
          attributes: "her identity and the outfit colors",
        }),
      ],
      dialogue: [],
    });

    const { prompt, errors } = render(project);
    expect(prompt).toContain(
      "<Subject 1> is the woman, whose facial identity and physical appearance come from <Picture 1>, whose outfit comes from <Picture 2>, and whose motion, gesture, and body timing are referenced from <Video 1>, preserving her identity and the outfit colors.",
    );
    expect(errors).toEqual([]);
  });
});

describe("§4.2 — one image defining several Subjects", () => {
  it("lets both Subjects cite the same Picture", () => {
    const project = makeProject({
      references: [makeReference({ id: "scene", role: "identity" })],
      subjects: [
        makeSubject({ id: "a", description: "the woman", sourceRefIds: ["scene"] }),
        makeSubject({ id: "b", description: "the red leather jacket", sourceRefIds: ["scene"] }),
      ],
      dialogue: [],
    });

    const { prompt, errors } = render(project);
    expect(prompt).toContain("<Subject 1> is the woman from <Picture 1>");
    expect(prompt).toContain("<Subject 2> is the red leather jacket from <Picture 1>");
    expect(errors).toEqual([]);
  });
});

describe("§5 — a Picture with a role of its own is defined and then used", () => {
  it("defines the keyframe and uses it inside its shot", () => {
    const shots = makeShots(2);
    const project = makeProject({
      references: [
        makeReference({ id: "face", role: "identity" }),
        makeReference({ id: "key", role: "keyframe", shotId: shots[1]!.id }),
      ],
      subjects: [makeSubject({ sourceRefIds: ["face"] })],
      shots,
      dialogue: [],
    });

    const { prompt, errors } = render(project);
    expect(prompt).toContain("<Picture 2> is the keyframe for [Shot 2]");
    expect(prompt).toContain("The shot's keyframe corresponds to <Picture 2>.");
    expect(errors).toEqual([]);
  });
});

// ---- §6–§7 video and audio ----------------------------------------------------

describe("§6 — whole-video relationships", () => {
  it("describes an edit source and locks its structure", () => {
    const project = makeProject({
      references: [makeReference({ id: "src", kind: "video", role: "edit-source" })],
      subjects: [],
      dialogue: [],
    });

    const { prompt, errors } = render(project);
    expect(prompt).toContain("<Video 1> is the source video being edited");
    expect(prompt).toContain("Preserve the camera movement, timing, shot structure");
    expect(taskPrefixes(project.references)).toContain("video editing");
    expect(errors).toEqual([]);
  });

  it("describes a continuation source", () => {
    const project = makeProject({
      references: [makeReference({ id: "src", kind: "video", role: "continuation" })],
      subjects: [],
      dialogue: [],
    });
    const { prompt } = render(project);
    expect(prompt).toContain("whose final audiovisual state is continued by the target video");
    expect(taskPrefixes(project.references)).toContain("video continuation");
  });
});

describe("§6.1 — a person inside a video is still a Subject", () => {
  it("defines the Subject from the Video tag", () => {
    const project = makeProject({
      references: [makeReference({ id: "clip", kind: "video", role: "motion" })],
      subjects: [makeSubject({ description: "the woman", sourceRefIds: ["clip"] })],
      dialogue: [],
    });

    const { prompt, errors } = render(project);
    expect(prompt).toContain("<Subject 1> is the woman from <Video 1>");
    expect(errors).toEqual([]);
  });
});

describe("§7.1 — video and audio are numbered independently", () => {
  it("keeps Video 1 and Audio 1 as separate counters", () => {
    const refs = [
      makeReference({ id: "img", kind: "image" }),
      makeReference({ id: "vid", kind: "video", role: "camera", retention: "weak_reference" }),
      makeReference({ id: "aud", kind: "audio", role: "soundtrack", retention: "fully_copy" }),
    ];
    const { tag } = numberReferences(refs);
    expect(tag.img).toBe("<Picture 1>");
    expect(tag.vid).toBe("<Video 1>");
    expect(tag.aud).toBe("<Audio 1>");
  });

  it("uses the audio retention vocabulary, not the visual one", () => {
    const project = makeProject({
      references: [
        makeReference({ id: "face", role: "identity" }),
        makeReference({
          id: "track",
          kind: "audio",
          role: "soundtrack",
          retention: "fully_copy",
          note: "",
        }),
      ],
      subjects: [makeSubject({ sourceRefIds: ["face"] })],
      dialogue: [],
    });

    const { prompt, errors } = render(project);
    expect(prompt).toContain("<Audio 1> is the exact soundtrack reused throughout the target video.");
    expect(prompt).toContain("<Audio 1> (soundtrack): fully_copy -");
    expect(taskPrefixes(project.references)).toContain("audio reuse");
    expect(errors).toEqual([]);
  });
});

// ---- §9 task prefixes ---------------------------------------------------------

describe("§9 — task-type prefixes are combined with ' + '", () => {
  it("combines keyframe completion, reference generation and audio reference", () => {
    const project = makeProject({
      references: [
        makeReference({ id: "face", role: "identity" }),
        makeReference({ id: "last", role: "last-frame" }),
        makeReference({
          id: "voz",
          kind: "audio",
          role: "voice",
          retention: "reference",
          note: "voz cálida",
        }),
      ],
      subjects: [makeSubject({ sourceRefIds: ["face"] })],
    });

    const { prompt } = render(project);
    expect(prompt).toContain(
      "[keyframe completion + reference generation + audio reference] The target video",
    );
  });
});

// ---- §14–§18 speakers and dialogue --------------------------------------------

describe("§14.2 — several speakers on one line", () => {
  it("renders a joint speaker id", () => {
    const project = makeProject({
      subjects: [makeSubject({ id: "a" }), makeSubject({ id: "b", label: "Luis" })],
      dialogue: [
        makeDialogue({
          subjectIds: ["a", "b"],
          delivery: "shout together and",
          text: "¡Vamos!",
        }),
      ],
    });

    const { prompt, errors } = render(project);
    expect(prompt).toContain("<Subject 1> and <Subject 2> (S1,S2) shout together and says,");
    expect(errors).toEqual([]);
  });
});

describe("§16 — voice-over wording", () => {
  it("uses the explicit phrase and the closed-lips note", () => {
    const project = makeProject({ dialogue: [makeDialogue({ voiceover: true, delivery: "" })] });
    const { prompt, errors } = render(project);
    expect(prompt).toContain("says in an off-screen voiceover:");
    expect(prompt).toContain("while their lips remain completely closed.");
    expect(errors).toEqual([]);
  });

  it("describes a narrator that has no visible subject", () => {
    const project = makeProject({
      dialogue: [
        makeDialogue({
          subjectIds: [],
          voiceover: true,
          delivery: "A warm Latin-American female narrator",
          text: "Descubrí nuevas oportunidades.",
        }),
      ],
    });
    const { prompt, errors } = render(project);
    expect(prompt).toContain(
      "A warm Latin-American female narrator (S1) says in an off-screen voiceover: <d>[Spanish] Descubrí nuevas oportunidades.</d>",
    );
    expect(errors).toEqual([]);
  });
});

describe("§17 — a line that crosses the cut", () => {
  it("leaves the first half open and resumes it after the cut", () => {
    const project = makeProject({
      dialogue: [
        makeDialogue({
          scenetrans: true,
          text: "Y fue entonces cuando <scenetrans> todo cambió.",
        }),
      ],
    });
    const { prompt, errors } = render(project);
    expect(prompt).toContain("<d>[Spanish] Y fue entonces cuando <scenetrans>");
    expect(prompt).toContain("The audio continues seamlessly across the cut as");
    expect(prompt).toContain("<d>[Spanish] <scenetrans> todo cambió.</d>");
    expect(errors).toEqual([]);
  });
});

describe("§18 — an interrupted line", () => {
  it("puts <cutoff> at the end of the spoken words", () => {
    const project = makeProject({
      dialogue: [makeDialogue({ cutoff: true, text: "¡No abras esa puerta porque..." })],
    });
    const { prompt, errors } = render(project);
    expect(prompt).toContain("¡No abras esa puerta porque... <cutoff></d>");
    expect(errors).toEqual([]);
  });
});

// ---- §19–§21 text and numbers -------------------------------------------------

describe("§19–§21 — visible text and numbers", () => {
  it("forbids text and numbers when the policy is 'sin texto'", () => {
    const { prompt } = render(makeProject());
    expect(prompt).toContain("NO visible text or numbers anywhere in the video.");
    expect(prompt).toContain(
      "No numerical values, counters, percentages, prices, dates, ratings, or statistics appear anywhere.",
    );
  });

  it("quotes a single allowed phrase exactly", () => {
    const project = makeProject({
      brief: makeBrief({ visibleTextPolicy: "allow-list", allowedText: ["PUBLICÁ TU NEGOCIO"] }),
    });
    const { prompt } = render(project);
    expect(prompt).toContain(
      'The ONLY visible text allowed anywhere in the entire video is the exact phrase "PUBLICÁ TU NEGOCIO".',
    );
  });

  it("allow-lists a numeric value instead of forbidding all numbers", () => {
    const project = makeProject({
      brief: makeBrief({ visibleTextPolicy: "allow-list", allowedText: ["25%"] }),
    });
    const { prompt } = render(project);
    expect(prompt).toContain('The ONLY numerical values visible are "25%".');
  });

  it("adds the strong anti-microtext block when asked", () => {
    const project = makeProject({ brief: makeBrief({ antiMicrotext: true }) });
    const { prompt } = render(project);
    expect(prompt).toContain("no microtext");
    expect(prompt).toContain("Any interface-like element must be icon-only");
  });
});

// ---- §32–§35, §40 continuity guards -------------------------------------------

describe("§32–§34 — identity, wardrobe and duplicated people", () => {
  const project = makeProject();

  it("spells out what must not drift instead of saying 'same woman'", () => {
    const { prompt } = render(project);
    expect(prompt).toContain(
      "Preserve <Subject 1>'s exact facial identity throughout the entire video: same facial geometry, eye shape, nose shape, lips, jawline, skin tone, hairstyle, hairline, apparent age, and facial proportions. No face morphing or identity drift.",
    );
  });

  it("locks the wardrobe", () => {
    const { prompt } = render(project);
    expect(prompt).toContain("remains in the exact same outfit throughout every shot");
    expect(prompt).toContain("No wardrobe change occurs.");
  });

  it("forbids cloned subjects without treating Subject count as total people", () => {
    const { prompt } = render(project);
    expect(prompt).not.toContain("Exactly one person is visible");
    expect(prompt).toContain("There is exactly one instance of <Subject 1>.");

    const two = makeProject({
      subjects: [makeSubject({ id: "a" }), makeSubject({ id: "b", label: "Luis" })],
      dialogue: [],
    });
    expect(render(two).prompt).not.toContain("Exactly two people are visible");
    expect(render(two).prompt).toContain(
      "There is exactly one instance of each of <Subject 1> and <Subject 2>.",
    );
  });

  it("preserves identity but unlocks source wardrobe when the request changes it", () => {
    const changed = makeProject({
      brief: makeBrief({
        idea: "Conserva su identidad, pero sin bikini y con un atuendo completamente nuevo.",
      }),
      references: [
        makeReference({
          analysis: {
            summary: "A woman wearing a pink bikini.",
            subjectType: "person",
            identity: "long dark hair, brown eyes, and a soft jawline",
            wardrobe: "hot pink triangle bikini top",
            objects: [],
            environment: "bedroom",
            lighting: "soft natural light",
            palette: ["pink"],
            composition: "portrait",
            style: "photorealistic",
            visibleText: [],
            h3AttributeLine: "long dark hair, brown eyes, hot pink triangle bikini top",
          },
        }),
      ],
      subjects: [
        makeSubject({ attributes: "long dark hair, brown eyes, hot pink triangle bikini top" }),
      ],
      dialogue: [],
    });

    const { prompt } = render(changed);
    const writerBrief = buildWriterBrief(changed, "full-reference");
    expect(prompt).toContain("<Subject 1> is the young woman from <Picture 1>, preserving long dark hair, brown eyes, and a soft jawline; exact facial identity");
    expect(prompt).toContain("partially_preserved - preserve exact facial identity");
    expect(prompt).not.toContain("hot pink triangle bikini top");
    expect(prompt).not.toContain("No wardrobe change occurs.");
    expect(writerBrief).toContain("source wardrobe excluded");
    expect(writerBrief).not.toContain("hot pink triangle bikini top");
  });

  it("can be turned off for footage where people should vary", () => {
    const off = makeProject({ brief: makeBrief({ continuityGuards: false }) });
    expect(render(off).prompt).not.toContain("No face morphing or identity drift.");
  });
});

describe("§35 + §40 — supplied screens and logos are not to be reinvented", () => {
  it("locks a supplied screen", () => {
    const project = makeProject({
      references: [makeReference({ id: "shot", role: "screen" })],
      subjects: [makeSubject({ description: "the exact screen content", sourceRefIds: ["shot"] })],
      dialogue: [],
    });
    const { prompt, errors } = render(project);
    expect(prompt).toContain(
      "The screen must display <Subject 1> exactly as supplied. Do not redesign, reinterpret, animate, replace, crop into a different interface, invent new pages, generate fake UI, or change any text.",
    );
    expect(errors).toEqual([]);
  });

  it("locks a logo", () => {
    const project = makeProject({
      references: [makeReference({ id: "logo", role: "logo" })],
      subjects: [makeSubject({ description: "the exact logo", sourceRefIds: ["logo"] })],
      dialogue: [],
    });
    const { prompt, errors } = render(project);
    expect(prompt).toContain(
      "Do not redesign, redraw, distort, recolor, mirror, crop, simplify, add text to, or replace <Subject 1>.",
    );
    expect(errors).toEqual([]);
  });
});

// ---- §43–§44 aspect ratio -----------------------------------------------------

describe("§43–§44 — composition guidance per aspect ratio", () => {
  it("gives vertical guidance for 9:16", () => {
    const { prompt } = render(makeProject());
    expect(prompt).toContain("Create a 9:16 vertical composition optimized for mobile viewing.");
    expect(prompt).toContain("central vertical safe area");
  });

  it("gives widescreen guidance for 16:9", () => {
    const project = makeProject({ brief: makeBrief({ aspectRatio: "16:9" }) });
    expect(render(project).prompt).toContain(
      "Create a 16:9 widescreen composition with balanced horizontal spacing.",
    );
  });
});

// ---- §30–§31 Maestro multi-window ---------------------------------------------

describe("§30–§31 — Maestro windows are self-contained and never replay", () => {
  const project = makeProject({
    multiWindow: { enabled: true, windows: 2, carryMotionAndSound: true },
    dialogue: [],
  });

  const windows = renderWindows(project, {
    windows: [
      { index: 1, text: "She walks toward the blue door.", endState: "her hand on the handle" },
      { index: 2, text: "She opens the door and steps through.", endState: "her back to camera" },
    ],
  });

  it("produces exactly one non-empty line per window", () => {
    expect(windows).toHaveLength(2);
    for (const text of windows) {
      expect(text).not.toContain("\n");
      expect(text.trim().length).toBeGreaterThan(0);
    }
  });

  it("repeats the subject definitions and the hard rules in every window", () => {
    for (const text of windows) {
      expect(text).toContain("<Subject 1>");
      expect(text).toContain("Global rules:");
      expect(text).toContain("No face morphing or identity drift.");
    }
  });

  it("chains the closing state into the next window's opening state", () => {
    expect(windows[0]).toContain("End this window with her hand on the handle");
    expect(windows[1]).toContain(
      "Continue natively from the exact previous state: her hand on the handle",
    );
    expect(windows[1]).toContain("Do not restart, restage, or replay completed actions.");
  });

  it("passes its own validation", () => {
    expect(validateWindows(windows, project).filter((f) => f.severity === "error")).toEqual([]);
  });
});
