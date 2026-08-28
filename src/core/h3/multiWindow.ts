import { MODE_LABELS, numberReferences, roleMeta, taskPrefixes } from "./roles";
import { assignSpeakers, constraintBlocks, effectiveSubjects, subjectTag } from "./render";
import type { Finding, H3Mode, Project, WriterWindowOutput } from "./types";

/**
 * Maestro manual multi-window (§30–31): one non-empty line per window, every
 * window self-contained, no window replaying a completed action.
 */

export function buildWindowBrief(project: Project, mode: H3Mode, requestedCount?: number): string {
  const numbering = numberReferences(project.references);
  const speakers = assignSpeakers(project);
  const count = Math.max(1, requestedCount ?? project.multiWindow.windows);
  const perWindow = project.brief.durationSec / count;

  const lines: string[] = [];
  const push = (s = "") => lines.push(s);

  push(`TARGET: Maestro manual multi-window, ${count} windows, ${MODE_LABELS[mode]}`);
  push(`Each window covers roughly ${perWindow.toFixed(1)} seconds of a ${project.brief.durationSec}s ${project.brief.aspectRatio} sequence.`);
  push(`TASK TYPES: [${taskPrefixes(project.references).join(" + ")}]`);
  push();

  push("USER IDEA:");
  push(project.brief.idea.trim() || "(build a coherent sequence from the references)");
  push();

  if (project.brief.styleNote.trim()) {
    push("REQUESTED STYLE / TONE:");
    push(project.brief.styleNote.trim());
    push();
  }

  push("REFERENCES (tags are fixed — the app repeats their definitions in every window):");
  for (const ref of project.references) {
    const tag = numbering.tag[ref.id] ?? "<?>";
    push(`- ${tag} — ${ref.role} (${roleMeta(ref.role).label}) — retention: ${ref.retention}`);
    if (ref.note.trim()) push(`    note: ${ref.note.trim()}`);
    if (ref.analysis?.summary) push(`    seen: ${ref.analysis.summary}`);
    if (ref.analysis?.identity) push(`    identity: ${ref.analysis.identity}`);
  }
  push();

  push("SUBJECTS:");
  project.subjects.forEach((s, i) => {
    const speaker = speakers.get(s.id);
    push(`- ${subjectTag(i)} = ${s.description || s.label}${speaker ? ` — speaker (${speaker})` : ""}`);
  });
  push();

  if (project.dialogue.length > 0) {
    push("DIALOGUE (write it inline in the window where it belongs, using <d>[Language] …</d> verbatim):");
    project.dialogue.forEach((line) => {
      const who =
        line.subjectIds.length > 0
          ? line.subjectIds
              .map((id) => {
                const idx = project.subjects.findIndex((s) => s.id === id);
                return idx >= 0 ? subjectTag(idx) : "?";
              })
              .join(" + ")
          : "off-screen narrator";
      push(`- ${who}${line.voiceover ? " (voiceover)" : ""}: <d>[${line.language}] ${line.text.trim()}</d>`);
    });
    push();
  }

  push("STORY BEATS PER WINDOW:");
  project.shots.forEach((shot, i) => {
    if (shot.beat.trim()) push(`- beat ${i + 1}: ${shot.beat.trim()}`);
  });
  push();

  push("CONTINUITY REQUIREMENT:");
  push(
    project.multiWindow.carryMotionAndSound
      ? "Maestro carries motion and sound between windows. Favor physical continuity: continue natively, preserve the exact final body state, continue the existing camera trajectory, and let audio continue seamlessly."
      : "Motion and sound are not carried automatically. Restate the inherited state explicitly at the start of each window.",
  );
  push();

  const blocks = constraintBlocks(project, effectiveSubjects(project));
  if (blocks.length > 0) {
    push("The app repeats these rules in EVERY window; do not repeat them yourself,");
    push("but keep every window consistent with them:");
    push();
    push(blocks.join("\n\n"));
    push();
  }

  if (project.brief.extraConstraints.trim()) {
    push("HARD CONSTRAINTS:");
    push(project.brief.extraConstraints.trim());
  }

  return lines.join("\n");
}

/**
 * The shared header repeated in every window (§30.1). Windows are not allowed
 * to assume anything defined only in window 1.
 */
