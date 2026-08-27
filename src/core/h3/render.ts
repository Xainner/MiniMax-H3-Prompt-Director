import { ANTI_MICROTEXT_BLOCK, NO_TEXT_BLOCK } from "./systemPrompt";
import { numberReferences, roleMeta, taskPrefixes } from "./roles";
import type {
  DialogueLine,
  H3Mode,
  Project,
  ReferenceItem,
  ReferenceRole,
  RefNumbering,
  ShotDef,
  SubjectDef,
  WriterOutput,
} from "./types";

/** `00:04.000` — the exact shape §12.2 asks for. */
export function formatTimestamp(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  const minutes = Math.floor(clamped / 60000);
  const seconds = Math.floor((clamped % 60000) / 1000);
  const millis = clamped % 1000;
  return `${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(millis, 3)}`;
}

function pad(n: number, width: number): string {
  return n.toString().padStart(width, "0");
}

export function subjectTag(index: number): string {
  return `<Subject ${index + 1}>`;
}

export function shotLabel(index: number): string {
  return `[Shot ${index + 1}]`;
}

// ---- speakers ----------------------------------------------------------------

const NARRATOR_KEY = "__narrator__";

/**
 * Speaker ids follow the order of actual vocal events (§14.1), so they are
 * derived from the dialogue timeline rather than from the subject list.
 */
export function assignSpeakers(project: Project): Map<string, string> {
  const shotOrder = new Map(project.shots.map((s, i) => [s.id, i]));
  const ordered = [...project.dialogue].sort((a, b) => {
    const sa = shotOrder.get(a.shotId) ?? Number.MAX_SAFE_INTEGER;
    const sb = shotOrder.get(b.shotId) ?? Number.MAX_SAFE_INTEGER;
    if (sa !== sb) return sa - sb;
    return project.dialogue.indexOf(a) - project.dialogue.indexOf(b);
  });

  const speakers = new Map<string, string>();
  for (const line of ordered) {
    const keys = line.subjectIds.length > 0 ? line.subjectIds : [NARRATOR_KEY];
    for (const key of keys) {
      if (!speakers.has(key)) speakers.set(key, `S${speakers.size + 1}`);
    }
  }
  return speakers;
}

function speakerIdFor(line: DialogueLine, speakers: Map<string, string>): string {
  const keys = line.subjectIds.length > 0 ? line.subjectIds : [NARRATOR_KEY];
  const ids = keys.map((k) => speakers.get(k)).filter(Boolean) as string[];
  return ids.join(",");
}

// ---- subject definitions (§8) ------------------------------------------------

const SOURCE_CLAUSE: Record<string, (tag: string) => string> = {
  identity: (t) => `whose facial identity and physical appearance come from ${t}`,
  wardrobe: (t) => `whose outfit comes from ${t}`,
  object: (t) => `sourced from ${t}`,
  environment: (t) => `whose setting comes from ${t}`,
  style: (t) => `whose visual style comes from ${t}`,
  logo: (t) => `sourced from ${t}`,
  screen: (t) => `whose exact screen content comes from ${t}`,
  "first-frame": (t) => `anchored to the composition of ${t}`,
  "last-frame": (t) => `anchored to the composition of ${t}`,
  keyframe: (t) => `anchored to the composition of ${t}`,
  composition: (t) => `anchored to the composition of ${t}`,
  "edit-source": (t) => `visible in ${t}`,
  continuation: (t) => `visible in ${t}`,
  camera: (t) => `whose camera behavior is referenced from ${t}`,
  "cut-rhythm": (t) => `whose cut rhythm is referenced from ${t}`,
  motion: (t) => `whose motion, gesture, and body timing are referenced from ${t}`,
  voice: (t) => `whose voice timbre comes from ${t}`,
  soundtrack: (t) => `whose audio comes from ${t}`,
  "music-style": (t) => `whose musical character comes from ${t}`,
  sfx: (t) => `whose sound effects come from ${t}`,
};

