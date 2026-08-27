import { describe, expect, it } from "vitest";
import { formatTimestamp, renderPrompt, assignSpeakers } from "./render";
import { detectMode, numberReferences, taskPrefixes } from "./roles";
import {
  makeBrief,
  makeDialogue,
  makeProject,
  makeReference,
  makeShots,
  makeSubject,
} from "./testFixtures";
import type { WriterOutput } from "./types";

const writer: WriterOutput = {
  summary: "The target video is a 10-second vertical clip of <Subject 1> greeting the camera.",
  styleSentence: "The target video uses a clean realistic portrait aesthetic with soft lighting.",
  shots: [
    { index: 1, text: "<Subject 1> stands centered in a medium portrait framing." },
    { index: 2, text: "The camera pushes in with small amplitude at slow speed." },
  ],
  soundscape: "Very soft room ambience with subtle clothing movement.",
  music: "A light upbeat electronic melody kept low beneath the voice.",
};

describe("formatTimestamp", () => {
  it("renders MM:SS.mmm", () => {
    expect(formatTimestamp(0)).toBe("00:00.000");
    expect(formatTimestamp(4000)).toBe("00:04.000");
    expect(formatTimestamp(8500)).toBe("00:08.500");
    expect(formatTimestamp(65432)).toBe("01:05.432");
  });
});

describe("reference numbering", () => {
  it("numbers each media kind independently", () => {
    const refs = [
      makeReference({ id: "a", kind: "image" }),
      makeReference({ id: "b", kind: "video", role: "motion" }),
      makeReference({ id: "c", kind: "image" }),
      makeReference({ id: "d", kind: "audio", role: "voice" }),
    ];
    const { tag } = numberReferences(refs);
    expect(tag.a).toBe("<Picture 1>");
    expect(tag.c).toBe("<Picture 2>");
    expect(tag.b).toBe("<Video 1>");
    expect(tag.d).toBe("<Audio 1>");
  });
});

describe("mode detection", () => {
  it("falls back to text-only with no references", () => {
    expect(detectMode([])).toBe("t2va");
  });

  it("detects first+last frame", () => {
    const refs = [
      makeReference({ id: "a", role: "first-frame" }),
      makeReference({ id: "b", role: "last-frame" }),
    ];
    expect(detectMode(refs)).toBe("fl2va");
  });

  it("uses full-reference as soon as a subject role appears", () => {
    const refs = [
      makeReference({ id: "a", role: "first-frame" }),
      makeReference({ id: "b", role: "identity" }),
    ];
    expect(detectMode(refs)).toBe("full-reference");
  });

  it("uses full-reference when audio is involved", () => {
    expect(detectMode([makeReference({ id: "a", kind: "audio", role: "voice" })])).toBe(
      "full-reference",
    );
  });
});

describe("task prefixes", () => {
  it("combines applicable types", () => {
    const refs = [
      makeReference({ id: "a", role: "identity" }),
      makeReference({ id: "b", role: "last-frame" }),
      makeReference({ id: "c", kind: "audio", role: "voice", retention: "reference" }),
    ];
    expect(taskPrefixes(refs)).toEqual([
      "keyframe completion",
      "reference generation",
      "audio reference",
    ]);
  });
});

describe("speaker assignment", () => {
  it("numbers speakers in the order of vocal events", () => {
    const project = makeProject({
      subjects: [
        makeSubject({ id: "a", label: "A" }),
        makeSubject({ id: "b", label: "B" }),
      ],
      dialogue: [
        makeDialogue({ id: "l2", shotId: "shot-2", subjectIds: ["b"], text: "Segundo." }),
        makeDialogue({ id: "l1", shotId: "shot-1", subjectIds: ["a"], text: "Primero." }),
      ],
    });
    const speakers = assignSpeakers(project);
    expect(speakers.get("a")).toBe("S1");
    expect(speakers.get("b")).toBe("S2");
  });
});