function windowHeader(project: Project): string {
  const numbering = numberReferences(project.references);
  const speakers = assignSpeakers(project);
  const subjects = effectiveSubjects(project);

  const parts: string[] = [];

  subjects.forEach((s, i) => {
    const sources = s.sourceRefIds.map((id) => numbering.tag[id]).filter(Boolean).join(" and ");
    const speaker = speakers.get(s.id);
    const attrs = s.attributes.trim().replace(/\.$/, "");
    parts.push(
      `${subjectTag(i)}${speaker ? ` (${speaker})` : ""} is ${s.description || s.label}${sources ? ` from ${sources}` : ""}${attrs ? `, preserving ${attrs}` : ""}.`,
    );
  });

  for (const ref of project.references) {
    if (!roleMeta(ref.role).standalone) continue;
    const tag = numbering.tag[ref.id];
    if (!tag) continue;
    parts.push(`${tag} provides the ${roleMeta(ref.role).label.toLowerCase()} reference.`);
  }

  // Every window must be self-contained (§30.1), so the same guards travel with
  // each one, flattened onto a single line.
  const rules = constraintBlocks(project, subjects).map((block) =>
    block.replace(/^[A-Z][A-Z —:]+:\n/, "").replace(/\s*\n+\s*/g, " "),
  );
  if (project.brief.extraConstraints.trim()) {
    rules.push(project.brief.extraConstraints.trim().replace(/\s*\n+\s*/g, " "));
  }

  parts.push(`Global rules: ${rules.join(" ")}`);
  return parts.join(" ");
}

export function renderWindows(project: Project, output: WriterWindowOutput): string[] {
  const header = windowHeader(project);
  const style = project.brief.styleNote.trim() || "cinematic";
  const aspect = project.brief.aspectRatio;

  return output.windows.map((w, i) => {
    const body = w.text.replace(/\s*\n+\s*/g, " ").trim();
    const endState = w.endState.replace(/\s*\n+\s*/g, " ").trim();
    const previous = i > 0 ? output.windows[i - 1]?.endState.replace(/\s*\n+\s*/g, " ").trim() : "";

    const opening =
      i === 0
        ? `Create a ${aspect} ${style} sequence.`
        : `Continue natively from the exact previous state: ${previous || "the previous window's closing composition"}. Do not restart, restage, or replay completed actions.`;

    const closing = endState
      ? ` End this window with ${endState}, preserving position, camera, lighting, and any motion still in progress for native continuation.`
      : "";

    return `${header} ${opening} ${body}${closing}`.replace(/\s+/g, " ").trim();
  });
}

/** §30.2 / §46: a window must not replay what the previous one already did. */
export function validateWindows(windows: string[], project: Project): Finding[] {
  const findings: Finding[] = [];

  windows.forEach((text, i) => {
    if (text.includes("\n")) {
      findings.push({
        severity: "error",
        rule: "window.multiline",
        section: `ventana ${i + 1}`,
        message: "Maestro lee una línea no vacía por ventana: esta contiene saltos de línea.",
      });
    }
    if (text.trim().length === 0) {
      findings.push({
        severity: "error",
        rule: "window.empty",
        section: `ventana ${i + 1}`,
        message: "La ventana está vacía.",
      });
    }
    if (i > 0 && !/continue natively|continue from|inherited/i.test(text)) {
      findings.push({
        severity: "error",
        rule: "window.noContinuity",
        section: `ventana ${i + 1}`,
        message: "Toda ventana posterior a la primera debe declarar que continúa nativamente (§30.4).",
      });
    }
    for (let s = 0; s < project.subjects.length; s += 1) {
      if (!text.includes(subjectTag(s))) {
        findings.push({
          severity: "warning",
          rule: "window.missingSubject",
          section: `ventana ${i + 1}`,
          message: `${subjectTag(s)} no aparece en esta ventana. Cada ventana debe ser autosuficiente (§30.1).`,
        });
      }
    }
  });

  // Story reset detection: a long verbatim run shared with the previous window
  // is the signature of window 2 replaying window 1 (§30.2).
  for (let i = 1; i < windows.length; i += 1) {
    const current = windows[i] ?? "";
    const previous = windows[i - 1] ?? "";
    if (sharesLongRun(previous, current)) {
      findings.push({
        severity: "warning",
        rule: "window.replay",
        section: `ventana ${i + 1}`,
        message: "Esta ventana repite un tramo largo de la anterior: puede estar reiniciando la acción (§30.2).",
      });
    }
  }

  return findings;
}

/** Ignores the shared header, which is repeated on purpose. */
function sharesLongRun(previous: string, current: string): boolean {
  const marker = "Global rules:";
  const prevBody = previous.slice(previous.indexOf(marker) + marker.length);
  const currBody = current.slice(current.indexOf(marker) + marker.length);

  const words = prevBody.split(/\s+/).filter(Boolean);
  const window = 14;
  for (let i = 0; i + window <= words.length; i += 1) {
    const run = words.slice(i, i + window).join(" ");
    if (run.length > 60 && currBody.includes(run)) return true;
  }
  return false;
}