function renderSubjectLine(
  subject: SubjectDef,
  index: number,
  refs: Map<string, ReferenceItem>,
  numbering: RefNumbering,
): string {
  const tag = subjectTag(index);
  const description = subject.description.trim() || "the referenced visual content";
  const attrs = subject.attributes.trim().replace(/\.$/, "");

  const sources = subject.sourceRefIds
    .map((id) => ({ ref: refs.get(id), tag: numbering.tag[id] }))
    .filter((s): s is { ref: ReferenceItem; tag: string } => Boolean(s.ref && s.tag));

  if (sources.length === 0) {
    return `${tag} is ${description}${attrs ? `, preserving ${attrs}` : ""}.`;
  }

  if (sources.length === 1) {
    const only = sources[0]!;
    return `${tag} is ${description} from ${only.tag}${attrs ? `, preserving ${attrs}` : ""}.`;
  }

  const clauses = sources.map((s) => {
    const build = SOURCE_CLAUSE[s.ref.role] ?? ((t: string) => `sourced from ${t}`);
    return build(s.tag);
  });
  // §4.1 joins the final clause with "and".
  const last = clauses.pop()!;
  const joined = clauses.length > 0 ? `${clauses.join(", ")}, and ${last}` : last;
  return `${tag} is ${description}, ${joined}${attrs ? `, preserving ${attrs}` : ""}.`;
}

function shotRefLabel(ref: ReferenceItem, shots: ShotDef[]): string {
  if (ref.role === "first-frame") return shotLabel(0);
  if (ref.role === "last-frame") return shotLabel(Math.max(0, shots.length - 1));
  const idx = shots.findIndex((s) => s.id === ref.shotId);
  return shotLabel(idx >= 0 ? idx : 0);
}

/**
 * Definition line for a reference that carries a role of its own: a concrete
 * frame (§5), a whole-video relationship (§6) or an audio signal (§7).
 */
function renderStandaloneRefLine(
  ref: ReferenceItem,
  tag: string,
  shots: ShotDef[],
  firstSpeaker: string | null,
): string {
  const note = ref.note.trim();
  const suffix = note ? ` ${note.endsWith(".") ? note : `${note}.`}` : "";
  const shot = shotRefLabel(ref, shots);

  switch (ref.role) {
    case "first-frame":
      return `${tag} is the exact first frame of ${shot}, defining the camera angle, subject placement, lighting, and background layout.${suffix}`;
    case "last-frame":
      return `${tag} is the exact final composition of ${shot}, defining the camera angle, subject placement, lighting, and background layout.${suffix}`;
    case "keyframe":
      return `${tag} is the keyframe for ${shot}, defining the composition, subject placement, and lighting at that moment.${suffix}`;
    case "composition":
      return `${tag} is the composition anchor for ${shot}, defining the framing, subject placement, and camera angle.${suffix}`;
    case "edit-source":
      return `${tag} is the source video being edited, preserving its camera movement, timing, shot structure, environment, object interactions, and original action.${suffix}`;
    case "continuation":
      return `${tag} is the source video whose final audiovisual state is continued by the target video.${suffix}`;
    case "camera":
      return `${tag} provides the camera movement and tracking behavior.${suffix}`;
    case "cut-rhythm":
      return `${tag} provides the cut rhythm and temporal structure reference.${suffix}`;
    case "motion":
      return `${tag} provides the motion, body timing, and gesture reference.${suffix}`;
    case "voice":
      return firstSpeaker
        ? `${tag} is the voice-timbre reference for ${firstSpeaker}.${suffix}`
        : `${tag} is the voice-timbre reference for the target video's narration.${suffix}`;
    case "soundtrack":
      return `${tag} is the exact soundtrack reused throughout the target video.${suffix}`;
    case "music-style":
      return `${tag} provides only the musical rhythm, instrumentation, and energy reference without copying the original waveform.${suffix}`;
    case "sfx":
      return `${tag} provides the sound effects reused in the target video.${suffix}`;
    default:
      return `${tag} is a reference for the target video.${suffix}`;
  }
}

// ---- retention analysis (§10) ------------------------------------------------

