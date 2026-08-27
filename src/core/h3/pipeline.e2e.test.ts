import { beforeAll, describe, expect, it } from "vitest";
import { buildWriterBrief, parseWindowOutput, parseWriterOutput } from "./assemble";
import { buildWindowBrief, renderWindows, validateWindows } from "./multiWindow";
import { renderPrompt } from "./render";
import { detectMode } from "./roles";
import { multiWindowSystemPrompt, writerSystemPrompt } from "./systemPrompt";
import { makeBrief, makeDialogue, makeProject, makeReference, makeShots, makeSubject } from "./testFixtures";
import { validatePrompt } from "./validate";
import type { Project } from "./types";

/**
 * End-to-end through a real OpenAI-compatible endpoint: brief → HTTP → JSON →
 * deterministic render → validation. Everything except the Tauri IPC hop, which
 * the Rust suite covers.
 *
 * Point it at any endpoint (a local LM Studio / Ollama works) with:
 *   H3_TEST_ENDPOINT=http://127.0.0.1:8799/v1 H3_TEST_MODEL=my-model pnpm test
 * The suite skips itself when nothing is listening.
 */
const ENDPOINT = process.env.H3_TEST_ENDPOINT ?? "http://127.0.0.1:8799/v1";
const MODEL = process.env.H3_TEST_MODEL ?? "mock-writer";

let reachable = false;

async function chat(system: string, user: string): Promise<string> {
  const response = await fetch(`${ENDPOINT}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2,
      max_tokens: 4096,
      stream: false,
    }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content ?? "";
}

function seededProject(): Project {
  const identity = makeReference({ id: "ref-identity", fileName: "laura.png", role: "identity" });
  const lastFrame = makeReference({
    id: "ref-last",
    fileName: "cierre.png",
    role: "last-frame",
    note: "",
  });
  const shots = makeShots(2, 5000);

  return makeProject({
    name: "E2E",
    brief: makeBrief({
      idea: "Laura saluda a cámara y presenta la marca en un local luminoso.",
      durationSec: 10,
      extraConstraints: "Exactly one person is visible. No wardrobe change.",
    }),
    references: [identity, lastFrame],
    subjects: [makeSubject({ sourceRefIds: ["ref-identity"] })],
    shots,
    dialogue: [makeDialogue({ shotId: shots[0]!.id })],
    multiWindow: { enabled: true, windows: 2, carryMotionAndSound: true },
  });
}

beforeAll(async () => {
  try {
    await chat("ping", "ping");
    reachable = true;
  } catch {
    reachable = false;
  }
});

describe.runIf(!process.env.H3_SKIP_E2E)("pipeline against a live endpoint", () => {
  it("turns a brief into a validated Full-Reference prompt", async ({ skip }) => {
    if (!reachable) skip(`no hay endpoint escuchando en ${ENDPOINT}`);

    const project = seededProject();
    const mode = detectMode(project.references);
    expect(mode).toBe("full-reference");

    const raw = await chat(writerSystemPrompt(), buildWriterBrief(project, mode));
    const writer = parseWriterOutput(raw, project.shots.length);
    const prompt = renderPrompt({ project, writer, mode });
    const findings = validatePrompt(prompt, project, mode);

    // `H3_PRINT=1 pnpm test` dumps the prompt for eyeballing a new model.
    if (process.env.H3_PRINT) console.log(`\n${prompt}\n`);

    expect(findings.filter((f) => f.severity === "error")).toEqual([]);

    // Structural guarantees that must hold regardless of what the model wrote.
    expect(prompt).toMatch(
      /^subject_definitions:[\s\S]*\nsummary:[\s\S]*\nretention_analysis:[\s\S]*\ndetailed_description:[\s\S]*\noverall_soundscape:[\s\S]*\nnon_diegetic_music:/,
    );
    expect(prompt).toContain("<Subject 1> is the young woman from <Picture 1>, preserving");
    expect(prompt).toContain("<Picture 2> is the exact final composition of [Shot 2]");
    // retention_analysis stays in English and uses a frame-appropriate note.
    expect(prompt).toContain(
      "<Picture 2> (final frame): fully_preserved - preserve the final camera angle, subject placement, lighting, and composition.",
    );
    expect(prompt).toContain("[keyframe completion + reference generation]");
    expect(prompt).toMatch(/\[Shot 1\] (?!At )/);
    expect(prompt).toContain("[Shot 2] At 00:05.000,");
    expect(prompt).toContain("<Subject 1> (S1) smiles warmly and says, <d>[Spanish] ¡Hola! Qué gusto verte.</d>");
    expect(prompt).toContain("NO visible text or numbers anywhere in the video.");
  });

  it("turns the same brief into self-contained Maestro windows", async ({ skip }) => {
    if (!reachable) skip(`no hay endpoint escuchando en ${ENDPOINT}`);

    const project = seededProject();
    const mode = detectMode(project.references);

    const raw = await chat(multiWindowSystemPrompt(), buildWindowBrief(project, mode));
    const parsed = parseWindowOutput(raw, project.multiWindow.windows);
    const windows = renderWindows(project, parsed);
    const findings = validateWindows(windows, project);

    expect(windows).toHaveLength(2);
    for (const text of windows) {
      expect(text).not.toContain("\n");
      expect(text).toContain("<Subject 1>");
      expect(text).toContain("Global rules:");
    }
    expect(windows[1]).toContain("Continue natively from the exact previous state");
    expect(findings.filter((f) => f.severity === "error")).toEqual([]);
  });
});
