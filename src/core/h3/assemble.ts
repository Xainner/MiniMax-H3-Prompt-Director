import { MODE_LABELS, numberReferences, roleMeta, taskPrefixes } from "./roles";
import {
  requestsWardrobeChange,
  subjectAttributesForPrompt,
  subjectRetentionForPrompt,
} from "./intent";
import {
  assignSpeakers,
  constraintBlocks,
  effectiveSubjects,
  formatTimestamp,
  shotLabel,
  subjectTag,
} from "./render";
import type { Finding, H3Mode, Project, WriterOutput, WriterWindowOutput } from "./types";

/**
 * The brief handed to the writer model. It carries every fact the model needs
 * and nothing it is allowed to invent: tags, roles, retention levels, shot
 * timings and the exact dialogue that the app — not the model — will emit.
 */
export function buildWriterBrief(project: Project, mode: H3Mode): string {
  const numbering = numberReferences(project.references);
  const speakers = assignSpeakers(project);
  const { brief } = project;

  const lines: string[] = [];
  const push = (s = "") => lines.push(s);

  push(`TARGET MODE: ${MODE_LABELS[mode]}`);
  push(`DURATION: ${brief.durationSec} seconds`);
  push(`ASPECT RATIO: ${brief.aspectRatio}`);
  push(`TASK TYPES (the app will prepend these to summary): [${taskPrefixes(project.references).join(" + ")}]`);
  push();

  push("USER IDEA:");
  push(brief.idea.trim() || "(no idea supplied — build a coherent short video from the references)");
  push();

  const wardrobeChange = requestsWardrobeChange(brief);
  if (wardrobeChange) {
    push("USER-REQUESTED SUBJECT TRANSFORMATION — HIGHEST PRIORITY:");
    push(
      "Preserve the referenced person's identity, but DO NOT preserve the source wardrobe or accessories. The source outfit is observational context only. Apply the user's requested appearance from the first frame and never describe the source clothes as still worn, preserved, or unchanged.",
    );
    push();
  }

  if (brief.styleNote.trim()) {
    push("REQUESTED STYLE / TONE:");
    push(brief.styleNote.trim());
    push();
  }

  push("REFERENCES (use these tags exactly, never invent others):");
  if (project.references.length === 0) {
    push("(none — this is a text-only generation)");
  } else {
    for (const ref of project.references) {
      const meta = roleMeta(ref.role);
      const tag = numbering.tag[ref.id] ?? "<?>";
      const identityOnly = wardrobeChange && ref.role === "identity";
      push(
        `- ${tag} — role: ${ref.role} (${meta.label}) — retention: ${identityOnly ? "identity only; source wardrobe excluded" : ref.retention}`,
      );
      if (ref.note.trim()) push(`    note: ${ref.note.trim()}`);
      const a = ref.analysis;
      if (a) {
        if (a.identity) push(`    identity: ${a.identity}`);
        if (!identityOnly) {
          if (a.summary) push(`    seen: ${a.summary}`);
          if (a.wardrobe) push(`    wardrobe: ${a.wardrobe}`);
          if (a.environment) push(`    environment: ${a.environment}`);
          if (a.lighting) push(`    lighting: ${a.lighting}`);
          if (a.composition) push(`    composition: ${a.composition}`);
          if (a.style) push(`    style: ${a.style}`);
          if (a.palette.length) push(`    palette: ${a.palette.join(", ")}`);
          if (a.objects.length) push(`    objects: ${a.objects.join(", ")}`);
          if (a.visibleText.length) {
            push(`    text visible in the reference: ${a.visibleText.map((t) => `"${t}"`).join(", ")}`);
          }
        }
      }
    }
  }
  push();

  const subjects = effectiveSubjects(project);
  push("SUBJECTS (already defined by the app — reference them by tag, never redefine them):");
  if (subjects.length === 0) {
    push("(none)");
  } else {
    subjects.forEach((s, i) => {
      const sources = s.sourceRefIds.map((id) => numbering.tag[id] ?? "<?>").join(", ");
      const speaker = speakers.get(s.id);
      const retention = subjectRetentionForPrompt(project, s);
      const attributes = subjectAttributesForPrompt(project, s);
      push(
        `- ${subjectTag(i)} = ${s.description || s.label}${sources ? ` (from ${sources})` : ""} — retention: ${retention}${speaker ? ` — speaker id: (${speaker})` : " — does not speak"}`,
      );
      if (attributes) push(`    preserve: ${attributes}`);
    });
  }
  push();

  const count = project.shots.length;
  push(
    `SHOT PLAN — the video has EXACTLY ${count} ${count === 1 ? "shot" : "shots"}. Write one entry per shot, matching these indexes:`,
  );
  project.shots.forEach((shot, i) => {
    const stamp = i === 0 ? "starts at 0.00s, NO timestamp" : `cut at ${formatTimestamp(shot.cutMs ?? 0)}`;
    push(`- shot ${i + 1} (${shotLabel(i)}): ${stamp}`);
    if (shot.beat.trim()) push(`    must cover: ${shot.beat.trim()}`);
  });
  if (count === 1) {
    push(
      "  This is a single continuous take. Do not describe any cut inside it — use camera movement and action for variety.",
    );
  }
  push();

  const dialogueByShot = project.dialogue.length > 0;
  push("DIALOGUE (the app emits these verbatim — do NOT write them, but leave room for them):");
  if (!dialogueByShot) {
    push("(no dialogue)");
  } else {
    project.dialogue.forEach((line) => {
      const shotIndex = project.shots.findIndex((s) => s.id === line.shotId);
      const who =
        line.subjectIds.length > 0
          ? line.subjectIds
              .map((id) => {
                const idx = subjects.findIndex((s) => s.id === id);
                return idx >= 0 ? subjectTag(idx) : "?";
              })
              .join(" + ")
          : "off-screen narrator";
      const words = line.text.trim().split(/\s+/).filter(Boolean).length;
      push(
        `- ${shotLabel(Math.max(0, shotIndex))}: ${who}${line.voiceover ? " (voiceover)" : ""} — ${words} words in ${line.language}`,
      );
    });
  }
  push();

  push("VISIBLE TEXT POLICY:");
  if (brief.visibleTextPolicy === "none") {
    push("No visible text or numbers anywhere. Do not quote any on-screen string.");
  } else if (brief.visibleTextPolicy === "allow-list") {
    const allowed = brief.allowedText.map((t) => t.trim()).filter(Boolean);
    push(
      allowed.length > 0
        ? `The only strings that may appear on screen are: ${allowed.map((t) => `"${t}"`).join(", ")}. Quote them exactly, never translate them, never add others.`
        : "No visible text is allowed.",
    );
  } else {
    push("Visible text is unrestricted, but keep it deliberate and spell it exactly.");
  }
  push();

  // The renderer emits these verbatim. Repeating them would double the prompt.
  const blocks = constraintBlocks(project, subjects);
  if (blocks.length > 0) {
    push("BLOCKS THE APP INSERTS INTO detailed_description — do NOT repeat any of them,");
    push("but write shot prose that is consistent with them:");
    push();
    push(blocks.join("\n\n"));
    push();
  }

  if (brief.extraConstraints.trim()) {
    push("HARD CONSTRAINTS FROM THE USER (highest priority, §49):");
    push(brief.extraConstraints.trim());
    push();
  }

  push("MODE-SPECIFIC REQUIREMENT:");
  push(modeRequirement(project, mode, numbering.tag));

  return lines.join("\n");
}