const RETENTION_DEFAULT: Record<string, string> = {
  fully_preserved:
    "preserve the exact facial identity, hairstyle, outfit colors, geometry, and proportions established by the source.",
  partially_preserved: "preserve the defining features while allowing the rest to adapt to the scene.",
  attribute_transfer: "transfer only the described attributes onto the target subject.",
  weak_reference: "preserve only the general character of the reference, not its literal content.",
  fully_copy: "reuse the complete audio signal as the final soundtrack.",
  partially_copy: "reuse only the requested section of the audio signal.",
  reference: "reproduce the requested timbre and delivery without copying the source waveform.",
};

/**
 * retention_analysis is written in English (§2), and a frame or a whole-video
 * relationship needs a different default sentence than a character does.
 */
const ROLE_SCOPE: Record<ReferenceRole, { scope: string; note: string }> = {
  identity: { scope: "identity", note: "preserve the exact facial identity and physical appearance." },
  wardrobe: { scope: "wardrobe", note: "transfer the outfit design, colors, and materials." },
  object: { scope: "object", note: "preserve the object's exact geometry, colors, and markings." },
  environment: { scope: "environment", note: "preserve the setting's layout, materials, and depth cues." },
  style: { scope: "visual style", note: "preserve the palette, rendering, and lighting language only." },
  logo: { scope: "logo", note: "preserve the exact geometry, proportions, spacing, and colors. Do not redesign, recolor, mirror, crop, or add text." },
  screen: { scope: "screen content", note: "reproduce the supplied screen exactly. Do not redesign, reinterpret, or invent UI." },
  "first-frame": { scope: "first frame", note: "preserve the exact opening camera angle, subject placement, lighting, and composition." },
  "last-frame": { scope: "final frame", note: "preserve the final camera angle, subject placement, lighting, and composition." },
  keyframe: { scope: "keyframe", note: "preserve the composition, subject placement, and lighting at that moment." },
  composition: { scope: "composition anchor", note: "preserve the framing, subject placement, and camera angle." },
  "edit-source": { scope: "source video structure", note: "preserve the original camera movement, timing, environment, shot composition, object positions, and physical actions." },
  continuation: { scope: "continuation source", note: "continue from the source video's exact final audiovisual state." },
  camera: { scope: "camera behavior", note: "preserve only the camera movement and tracking character." },
  "cut-rhythm": { scope: "cut rhythm", note: "preserve only the pacing and cut structure." },
  motion: { scope: "motion and body timing", note: "reuse only the motion and timing, not unrelated visual content." },
  voice: { scope: "voice timbre", note: "follow the vocal timbre and speaking cadence." },
  soundtrack: { scope: "soundtrack", note: "reuse the complete audio signal as the final soundtrack." },
  "music-style": { scope: "musical character", note: "follow the rhythm, instrumentation, and energy without copying the waveform." },
  sfx: { scope: "sound effects", note: "reuse the referenced sound effects at the corresponding moments." },
};

const RETENTION_MARKERS =
  "fully_preserved|partially_preserved|attribute_transfer|weak_reference|fully_copy|partially_copy|reference";

/**
 * Models often echo the marker back inside the note ("fully_preserved - …"),
 * which would render as "fully_preserved - fully_preserved - …". The renderer
 * owns the marker, so strip any the model repeated.
 */
function stripRetentionPrefix(note: string): string {
  const pattern = new RegExp(`^\\s*(?:(?:${RETENTION_MARKERS})\\s*[-–—:]\\s*|[-–—:]\\s*)`, "i");
  let out = note.trim();
  let previous = "";
  while (out !== previous) {
    previous = out;
    out = out.replace(pattern, "").trim();
  }
  return out;
}

function retentionNote(
  key: string,
  writer: WriterOutput | null,
  fallbackKey: string,
  roleFallback?: string,
): string {
  const fromWriter = writer?.retentionNotes?.[key]?.trim();
  if (fromWriter) {
    const cleaned = stripRetentionPrefix(fromWriter);
    if (cleaned.length > 0) return cleaned;
  }
  return roleFallback ?? RETENTION_DEFAULT[fallbackKey] ?? "preserve the requested characteristics.";
}

function appearsClause(subject: SubjectDef, shots: ShotDef[]): string {
  const ids = subject.appearsIn.length > 0 ? subject.appearsIn : shots.map((s) => s.id);
  const labels = ids
    .map((id) => shots.findIndex((s) => s.id === id))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)
    .map((i) => shotLabel(i));
  return labels.length > 0 ? ` (appears in ${labels.join(", ")})` : "";
}

