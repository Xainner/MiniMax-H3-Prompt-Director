import { describe, expect, it } from "vitest";
import { renderPrompt } from "./render";
import { validatePrompt } from "./validate";
import { validateWindows } from "./multiWindow";
import { makeBrief, makeDialogue, makeProject, makeReference, makeShots, makeSubject } from "./testFixtures";
import type { Project, WriterOutput } from "./types";

const writer: WriterOutput = {
  summary: "The target video shows <Subject 1> greeting the camera.",
  styleSentence: "The target video uses a clean realistic portrait aesthetic.",
  shots: [
    { index: 1, text: "<Subject 1> stands centered in a medium portrait framing." },
    { index: 2, text: "The camera pushes in with small amplitude." },
  ],
  soundscape: "Soft room ambience.",
  music: "N/A",
};

function goodPrompt(project: Project = makeProject()): string {
  return renderPrompt({ project, writer, mode: "full-reference" });
}

function rules(project: Project, prompt: string): string[] {
  return validatePrompt(prompt, project, "full-reference").map((f) => f.rule);
}

describe("a correctly rendered prompt", () => {
  it("produces no errors", () => {
    const project = makeProject();
    const findings = validatePrompt(goodPrompt(project), project, "full-reference");
    expect(findings.filter((f) => f.severity === "error")).toEqual([]);
  });
});

describe("section rules", () => {
  it("flags a missing section", () => {
    const project = makeProject();
    const broken = goodPrompt(project).replace(/overall_soundscape:[\s\S]*?\n\n/, "");
    expect(rules(project, broken)).toContain("section.missing");
  });

  it("flags sections in the wrong order", () => {
    const project = makeProject();
    const prompt = goodPrompt(project);
    const swapped = prompt
      .replace("subject_definitions:", "__TMP__")
      .replace("summary:", "subject_definitions:")
      .replace("__TMP__", "summary:");
    expect(rules(project, swapped)).toContain("section.order");
  });
});

describe("shot rules (§12)", () => {
  it("rejects a timestamp on Shot 1", () => {
    const project = makeProject();
    const broken = goodPrompt(project).replace("[Shot 1] ", "[Shot 1] At 00:00.000, ");
    expect(rules(project, broken)).toContain("shot.firstTimestamp");
  });

  it("rejects non-increasing timestamps", () => {
    const project = makeProject({ shots: makeShots(3) });
    const three = { ...writer, shots: [...writer.shots, { index: 3, text: "The scene closes." }] };
    const prompt = renderPrompt({ project, writer: three, mode: "full-reference" });
    const broken = prompt.replace("[Shot 3] At 00:08.000,", "[Shot 3] At 00:02.000,");
    expect(rules(project, broken)).toContain("shot.monotonic");
  });

  it("rejects a cut past the declared duration", () => {
    const project = makeProject({ brief: makeBrief({ durationSec: 3 }) });
    expect(rules(project, goodPrompt(project))).toContain("shot.beyondDuration");
  });

  it("rejects a shot header with no description", () => {
    const project = makeProject();
    const empty = { ...writer, shots: [writer.shots[0]!, { index: 2, text: "" }] };
    const prompt = renderPrompt({ project, writer: empty, mode: "full-reference" });
    expect(rules(project, prompt)).toContain("shot.empty");
  });

  it("rejects a gap in shot numbering", () => {
    const project = makeProject();
    const broken = goodPrompt(project).replace("[Shot 2] At", "[Shot 3] At");
    expect(rules(project, broken)).toContain("shot.numbering");
  });
});

describe("dialogue rules (§15, §46)", () => {
  it("rejects an unclosed <d>", () => {
    const project = makeProject();
    const broken = goodPrompt(project).replace("verte.</d>", "verte.");
    expect(rules(project, broken)).toContain("dialogue.unbalanced");
  });

  it("rejects acting instructions inside the language tag", () => {
    const project = makeProject();
    const broken = goodPrompt(project).replace("<d>[Spanish]", "<d>[Spanish, sad]");
    expect(rules(project, broken)).toContain("dialogue.actingInsideTag");
  });

  it("rejects a <d> with no language tag", () => {
    const project = makeProject();
    const broken = goodPrompt(project).replace("<d>[Spanish] ", "<d>");
    expect(rules(project, broken)).toContain("dialogue.missingLanguage");
  });

  it("catches literal dialogue that was rewritten", () => {
    const project = makeProject();
    const broken = goodPrompt(project).replace("¡Hola! Qué gusto verte.", "Hello, nice to see you.");
    expect(rules(project, broken)).toContain("dialogue.rewritten");
  });

  it("accepts a legitimate scenetrans split", () => {
    const project = makeProject({
      dialogue: [
        makeDialogue({ scenetrans: true, text: "Y fue entonces cuando <scenetrans> todo cambió." }),
      ],
    });
    const findings = validatePrompt(goodPrompt(project), project, "full-reference");
    expect(findings.filter((f) => f.severity === "error")).toEqual([]);
  });
});