describe("renderPrompt — full reference", () => {
  const prompt = renderPrompt({ project: makeProject(), writer, mode: "full-reference" });

  it("emits the six sections in the required order", () => {
    const order = [...prompt.matchAll(/^([a-z_]+):$/gm)].map((m) => m[1]);
    expect(order).toEqual([
      "subject_definitions",
      "summary",
      "retention_analysis",
      "detailed_description",
      "overall_soundscape",
      "non_diegetic_music",
    ]);
  });

  it("gives Shot 1 no timestamp and later shots a cut time", () => {
    expect(prompt).toContain("[Shot 1] <Subject 1> stands centered");
    expect(prompt).toContain("[Shot 2] At 00:04.000,");
    expect(prompt).not.toMatch(/\[Shot 1\]\s+At /);
  });

  it("prepends the task-type prefix to summary", () => {
    expect(prompt).toContain("[reference generation] The target video is a 10-second");
  });

  it("keeps the literal dialogue inside a language-tagged <d>", () => {
    expect(prompt).toContain("<d>[Spanish] ¡Hola! Qué gusto verte.</d>");
    expect(prompt).toContain("<Subject 1> (S1) smiles warmly and says,");
  });

  it("cites the source picture inside the subject definition", () => {
    expect(prompt).toContain("<Subject 1> is the young woman from <Picture 1>, preserving");
  });

  it("emits the no-text block when the policy forbids text", () => {
    expect(prompt).toContain("NO visible text or numbers anywhere in the video.");
  });

  it("lowercases the continuation after a cut timestamp", () => {
    expect(prompt).toContain("At 00:04.000, the camera pushes in");
  });
});

describe("renderPrompt — voiceover and cutoff", () => {
  it("uses the explicit voiceover wording and the closed-lips note", () => {
    const project = makeProject({
      dialogue: [makeDialogue({ voiceover: true, delivery: "" })],
    });
    const prompt = renderPrompt({ project, writer, mode: "full-reference" });
    expect(prompt).toContain("says in an off-screen voiceover:");
    expect(prompt).toContain("while their lips remain completely closed.");
  });

  it("puts <cutoff> at the end of an interrupted line", () => {
    const project = makeProject({
      dialogue: [makeDialogue({ cutoff: true, text: "¡No abras esa puerta porque..." })],
    });
    const prompt = renderPrompt({ project, writer, mode: "full-reference" });
    expect(prompt).toContain("¡No abras esa puerta porque... <cutoff></d>");
  });

  it("splits a scenetrans line across the cut", () => {
    const project = makeProject({
      dialogue: [
        makeDialogue({
          scenetrans: true,
          text: "Y fue entonces cuando <scenetrans> todo cambió.",
        }),
      ],
    });
    const prompt = renderPrompt({ project, writer, mode: "full-reference" });
    expect(prompt).toContain("<d>[Spanish] Y fue entonces cuando <scenetrans>");
    expect(prompt).toContain("The audio continues seamlessly across the cut as");
    expect(prompt).toContain("<d>[Spanish] <scenetrans> todo cambió.</d>");
  });

  it("renders joint speakers as (S1,S2)", () => {
    const project = makeProject({
      subjects: [makeSubject({ id: "a" }), makeSubject({ id: "b", label: "Luis" })],
      dialogue: [makeDialogue({ subjectIds: ["a", "b"], text: "¡Vamos!", delivery: "shout together and" })],
    });
    const prompt = renderPrompt({ project, writer, mode: "full-reference" });
    expect(prompt).toContain("<Subject 1> and <Subject 2> (S1,S2)");
  });
});

describe("renderPrompt — simple modes", () => {
  it("writes the FL2VA alignment line", () => {
    const project = makeProject({
      brief: makeBrief({ durationSec: 8, visibleTextPolicy: "unrestricted" }),
      references: [
        makeReference({ id: "first", role: "first-frame" }),
        makeReference({ id: "last", role: "last-frame" }),
      ],
      subjects: [],
      dialogue: [],
      shots: makeShots(1),
    });
    const prompt = renderPrompt({
      project,
      writer: { ...writer, shots: [{ index: 1, text: "The shot begins from <Picture 1>." }] },
      mode: "fl2va",
    });
    expect(prompt).toContain(
      "How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 1) aligns with the 8.00-second mark of the target video.",
    );
    expect(prompt).toContain("integrated_multimodal_description:");
    expect(prompt).not.toContain("subject_definitions:");
  });

  it("writes the I2VA alignment line", () => {
    const project = makeProject({
      references: [makeReference({ id: "first", role: "first-frame" })],
      subjects: [],
      dialogue: [],
      shots: makeShots(1),
    });
    const prompt = renderPrompt({ project, writer, mode: "i2va" });
    expect(prompt).toContain(
      "For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.",
    );
  });
});