// ---- visible text (§19, §20) --------------------------------------------------

export function visibleTextBlock(project: Project): string | null {
  const { visibleTextPolicy, allowedText, antiMicrotext } = project.brief;

  const numbers = numbersSentence(project);
  const withExtras = (head: string) =>
    [head, numbers, antiMicrotext ? ANTI_MICROTEXT_BLOCK : null].filter(Boolean).join("\n\n");

  if (visibleTextPolicy === "none") return withExtras(NO_TEXT_BLOCK);

  if (visibleTextPolicy === "allow-list") {
    const cleaned = allowedText.map((t) => t.trim()).filter(Boolean);
    if (cleaned.length === 0) return withExtras(NO_TEXT_BLOCK);

    const quoted = cleaned.map((t) => `"${t}"`);
    const head =
      quoted.length === 1
        ? `VISIBLE TEXT — HIGHEST PRIORITY:\nThe ONLY visible text allowed anywhere in the entire video is the exact phrase ${quoted[0]}.`
        : `VISIBLE TEXT — HIGHEST PRIORITY:\nThe ONLY visible text allowed anywhere in the entire video is: ${quoted.join(", ")}. Each phrase must be spelled exactly as written.`;
    return withExtras(head);
  }

  const free = [numbers, antiMicrotext ? ANTI_MICROTEXT_BLOCK : null].filter(Boolean);
  return free.length > 0 ? free.join("\n\n") : null;
}

/** §21 — numbers are treated exactly like text, allow-listed or forbidden. */
function numbersSentence(project: Project): string | null {
  const { visibleTextPolicy, allowedText } = project.brief;
  if (visibleTextPolicy === "unrestricted") return null;

  const numeric = allowedText
    .map((t) => t.trim())
    .filter((t) => t && /\d/.test(t))
    .map((t) => `"${t}"`);

  if (visibleTextPolicy === "allow-list" && numeric.length > 0) {
    return `The ONLY numerical values visible are ${numeric.join(", ")}. No other counters, percentages, prices, dates, ratings, or statistics appear anywhere.`;
  }
  return "No numerical values, counters, percentages, prices, dates, ratings, or statistics appear anywhere.";
}

/**
 * The blocks the guide asks for explicitly when the situation calls for them:
 * composition for the aspect ratio (§43, §44), identity and wardrobe drift
 * (§33, §34), duplicated people (§32), logos (§40) and supplied screens (§35).
 * They are emitted by the app rather than requested from the model, because
 * they are the exact failures the guide says models produce on their own.
 */
export function constraintBlocks(project: Project, subjects: SubjectDef[]): string[] {
  const numbering = numberReferences(project.references);
  const blocks: string[] = [compositionBlock(project.brief.aspectRatio)];

  if (project.brief.continuityGuards !== false) {
    const guard = continuityBlock(project, subjects);
    if (guard) blocks.push(guard);
  }

  const assets = assetRules(project, subjects, numbering);
  if (assets) blocks.push(assets);

  const text = visibleTextBlock(project);
  if (text) blocks.push(text);

  return blocks;
}

function compositionBlock(aspect: Project["brief"]["aspectRatio"]): string {
  switch (aspect) {
    case "9:16":
      return "COMPOSITION:\nCreate a 9:16 vertical composition optimized for mobile viewing. Keep all critical subjects, approved text, and important graphical information inside the central vertical safe area. Use large stacked compositions rather than wide horizontal layouts. Arrange the information vertically from top to bottom, with one dominant visual idea at a time.";
    case "16:9":
      return "COMPOSITION:\nCreate a 16:9 widescreen composition with balanced horizontal spacing. Use lateral movement and horizontal visual flow while keeping the primary subject inside the central safe region.";
    default:
      return "COMPOSITION:\nCreate a 1:1 square composition with the primary subject centered and generous, balanced margins on all four sides.";
  }
}

const PEOPLE_WORDS = ["one", "two", "three", "four", "five", "six"];