describe("speaker rules (§14, §46)", () => {
  it("rejects a subject whose speaker id changes mid-prompt", () => {
    const project = makeProject();
    const prompt = goodPrompt(project);
    const broken = `${prompt}\n\n<Subject 1> (S2) says, <d>[Spanish] Otra línea.</d>`;
    expect(rules(project, broken)).toContain("speaker.unstable");
  });

  it("rejects a gap in speaker numbering", () => {
    const project = makeProject();
    const broken = goodPrompt(project).replace("(S1)", "(S2)");
    expect(rules(project, broken)).toContain("speaker.gap");
  });
});

describe("reference rules (§3, §46)", () => {
  it("rejects a Picture used as a moving character", () => {
    const project = makeProject();
    const broken = goodPrompt(project).replace(
      "<Subject 1> stands centered",
      "<Picture 1> walks into the room and stands centered",
    );
    expect(rules(project, broken)).toContain("reference.pictureAsSubject");
  });

  it("rejects a tag that was never defined", () => {
    const project = makeProject();
    const broken = goodPrompt(project).replace(
      "the camera pushes in",
      "<Subject 4> enters and the camera pushes in",
    );
    const found = rules(project, broken);
    expect(found).toContain("reference.undefined");
    expect(found).toContain("reference.numbering");
  });

  it("warns about a reference that is defined but never used", () => {
    const project = makeProject({
      references: [
        makeReference(),
        makeReference({ id: "unused", kind: "video", role: "camera", retention: "weak_reference" }),
      ],
    });
    expect(rules(project, goodPrompt(project))).toContain("reference.unused");
  });
});

describe("visible text rules (§19, §20)", () => {
  it("rejects on-screen text when the policy forbids it", () => {
    const project = makeProject();
    const broken = goodPrompt(project).replace(
      "stands centered",
      'stands centered beside a sign reading "OFERTA"',
    );
    expect(rules(project, broken)).toContain("text.notAllowed");
  });

  it("accepts text that is on the allow list", () => {
    const project = makeProject({
      brief: makeBrief({ visibleTextPolicy: "allow-list", allowedText: ["PUBLICÁ TU NEGOCIO"] }),
    });
    const custom = {
      ...writer,
      shots: [
        { index: 1, text: 'A large sign reading "PUBLICÁ TU NEGOCIO" appears centered.' },
        writer.shots[1]!,
      ],
    };
    const prompt = renderPrompt({ project, writer: custom, mode: "full-reference" });
    const found = validatePrompt(prompt, project, "full-reference");
    expect(found.filter((f) => f.rule === "text.notAllowed")).toEqual([]);
  });

  it("rejects text that is not on the allow list", () => {
    const project = makeProject({
      brief: makeBrief({ visibleTextPolicy: "allow-list", allowedText: ["PUBLICÁ"] }),
    });
    const custom = {
      ...writer,
      shots: [{ index: 1, text: 'A sign reading "COMPRÁ YA" appears.' }, writer.shots[1]!],
    };
    const prompt = renderPrompt({ project, writer: custom, mode: "full-reference" });
    expect(rules(project, prompt)).toContain("text.notAllowed");
  });
});

describe("density warnings (§12.3, §37)", () => {
  it("warns when there are too many cuts for the duration", () => {
    const project = makeProject({
      brief: makeBrief({ durationSec: 5 }),
      shots: makeShots(5, 900),
    });
    const many = {
      ...writer,
      shots: [1, 2, 3, 4, 5].map((index) => ({ index, text: "the camera holds steady." })),
    };
    const prompt = renderPrompt({ project, writer: many, mode: "full-reference" });
    expect(rules(project, prompt)).toContain("shot.density");
  });

  it("warns when the dialogue does not fit the duration", () => {
    const project = makeProject({
      brief: makeBrief({ durationSec: 5 }),
      dialogue: [
        makeDialogue({
          text: "Esta es una línea de diálogo deliberadamente larga que jamás entraría en cinco segundos de video por más rápido que se hable.",
        }),
      ],
    });
    expect(rules(project, goodPrompt(project))).toContain("dialogue.density");
  });
});