function modeRequirement(
  project: Project,
  mode: H3Mode,
  tags: Record<string, string>,
): string {
  const images = project.references.filter((r) => r.kind === "image");
  const first = images.find((r) => r.role === "first-frame");
  const last = images.find((r) => r.role === "last-frame");

  switch (mode) {
    case "i2va":
      return `${first ? tags[first.id] : "<Picture 1>"} is the exact frame at 0.00 seconds. Develop the action forward from it and never contradict it.`;
    case "fl2va":
      return `Describe the continuous physical path from ${first ? tags[first.id] : "<Picture 1>"} to ${last ? tags[last.id] : "<Picture 2>"}. Do not merely describe both images; describe the transformation between them.`;
    case "l2va":
      return `Infer a plausible earlier state and converge progressively toward ${last ? tags[last.id] : "<Picture 1>"} by the final moment.`;
    case "t2va":
      return "There are no reference frames. Build the whole timeline from the idea.";
    default: {
      const lastFrame = last ? tags[last.id] : null;
      return lastFrame
        ? `In the final shot, state that the composition progressively converges toward ${lastFrame} and matches it at the end.`
        : "Keep identity, wardrobe and props continuous across every shot.";
    }
  }
}

// ---- repair pass --------------------------------------------------------------

/**
 * The repair pass re-runs the writer with the violations appended to the brief,
 * so the app re-renders the prompt afterwards. It deliberately does NOT hand the
 * model the assembled prompt: a model asked to "fix" a prompt rewrites the
 * deterministic sections in its own style and drops the reference citations.
 */