function continuityBlock(project: Project, subjects: SubjectDef[]): string | null {
  const refMap = new Map(project.references.map((r) => [r.id, r]));
  const numbering = numberReferences(project.references);
  const people = subjects.filter((s) => isPerson(s, refMap));
  if (people.length === 0) return null;

  const tagOf = (subject: SubjectDef) => subjectTag(subjects.indexOf(subject));
  const lines: string[] = [];

  for (const subject of people) {
    if (subject.retention === "weak_reference") continue;
    const tag = tagOf(subject);

    // §34 — "same character" is too weak; enumerate what must not drift.
    lines.push(
      `Preserve ${tag}'s exact facial identity throughout the entire video: same facial geometry, eye shape, nose shape, lips, jawline, skin tone, hairstyle, hairline, apparent age, and facial proportions. No face morphing or identity drift.`,
    );

    // §33 — wardrobe, with the actual garments when a reference described them.
    const wardrobe = subject.sourceRefIds
      .map((id) => refMap.get(id)?.analysis?.wardrobe?.trim())
      .find(Boolean);
    lines.push(
      wardrobe
        ? `${tag} remains in the exact same outfit throughout every shot: ${wardrobe.replace(/\.$/, "")}. No wardrobe change occurs. Do not add jackets, hats, jewelry, accessories, uniforms, or alternate clothing not defined in ${tag}.`
        : `${tag} remains in the exact same outfit throughout every shot. No wardrobe change occurs. Do not add jackets, hats, jewelry, accessories, uniforms, or alternate clothing not defined in ${tag}.`,
    );
  }

  // §32 — duplicated or cloned people are a known failure mode.
  const tags = people.map(tagOf);
  const count = PEOPLE_WORDS[people.length - 1] ?? String(people.length);
  const noun = people.length === 1 ? "person is" : "people are";
  const instances =
    people.length === 1
      ? `There is exactly one instance of ${tags[0]}.`
      : `There is exactly one instance of each of ${tags.join(" and ")}.`;

  lines.push(
    `Exactly ${count} ${noun} visible in the entire video: ${tags.join(" and ")}. No additional people appear in foreground, background, reflections, screens, posters, photographs, or duplicated instances. ${instances} Never clone, duplicate, mirror, or create alternate versions of any subject.`,
  );

  // Keep the block honest about references that exist but are not people.
  void numbering;

  return `IDENTITY AND CONTINUITY:\n${lines.join("\n")}`;
}

function isPerson(subject: SubjectDef, refMap: Map<string, ReferenceItem>): boolean {
  const refs = subject.sourceRefIds.map((id) => refMap.get(id)).filter(Boolean) as ReferenceItem[];
  if (refs.some((r) => r.analysis?.subjectType === "person")) return true;
  if (refs.some((r) => r.role === "identity" || r.role === "wardrobe")) return true;
  return /\b(woman|man|person|girl|boy|character|narrator|presenter)\b/i.test(subject.description);
}

function assetRules(
  project: Project,
  subjects: SubjectDef[],
  numbering: RefNumbering,
): string | null {
  const lines: string[] = [];

  const tagsForRole = (role: ReferenceRole) =>
    subjects
      .map((s, i) => ({ tag: subjectTag(i), refs: s.sourceRefIds }))
      .filter(({ refs }) =>
        refs.some((id) => project.references.find((r) => r.id === id)?.role === role),
      )
      .map(({ tag }) => tag);

  const logos = tagsForRole("logo");
  if (logos.length > 0) {
    // §40
    lines.push(
      `Do not redesign, redraw, distort, recolor, mirror, crop, simplify, add text to, or replace ${logos.join(" or ")}.`,
    );
  }

  const screens = tagsForRole("screen");
  if (screens.length > 0) {
    // §35
    lines.push(
      `The screen must display ${screens.join(" and ")} exactly as supplied. Do not redesign, reinterpret, animate, replace, crop into a different interface, invent new pages, generate fake UI, or change any text.`,
    );
  }

  const editSource = project.references.find((r) => r.role === "edit-source");
  if (editSource && numbering.tag[editSource.id]) {
    lines.push(
      `Preserve the camera movement, timing, shot structure, environment, object interactions, and original action of ${numbering.tag[editSource.id]}. Change only what this prompt asks to change.`,
    );
  }

  return lines.length > 0 ? `SUPPLIED ASSETS:\n${lines.join("\n")}` : null;
}