describe("cuts inside a shot (§12)", () => {
  // Taken verbatim from a real generation: one shot in the timeline, four cuts
  // narrated inside it.
  const crammed =
    "The video opens with a medium shot framing <Subject 1> from the thighs up. As the beat drops, the scene cuts rapidly to a close-up of <Subject 1>'s upper body. Another quick cut transitions to a low-angle shot looking up at <Subject 1>.";

  it("rejects a cut narrated inside Shot 1", () => {
    const project = makeProject({ shots: makeShots(1), dialogue: [] });
    const prompt = renderPrompt({
      project,
      writer: { ...writer, shots: [{ index: 1, text: crammed }] },
      mode: "full-reference",
    });
    expect(rules(project, prompt)).toContain("shot.internalCut");
  });

  it("allows a later shot to announce its own cut in its first sentence", () => {
    const project = makeProject({ dialogue: [] });
    const prompt = renderPrompt({
      project,
      writer: {
        ...writer,
        shots: [
          writer.shots[0]!,
          { index: 2, text: "The camera cuts to a tighter medium close-up as she turns." },
        ],
      },
      mode: "full-reference",
    });
    expect(rules(project, prompt)).not.toContain("shot.internalCut");
  });

  it("rejects an extra cut later inside a shot that already had one", () => {
    const project = makeProject({ dialogue: [] });
    const prompt = renderPrompt({
      project,
      writer: {
        ...writer,
        shots: [
          writer.shots[0]!,
          {
            index: 2,
            text: "The camera cuts to a tighter framing. She raises a hand. Another quick cut transitions to a low angle.",
          },
        ],
      },
      mode: "full-reference",
    });
    expect(rules(project, prompt)).toContain("shot.internalCut");
  });

  it("warns when the idea asks for several takes but the timeline has one shot", () => {
    const project = makeProject({
      brief: makeBrief({
        idea: "Una persona bailando, que tenga varias tomas de la persona bailando",
      }),
      shots: makeShots(1),
      dialogue: [],
    });
    const prompt = renderPrompt({
      project,
      writer: { ...writer, shots: [writer.shots[0]!] },
      mode: "full-reference",
    });
    expect(rules(project, prompt)).toContain("shot.planTooShort");
  });
});

describe("music placement (§24)", () => {
  it("warns when the soundscape carries the music and non_diegetic_music is N/A", () => {
    const project = makeProject({ dialogue: [] });
    const prompt = renderPrompt({
      project,
      writer: {
        ...writer,
        soundscape: "Punchy, rhythmic bass beats typical of viral dance trends.",
        music: "N/A",
      },
      mode: "full-reference",
    });
    expect(rules(project, prompt)).toContain("audio.musicInSoundscape");
  });

  it("stays quiet when the music section is filled in", () => {
    const project = makeProject({ dialogue: [] });
    const prompt = renderPrompt({
      project,
      writer: {
        ...writer,
        soundscape: "Punchy bass beats and crowd ambience.",
        music: "A 110 BPM electronic track with a driving synth bass.",
      },
      mode: "full-reference",
    });
    expect(rules(project, prompt)).not.toContain("audio.musicInSoundscape");
  });
});

describe("retention markers", () => {
  it("does not print the marker twice when the model echoes it", () => {
    const project = makeProject({ dialogue: [] });
    const prompt = renderPrompt({
      project,
      writer: {
        ...writer,
        retentionNotes: {
          "<Subject 1>": "fully_preserved - exact facial geometry and outfit remain consistent.",
        },
      },
      mode: "full-reference",
    });
    expect(prompt).not.toContain("fully_preserved - fully_preserved");
    expect(prompt).toContain(
      "<Subject 1> (appears in [Shot 1], [Shot 2]): fully_preserved - exact facial geometry and outfit remain consistent.",
    );
  });
});