export function buildRepairSection(findings: Finding[]): string {
  const problems = findings.map((f) => `- ${f.message}`).join("\n");

  return [
    "PREVIOUS ATTEMPT FAILED VALIDATION.",
    "Your previous prose caused the problems below. Write the JSON again, fixing them.",
    "Change only what the problems require; keep the rest of your intent.",
    "",
    problems || "- (none)",
  ].join("\n");
}

// ---- lenient JSON parsing ------------------------------------------------------

export function extractJson(raw: string): unknown {
  const trimmed = stripFences(raw);
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end <= start) {
      throw new Error("El modelo no devolvió JSON.");
    }
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

function stripFences(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  const withoutOpen = trimmed.replace(/^```[a-zA-Z]*\s*/, "");
  return withoutOpen.replace(/```\s*$/, "").trim();
}

export function parseWriterOutput(raw: string, expectedShots: number): WriterOutput {
  const data = extractJson(raw) as Record<string, unknown>;

  const shots = Array.isArray(data.shots)
    ? data.shots
        .map((s, i) => {
          const item = (s ?? {}) as Record<string, unknown>;
          return {
            index: typeof item.index === "number" ? item.index : i + 1,
            text: typeof item.text === "string" ? item.text : "",
          };
        })
        .sort((a, b) => a.index - b.index)
    : [];

  // Never silently drop a shot: an empty body is caught by the validator.
  for (let i = 1; i <= expectedShots; i += 1) {
    if (!shots.some((s) => s.index === i)) shots.push({ index: i, text: "" });
  }
  shots.sort((a, b) => a.index - b.index);

  return {
    summary: asString(data.summary),
    styleSentence: asString(data.styleSentence),
    shots,
    soundscape: asString(data.soundscape),
    music: asString(data.music) || "N/A",
    retentionNotes: asRecord(data.retentionNotes),
  };
}

export function parseWindowOutput(raw: string, expected: number): WriterWindowOutput {
  const data = extractJson(raw) as Record<string, unknown>;
  const windows = Array.isArray(data.windows)
    ? data.windows.map((w, i) => {
        const item = (w ?? {}) as Record<string, unknown>;
        return {
          index: typeof item.index === "number" ? item.index : i + 1,
          text: asString(item.text),
          endState: asString(item.endState),
        };
      })
    : [];

  for (let i = 1; i <= expected; i += 1) {
    if (!windows.some((w) => w.index === i)) windows.push({ index: i, text: "", endState: "" });
  }
  windows.sort((a, b) => a.index - b.index);
  return { windows };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