// ---- dialogue (§15–§18) -------------------------------------------------------

interface RenderedDialogue {
  /** Line emitted inside the shot that starts it. */
  opening: string;
  /** Continuation emitted in the following shot, when `<scenetrans>` is used. */
  continuation?: string;
}

export function renderDialogueLine(
  line: DialogueLine,
  subjects: SubjectDef[],
  speakers: Map<string, string>,
): RenderedDialogue {
  const speakerId = speakerIdFor(line, speakers);
  const tags = line.subjectIds
    .map((id) => subjects.findIndex((s) => s.id === id))
    .filter((i) => i >= 0)
    .map((i) => subjectTag(i));

  const delivery = line.delivery.trim();
  const language = line.language.trim() || "Spanish";
  const speaker = tags.length > 0 ? `${tags.join(" and ")} (${speakerId})` : null;

  // Narrator: the delivery field carries the narrator description.
  const subjectPart = speaker ?? `${delivery || "An off-screen narrator"} (${speakerId})`;
  const deliveryPart = speaker && delivery ? ` ${delivery}` : "";

  const verb = line.voiceover
    ? "says in an off-screen voiceover:"
    : `${deliveryPart ? "" : " "}says,`.trimStart();

  const head = line.voiceover
    ? `${subjectPart}${deliveryPart} ${verb}`
    : `${subjectPart}${deliveryPart} ${verb}`;

  const lipsNote =
    line.voiceover && tags.length > 0 ? " while their lips remain completely closed." : "";

  if (line.scenetrans && line.text.includes("<scenetrans>")) {
    const [before = "", after = ""] = line.text.split("<scenetrans>");
    return {
      opening: `${head} <d>[${language}] ${before.trim()} <scenetrans>`,
      continuation: `The audio continues seamlessly across the cut as ${subjectPart} finishes, <d>[${language}] <scenetrans> ${after.trim()}</d>`,
    };
  }

  const body = line.cutoff ? `${line.text.trim()} <cutoff>` : line.text.trim();
  return { opening: `${head} <d>[${language}] ${body}</d>${lipsNote}` };
}

// ---- shot bodies --------------------------------------------------------------

/**
 * Shots after the first are introduced by "At MM:SS.mmm," so the model's prose
 * has to continue that sentence rather than start a new one.
 */
function continuationCase(text: string): string {
  const trimmed = text.trim();
  const first = trimmed[0];
  if (!first) return trimmed;
  // Leave tags, quotes and acronyms alone.
  if (!/[A-Z]/.test(first)) return trimmed;
  if (/^[A-Z]{2,}/.test(trimmed)) return trimmed;
  return first.toLowerCase() + trimmed.slice(1);
}

function renderShots(
  project: Project,
  writer: WriterOutput,
  speakers: Map<string, string>,
  subjects: SubjectDef[],
  numbering: RefNumbering,
): string[] {
  const byShot = new Map<string, DialogueLine[]>();
  for (const line of project.dialogue) {
    const list = byShot.get(line.shotId) ?? [];
    list.push(line);
    byShot.set(line.shotId, list);
  }

  const frames = frameAnchors(project, numbering);
  const lastIndex = project.shots.length - 1;

  const blocks: string[] = [];
  let carriedContinuation: string | null = null;

  project.shots.forEach((shot, i) => {
    let prose = writer.shots.find((s) => s.index === i + 1)?.text?.trim() ?? "";
    const header =
      i === 0 ? shotLabel(i) : `${shotLabel(i)} At ${formatTimestamp(shot.cutMs ?? 0)},`;

    // §5: a frame reference must be *used*, not merely defined. The model is
    // asked to do this; the renderer guarantees it.
    if (i === 0 && frames.first && !prose.includes(frames.first)) {
      prose = `The shot begins from ${frames.first}. ${prose}`.trim();
    }
    const keyframe = frames.byShot.get(shot.id);
    if (keyframe && !prose.includes(keyframe)) {
      prose = `${prose} The shot's keyframe corresponds to ${keyframe}.`.trim();
    }
    if (i === lastIndex && frames.last && !prose.includes(frames.last)) {
      prose =
        `${prose} The final composition progressively converges toward ${frames.last}, and by the final moment the framing, subject placement, lighting, and camera angle match it.`.trim();
    }

    const parts: string[] = [];
    if (carriedContinuation) {
      parts.push(`${header} ${carriedContinuation}`);
      carriedContinuation = null;
      if (prose) parts.push(continuationCase(prose));
    } else {
      parts.push(`${header} ${i === 0 ? prose : continuationCase(prose)}`.trim());
    }

    const block = [parts.join(" ")];

    for (const line of byShot.get(shot.id) ?? []) {
      const rendered = renderDialogueLine(line, subjects, speakers);
      block.push("", rendered.opening);
      if (rendered.continuation) carriedContinuation = rendered.continuation;
    }

    blocks.push(block.join("\n"));
  });

  return blocks;
}