describe("request consistency", () => {
  it("rejects source-wardrobe preservation when the request removes it", () => {
    const project = makeProject({
      brief: makeBrief({ idea: "Conserva su identidad, pero sin bikini." }),
      dialogue: [],
    });
    const broken = `${goodPrompt(project)}\nNo wardrobe change occurs.`;
    expect(rules(project, broken)).toContain("intent.wardrobeConflict");
  });

  it("rejects a one-person limit when the request includes a partner", () => {
    const project = makeProject({
      brief: makeBrief({ idea: "La mujer aparece con su pareja." }),
      dialogue: [],
    });
    const broken = `${goodPrompt(project)}\nExactly one person is visible.`;
    expect(rules(project, broken)).toContain("intent.peopleConflict");
  });

  it("rejects muting vocalizations that the user requested", () => {
    const project = makeProject({
      brief: makeBrief({ idea: "Include soft moaning and a male groan." }),
      dialogue: [],
    });
    const broken = goodPrompt(project).replace(
      "Soft room ambience.",
      "Soft room ambience. No distinct dialogue or vocalizations occur.",
    );
    expect(rules(project, broken)).toContain("intent.audioConflict");
  });
});

describe("camera prose (§13.4)", () => {
  it("warns about a disconnected camera keyword list", () => {
    const project = makeProject();
    const broken = goodPrompt(project).replace(
      "<Subject 1> stands centered in a medium portrait framing.",
      "cinematic, pan, zoom, tracking, dolly",
    );
    expect(rules(project, broken)).toContain("camera.keywordList");
  });

  it("does not flag a natural camera sentence", () => {
    const project = makeProject();
    const fine = goodPrompt(project).replace(
      "the camera pushes in with small amplitude.",
      "The camera slowly tracks backward while <Subject 1> advances toward the lens, then performs a small pan right.",
    );
    expect(rules(project, fine)).not.toContain("camera.keywordList");
  });
});

describe("audio sections (§22)", () => {
  it("rejects a dialogue tag inside overall_soundscape", () => {
    const project = makeProject();
    const broken = goodPrompt(project).replace(
      "Soft room ambience.",
      "Soft room ambience. <d>[Spanish] ¡Hola!</d>",
    );
    expect(rules(project, broken)).toContain("audio.dialogueTag");
  });

  it("warns when the audio section repeats the spoken line", () => {
    const project = makeProject();
    const broken = goodPrompt(project).replace(
      "Soft room ambience.",
      "Soft room ambience while she says ¡Hola! Qué gusto verte.",
    );
    expect(rules(project, broken)).toContain("audio.dialogueRepeat");
  });
});

describe("subject strength (§34, §46)", () => {
  it("warns when a fully_preserved subject says nothing about what to preserve", () => {
    const project = makeProject({
      subjects: [makeSubject({ attributes: "" })],
      dialogue: [],
    });
    expect(rules(project, goodPrompt(project))).toContain("subject.weakDefinition");
  });

  it("stays quiet when the attributes are spelled out", () => {
    const project = makeProject();
    expect(rules(project, goodPrompt(project))).not.toContain("subject.weakDefinition");
  });
});

describe("shot substance (§11)", () => {
  it("warns about a shot reduced to a plot summary", () => {
    const project = makeProject();
    const thin = { ...writer, shots: [{ index: 1, text: "She greets." }, writer.shots[1]!] };
    const prompt = renderPrompt({ project, writer: thin, mode: "full-reference" });
    expect(rules(project, prompt)).toContain("shot.thin");
  });
});

describe("multi-window rules (§30)", () => {
  const project = makeProject({
    subjects: [makeSubject()],
    multiWindow: { enabled: true, windows: 2, carryMotionAndSound: true },
  });

  it("rejects a window containing line breaks", () => {
    const findings = validateWindows(
      ["<Subject 1> is the young woman. Line one.\nLine two.", "Continue natively. <Subject 1> keeps walking."],
      project,
    );
    expect(findings.map((f) => f.rule)).toContain("window.multiline");
  });

  it("rejects a later window that never declares continuity", () => {
    const findings = validateWindows(
      ["<Subject 1> enters the room.", "<Subject 1> enters the room again."],
      project,
    );
    expect(findings.map((f) => f.rule)).toContain("window.noContinuity");
  });

  it("warns when a window omits a subject definition", () => {
    const findings = validateWindows(
      ["<Subject 1> enters the room.", "Continue natively. The camera holds steady."],
      project,
    );
    expect(findings.map((f) => f.rule)).toContain("window.missingSubject");
  });

  it("warns when a window replays the previous one", () => {
    const shared =
      "she walks slowly across the tiled floor toward the blue door while the camera tracks her from behind at a steady pace";
    const findings = validateWindows(
      [`<Subject 1> Global rules: none. ${shared}`, `<Subject 1> Global rules: none. Continue natively. ${shared}`],
      project,
    );
    expect(findings.map((f) => f.rule)).toContain("window.replay");
  });
});