interface FrameAnchors {
  first: string | null;
  last: string | null;
  byShot: Map<string, string>;
}

function frameAnchors(project: Project, numbering: RefNumbering): FrameAnchors {
  const byShot = new Map<string, string>();
  let first: string | null = null;
  let last: string | null = null;

  for (const ref of project.references) {
    const tag = numbering.tag[ref.id];
    if (!tag) continue;
    if (ref.role === "first-frame") first = tag;
    else if (ref.role === "last-frame") last = tag;
    else if (ref.role === "keyframe" || ref.role === "composition") {
      const shotId = ref.shotId ?? project.shots[0]?.id;
      if (shotId) byShot.set(shotId, tag);
    }
  }

  return { first, last, byShot };
}

/**
 * A reference whose role feeds a Subject (identity, wardrobe, logo, style…)
 * only reaches the prompt through that Subject's definition (§5.1). If nothing
 * claims it, the image would silently vanish from the prompt — so derive a
 * Subject for it rather than dropping a file the user explicitly loaded.
 */
export function effectiveSubjects(project: Project): SubjectDef[] {
  const claimed = new Set(project.subjects.flatMap((s) => s.sourceRefIds));

  const derived = project.references
    .filter((ref) => !roleMeta(ref.role).standalone && !claimed.has(ref.id))
    .map<SubjectDef>((ref) => ({
      id: `auto-${ref.id}`,
      label: ref.fileName,
      description: describeReference(ref),
      sourceRefIds: [ref.id],
      attributes: ref.analysis?.h3AttributeLine ?? ref.note.trim(),
      retention: (ref.retention as SubjectDef["retention"]) ?? "fully_preserved",
      appearsIn: [],
    }));

  return [...project.subjects, ...derived];
}

export function describeReference(ref: ReferenceItem): string {
  const seen = ref.analysis?.subjectType;
  if (seen === "person") return "the person";
  if (seen === "product") return "the product";
  if (seen === "logo") return "the exact logo";
  if (seen === "interface") return "the exact screen content";
  if (seen === "environment") return "the environment";

  switch (ref.role) {
    case "identity":
      return "the person";
    case "wardrobe":
      return "the outfit";
    case "object":
      return "the object";
    case "environment":
      return "the environment";
    case "style":
      return "the visual style";
    case "logo":
      return "the exact logo";
    case "screen":
      return "the exact screen content";
    default:
      return "the referenced visual content";
  }
}

// ---- full assembly ------------------------------------------------------------

export interface RenderInput {
  project: Project;
  writer: WriterOutput;
  mode: H3Mode;
}

export function renderPrompt({ project, writer, mode }: RenderInput): string {
  return mode === "full-reference"
    ? renderFullReference(project, writer)
    : renderSimpleMode(project, writer, mode);
}

function renderFullReference(project: Project, writer: WriterOutput): string {
  const numbering = numberReferences(project.references);
  const refMap = new Map(project.references.map((r) => [r.id, r]));
  const speakers = assignSpeakers(project);
  const subjects = effectiveSubjects(project);

  const firstSpeakingSubject = (() => {
    for (const [key, sid] of speakers) {
      const idx = subjects.findIndex((s) => s.id === key);
      if (idx >= 0) return `${subjectTag(idx)} (${sid})`;
    }
    return null;
  })();

  // 1. subject_definitions
  const definitions: string[] = subjects.map((s, i) => renderSubjectLine(s, i, refMap, numbering));
  for (const ref of project.references) {
    if (!roleMeta(ref.role).standalone) continue;
    const tag = numbering.tag[ref.id];
    if (!tag) continue;
    definitions.push(renderStandaloneRefLine(ref, tag, project.shots, firstSpeakingSubject));
  }

  // 2. summary
  const prefix = `[${taskPrefixes(project.references).join(" + ")}]`;
  const summary = `${prefix} ${writer.summary.trim()}`;

  // 3. retention_analysis
  const retention: string[] = subjects.map((s, i) => {
    const tag = subjectTag(i);
    return `${tag}${appearsClause(s, project.shots)}: ${s.retention} - ${retentionNote(tag, writer, s.retention)}`;
  });
  for (const ref of project.references) {
    if (!roleMeta(ref.role).standalone) continue;
    const tag = numbering.tag[ref.id];
    if (!tag) continue;
    const { scope, note } = ROLE_SCOPE[ref.role];
    retention.push(
      `${tag} (${scope}): ${ref.retention} - ${retentionNote(tag, writer, ref.retention, note)}`,
    );
  }

  // 4. detailed_description
  const detailed: string[] = [writer.styleSentence.trim()];
  detailed.push(...constraintBlocks(project, subjects));
  detailed.push(...renderShots(project, writer, speakers, subjects, numbering));

  const sections = [
    section("subject_definitions", definitions.join("\n\n")),
    section("summary", summary),
    section("retention_analysis", retention.join("\n\n")),
    section("detailed_description", detailed.join("\n\n")),
    section("overall_soundscape", writer.soundscape.trim()),
    section("non_diegetic_music", writer.music.trim() || "N/A"),
  ];

  return sections.join("\n\n");
}

function renderSimpleMode(project: Project, writer: WriterOutput, mode: H3Mode): string {
  const numbering = numberReferences(project.references);
  const speakers = assignSpeakers(project);
  const subjects = effectiveSubjects(project);
  const images = project.references.filter((r) => r.kind === "image");
  const lastShot = shotLabel(Math.max(0, project.shots.length - 1));
  const endSeconds = project.brief.durationSec.toFixed(2);

  const alignment: string[] = [];
  if (mode === "i2va") {
    const first = images.find((r) => r.role === "first-frame") ?? images[0];
    if (first) {
      alignment.push(
        `For the target video, at 0.00 seconds into the target video, ${numbering.tag[first.id]} (from ${shotLabel(0)}) is fully referenced.`,
      );
    }
  } else if (mode === "fl2va") {
    const first = images.find((r) => r.role === "first-frame");
    const last = images.find((r) => r.role === "last-frame");
    if (first && last) {
      alignment.push(
        `How the reference pictures align with the target video — Picture ${numbering.index[first.id]} (from Shot 1) aligns with the 0.00-second mark of the target video; Picture ${numbering.index[last.id]} (from Shot ${project.shots.length}) aligns with the ${endSeconds}-second mark of the target video.`,
      );
    }
  } else if (mode === "l2va") {
    const last = images.find((r) => r.role === "last-frame") ?? images[0];
    if (last) {
      alignment.push(
        `How the reference pictures align with the target video — ${numbering.tag[last.id]} (from ${lastShot}) aligns with the ${endSeconds}-second mark of the target video.`,
      );
    }
  }

  const detailed: string[] = [writer.styleSentence.trim()];
  detailed.push(...constraintBlocks(project, subjects));
  detailed.push(...renderShots(project, writer, speakers, subjects, numbering));

  const body = [
    section("integrated_multimodal_description", detailed.join("\n\n")),
    section("overall_soundscape", writer.soundscape.trim()),
    section("non_diegetic_music", writer.music.trim() || "N/A"),
  ].join("\n\n");

  return alignment.length > 0 ? `${alignment.join("\n")}\n\n${body}` : body;
}

function section(name: string, body: string): string {
  return `${name}:\n\n${body.trim()}`;
}
