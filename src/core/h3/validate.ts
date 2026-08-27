import { effectiveSubjects, subjectTag } from "./render";
import { numberReferences } from "./roles";
import type { Finding, H3Mode, Project } from "./types";

/**
 * The §45 checklist, executable. This runs on the rendered prompt with no
 * model call, so a prompt is never handed to the user unchecked.
 */

const FULL_REFERENCE_SECTIONS = [
  "subject_definitions",
  "summary",
  "retention_analysis",
  "detailed_description",
  "overall_soundscape",
  "non_diegetic_music",
];

const SIMPLE_SECTIONS = [
  "integrated_multimodal_description",
  "overall_soundscape",
  "non_diegetic_music",
];

const SUBJECT_VERBS =
  "walks|runs|says|speaks|looks|turns|stands|sits|smiles|moves|holds|enters|exits|appears|raises|lowers|reaches|steps|opens|closes|lifts";

interface SectionSpan {
  name: string;
  start: number;
  bodyStart: number;
  end: number;
  body: string;
}

/**
 * Rules the writer model can actually fix by rewriting its prose. Everything
 * else comes from the project itself — timings, references, subjects — and has
 * to be fixed by the user, not by asking a model to reword the output.
 */
const MODEL_FIXABLE = new Set([
  "shot.empty",
  "shot.thin",
  "camera.keywordList",
  "text.notAllowed",
  "audio.dialogueTag",
  "audio.dialogueRepeat",
  "reference.undefined",
  "reference.pictureAsSubject",
  "dialogue.parenthetical",
  "section.empty",
]);

export function isModelFixable(finding: Finding): boolean {
  return MODEL_FIXABLE.has(finding.rule);
}

export function findSections(prompt: string): SectionSpan[] {
  const re = /^([a-z_]+):[ \t]*$/gm;
  const heads: { name: string; start: number; bodyStart: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(prompt)) !== null) {
    heads.push({ name: m[1]!, start: m.index, bodyStart: m.index + m[0].length });
  }
  return heads.map((h, i) => {
    const end = i + 1 < heads.length ? heads[i + 1]!.start : prompt.length;
    return { ...h, end, body: prompt.slice(h.bodyStart, end) };
  });
}

export function validatePrompt(prompt: string, project: Project, mode: H3Mode): Finding[] {
  const findings: Finding[] = [];
  const push = (f: Finding) => findings.push(f);

  const sections = findSections(prompt);
  const expected = mode === "full-reference" ? FULL_REFERENCE_SECTIONS : SIMPLE_SECTIONS;

  checkSections(sections, expected, push);

  const detailedName = mode === "full-reference" ? "detailed_description" : "integrated_multimodal_description";
  const detailed = sections.find((s) => s.name === detailedName);
  const definitions = sections.find((s) => s.name === "subject_definitions");

  if (detailed) {
    checkShots(detailed, project, push);
    checkPictureAsSubject(detailed, push);
    checkVisibleText(detailed, project, push);
    checkCameraProse(detailed, push);
  }

  checkAudioSections(sections, project, push);
  checkMusicPlacement(sections, push);
  checkShotPlan(project, push);
  checkSubjectStrength(project, push);

  checkEveryReferenceIsCited(prompt, project, push);
  checkDialogueTags(prompt, project, push);
  checkSpeakers(prompt, push);
  checkTransitionTags(prompt, push);
  checkReferenceTags(prompt, definitions, detailed, mode, push);
  checkDensity(project, push);

  return findings.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "error" ? -1 : 1;
    return (a.offset ?? 0) - (b.offset ?? 0);
  });
}

// ---- sections ----------------------------------------------------------------

function checkSections(
  sections: SectionSpan[],
  expected: string[],
  push: (f: Finding) => void,
): void {
  const found = sections.map((s) => s.name).filter((n) => expected.includes(n));

  for (const name of expected) {
    if (!found.includes(name)) {
      push({
        severity: "error",
        rule: "section.missing",
        section: name,
        message: `Falta la sección «${name}».`,
      });
    }
  }

  const ordered = expected.filter((n) => found.includes(n));
  if (found.join("|") !== ordered.join("|")) {
    push({
      severity: "error",
      rule: "section.order",
      section: "estructura",
      message: `El orden de secciones debe ser exactamente: ${expected.join(", ")}.`,
    });
  }

  for (const s of sections) {
    if (expected.includes(s.name) && s.body.trim().length === 0) {
      push({
        severity: "error",
        rule: "section.empty",
        section: s.name,
        offset: s.start,
        length: s.name.length + 1,
        message: `La sección «${s.name}» está vacía.`,
      });
    }
  }
}

// ---- shots (§12) --------------------------------------------------------------

function checkShots(detailed: SectionSpan, project: Project, push: (f: Finding) => void): void {
  const re = /^\[Shot (\d+)\](.*)$/gm;
  const headers: { n: number; rest: string; offset: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(detailed.body)) !== null) {
    headers.push({
      n: Number(m[1]),
      rest: m[2] ?? "",
      offset: detailed.bodyStart + m.index,
    });
  }

  if (headers.length === 0) {
    push({
      severity: "error",
      rule: "shot.none",
      section: detailed.name,
      offset: detailed.start,
      message: "No hay ningún [Shot N] en la descripción.",
    });
    return;
  }

  headers.forEach((h, i) => {
    if (h.n !== i + 1) {
      push({
        severity: "error",
        rule: "shot.numbering",
        section: detailed.name,
        offset: h.offset,
        length: `[Shot ${h.n}]`.length,
        message: `Los shots deben numerarse 1..N sin saltos. Se esperaba [Shot ${i + 1}] y hay [Shot ${h.n}].`,
      });
    }
  });

  const durationMs = Math.round(project.brief.durationSec * 1000);
  let previous = -1;

  headers.forEach((h, i) => {
    const stamp = /^\s*At\s+(\d{2}:\d{2}\.\d{3})/.exec(h.rest);

    if (i === 0) {
      if (stamp) {
        push({
          severity: "error",
          rule: "shot.firstTimestamp",
          section: detailed.name,
          offset: h.offset,
          length: `[Shot 1] At ${stamp[1]}`.length,
          message: "[Shot 1] nunca lleva timestamp (§12.1).",
        });
      }
      previous = 0;
      return;
    }

    if (!stamp) {
      push({
        severity: "error",
        rule: "shot.missingTimestamp",
        section: detailed.name,
        offset: h.offset,
        length: `[Shot ${h.n}]`.length,
        message: `[Shot ${h.n}] necesita un timestamp de corte con formato At MM:SS.mmm.`,
      });
      return;
    }

    const ms = parseTimestamp(stamp[1]!);
    if (ms <= previous) {
      push({
        severity: "error",
        rule: "shot.monotonic",
        section: detailed.name,
        offset: h.offset,
        length: stamp[0].length + `[Shot ${h.n}]`.length,
        message: `El timestamp ${stamp[1]} de [Shot ${h.n}] no es mayor que el del shot anterior.`,
      });
    }
    if (ms >= durationMs) {
      push({
        severity: "error",
        rule: "shot.beyondDuration",
        section: detailed.name,
        offset: h.offset,
        length: stamp[0].length + `[Shot ${h.n}]`.length,
        message: `El corte ${stamp[1]} cae fuera de la duración de ${project.brief.durationSec}s.`,
      });
    }
    previous = ms;
  });

  checkInternalCuts(detailed, headers, push);

  // A header with nothing after it means the writer skipped that shot.
  headers.forEach((h) => {
    const rest = h.rest.replace(/^\s*At\s+\d{2}:\d{2}\.\d{3},?/, "").trim();
    if (rest.length === 0) {
      push({
        severity: "error",
        rule: "shot.empty",
        section: detailed.name,
        offset: h.offset,
        length: `[Shot ${h.n}]`.length,
        message: `[Shot ${h.n}] no tiene descripción.`,
      });
      return;
    }
    // §11: detailed_description no puede quedar en resumen de trama.
    const words = rest.split(/\s+/).filter(Boolean).length;
    if (words < 12) {
      push({
        severity: "warning",
        rule: "shot.thin",
        section: detailed.name,
        offset: h.offset,
        length: `[Shot ${h.n}]`.length,
        message: `[Shot ${h.n}] tiene ${words} palabras: falta encuadre, acción observable o cámara (§11, §38).`,
      });
    }
  });
}

const CAMERA_TERMS =
  /^(cinematic|pan|panning|zoom|tracking|dolly|crane|handheld|steadicam|close[- ]?up|wide|tilt|truck|pedestal|arc|pov|slow motion|camera movement|shallow depth of field|bokeh|4k|8k)$/i;

/** §13.4 — camera direction must read as action, not as a keyword dump. */
function checkCameraProse(detailed: SectionSpan, push: (f: Finding) => void): void {
  for (const raw of detailed.body.split("\n")) {
    const line = raw.trim();
    if (line.length === 0 || line.endsWith(":")) continue;

    const items = line
      .replace(/\.$/, "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (items.length < 3) continue;

    const shortItems = items.filter((s) => s.split(/\s+/).length <= 3);
    const cameraish = items.filter((s) => CAMERA_TERMS.test(s));
    if (cameraish.length >= 3 && shortItems.length === items.length) {
      push({
        severity: "warning",
        rule: "camera.keywordList",
        section: detailed.name,
        offset: detailed.bodyStart + detailed.body.indexOf(raw),
        length: line.length,
        message:
          "Hay una lista de keywords de cámara. Escribí el movimiento como una acción en inglés natural (§13.4).",
      });
    }
  }
}

/**
 * §22 — dialogue lives in detailed_description only. Repeating it in the audio
 * sections is the fastest way to get the line spoken twice.
 */
function checkAudioSections(
  sections: SectionSpan[],
  project: Project,
  push: (f: Finding) => void,
): void {
  for (const name of ["overall_soundscape", "non_diegetic_music"]) {
    const section = sections.find((s) => s.name === name);
    if (!section) continue;

    if (section.body.includes("<d>")) {
      push({
        severity: "error",
        rule: "audio.dialogueTag",
        section: name,
        offset: section.start,
        message: `«${name}» contiene un tag <d>. El diálogo va solo en la descripción (§22).`,
      });
    }

    for (const line of project.dialogue) {
      const spoken = line.text.replace("<scenetrans>", " ").trim();
      if (spoken.length >= 12 && section.body.includes(spoken)) {
        push({
          severity: "warning",
          rule: "audio.dialogueRepeat",
          section: name,
          offset: section.start,
          message: `«${name}» repite el diálogo «${truncate(spoken, 30)}». No debe repetirse ahí (§22, §45).`,
        });
      }
    }
  }
}

const MUSIC_WORDS =
  /\b(music|musical|beat|beats|bass|melody|bpm|score|soundtrack|synth|percussion|drums|track)\b/i;

/** §24 — music the audience alone hears belongs in non_diegetic_music. */
function checkMusicPlacement(sections: SectionSpan[], push: (f: Finding) => void): void {
  const soundscape = sections.find((s) => s.name === "overall_soundscape");
  const music = sections.find((s) => s.name === "non_diegetic_music");
  if (!soundscape || !music) return;

  const musicIsEmpty = music.body.trim().replace(/\.$/, "").toUpperCase() === "N/A";
  const match = MUSIC_WORDS.exec(soundscape.body);
  if (!musicIsEmpty || !match) return;

  push({
    severity: "warning",
    rule: "audio.musicInSoundscape",
    section: "non_diegetic_music",
    offset: soundscape.start,
    message: `overall_soundscape describe música («${match[0]}») pero non_diegetic_music dice N/A. La música que solo escucha el público va en non_diegetic_music (§24).`,
  });
}

/**
 * The idea asks for several takes but the timeline has a single shot, so every
 * cut ends up crammed inside it. Catch the intent before the model does.
 */
const MULTI_TAKE_INTENT =
  /\b(varias tomas|varios planos|m[úu]ltiples tomas|distintas tomas|varios [áa]ngulos|distintos [áa]ngulos|varios cortes|cambios de plano|multiple shots|several shots|different angles|multiple angles|montaje|quick cuts)\b/i;

function checkShotPlan(project: Project, push: (f: Finding) => void): void {
  if (project.shots.length > 1) return;
  const match = MULTI_TAKE_INTENT.exec(project.brief.idea);
  if (!match) return;

  push({
    severity: "warning",
    rule: "shot.planTooShort",
    section: "shots",
    message: `La idea pide «${match[0]}» pero la Timeline tiene un solo shot, así que los cortes quedan dentro de él. Agregá cortes en la pestaña Timeline (§12.3).`,
  });
}

/** §34 + §46 — "same character" is not a preservation instruction. */
function checkSubjectStrength(project: Project, push: (f: Finding) => void): void {
  effectiveSubjects(project).forEach((subject, index) => {
    if (subject.retention !== "fully_preserved" && subject.retention !== "partially_preserved") {
      return;
    }
    if (subject.attributes.trim().length >= 12) return;

    push({
      severity: "warning",
      rule: "subject.weakDefinition",
      section: "subject_definitions",
      message: `${subjectTag(index)} pide ${subject.retention} pero no dice qué preservar. Enumerá los atributos: la identidad se pierde con frases vagas (§34).`,
    });
  });
}

const CUT_LANGUAGE =
  /\b(?:cuts?\s+(?:rapidly\s+|quickly\s+|abruptly\s+|hard\s+|back\s+)?(?:to|into)|quick cut|jump cut|smash cut|hard cut|match cut|cutaway|another\s+(?:quick\s+)?cut|rapid cuts|series of cuts|the (?:scene|shot|footage) cuts|intercut)\b/i;

/**
 * §12 — a cut is a shot boundary, not a sentence inside a shot. When the user
 * plans one shot and asks for "varias tomas", the model crams every cut into
 * that shot's prose, which is exactly what this catches.
 */
function checkInternalCuts(
  detailed: SectionSpan,
  headers: { n: number; rest: string; offset: number }[],
  push: (f: Finding) => void,
): void {
  headers.forEach((header, index) => {
    const start = header.offset - detailed.bodyStart;
    const end =
      index + 1 < headers.length ? headers[index + 1]!.offset - detailed.bodyStart : detailed.body.length;
    const body = detailed.body.slice(start, end);

    // Split on sentence ends; the opening sentence of a later shot is allowed
    // to announce its own cut ("At 00:04.000, the camera cuts to…").
    const sentences = body.split(/(?<=[.!?])\s+/);
    const searchable = header.n === 1 ? sentences : sentences.slice(1);

    for (const sentence of searchable) {
      const match = CUT_LANGUAGE.exec(sentence);
      if (!match) continue;

      push({
        severity: "error",
        rule: "shot.internalCut",
        section: detailed.name,
        offset: detailed.bodyStart + start + body.indexOf(sentence),
        length: Math.min(sentence.length, 160),
        message: `[Shot ${header.n}] describe un corte por dentro («${match[0]}»). Cada corte es un shot nuevo con su timestamp: agregá el corte en la Timeline (§12).`,
      });
      break;
    }
  });
}

export function parseTimestamp(value: string): number {
  const m = /^(\d{2}):(\d{2})\.(\d{3})$/.exec(value);
  if (!m) return Number.NaN;
  return Number(m[1]) * 60000 + Number(m[2]) * 1000 + Number(m[3]);
}

// ---- dialogue (§15, §46) ------------------------------------------------------

function checkDialogueTags(prompt: string, project: Project, push: (f: Finding) => void): void {
  const opens = countOccurrences(prompt, "<d>");
  const closes = countOccurrences(prompt, "</d>");
  const splits = project.dialogue.filter(
    (l) => l.scenetrans && l.text.includes("<scenetrans>"),
  ).length;

  if (opens - closes !== splits) {
    push({
      severity: "error",
      rule: "dialogue.unbalanced",
      section: "diálogo",
      message:
        splits > 0
          ? `Hay ${opens} <d> y ${closes} </d>. Con ${splits} línea(s) con <scenetrans> la diferencia debería ser exactamente ${splits}.`
          : `Hay ${opens} <d> y ${closes} </d>. Deben coincidir.`,
    });
  }

  const re = /<d>([^\n]*?)(?:<\/d>|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(prompt)) !== null) {
    const body = m[1] ?? "";
    const lang = /^\s*\[([^\]]*)\]/.exec(body);

    if (!lang) {
      push({
        severity: "error",
        rule: "dialogue.missingLanguage",
        section: "diálogo",
        offset: m.index,
        length: Math.min(m[0].length, 60),
        message: "Cada <d> debe abrir con [Idioma], por ejemplo <d>[Spanish] …</d>.",
      });
      continue;
    }

    if (lang[1]!.includes(",")) {
      push({
        severity: "error",
        rule: "dialogue.actingInsideTag",
        section: "diálogo",
        offset: m.index,
        length: lang[0].length + 3,
        message: `«[${lang[1]}]» mete actuación dentro de <d>. Solo va el idioma; la interpretación va fuera (§15.1).`,
      });
    }

    const spoken = body.slice(lang[0].length).trim();
    if (spoken.length === 0) {
      push({
        severity: "error",
        rule: "dialogue.empty",
        section: "diálogo",
        offset: m.index,
        length: m[0].length,
        message: "Hay un <d> sin palabras habladas.",
      });
    }
    if (/^\(/.test(spoken)) {
      push({
        severity: "warning",
        rule: "dialogue.parenthetical",
        section: "diálogo",
        offset: m.index,
        length: m[0].length,
        message: "El diálogo empieza con un paréntesis: la actuación debe ir fuera de <d>.",
      });
    }
  }

  // Literal dialogue must survive verbatim (§15.2). A <scenetrans> line is
  // split across the cut on purpose, so each half is checked separately.
  for (const line of project.dialogue) {
    const fragments = line.text
      .split("<scenetrans>")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const fragment of fragments) {
      if (!prompt.includes(fragment)) {
        push({
          severity: "error",
          rule: "dialogue.rewritten",
          section: "diálogo",
          message: `El diálogo literal «${truncate(fragment, 40)}» no aparece textualmente en el prompt.`,
        });
      }
    }
  }
}

// ---- speakers (§14, §46) ------------------------------------------------------

function checkSpeakers(prompt: string, push: (f: Finding) => void): void {
  const used = new Set<number>();
  const re = /\((S\d+(?:,\s*S\d+)*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(prompt)) !== null) {
    for (const id of m[1]!.split(",")) {
      const n = Number(id.trim().slice(1));
      if (Number.isFinite(n)) used.add(n);
    }
  }

  if (used.size > 0) {
    const max = Math.max(...used);
    for (let i = 1; i <= max; i += 1) {
      if (!used.has(i)) {
        push({
          severity: "error",
          rule: "speaker.gap",
          section: "hablantes",
          message: `Falta (S${i}). Los speaker IDs se asignan 1..N sin saltos (§14.1).`,
        });
      }
    }
  }

  // A subject tag must keep the same speaker id everywhere (§46).
  const pairs = /<Subject (\d+)>\s*\((S\d+(?:,\s*S\d+)*)\)/g;
  const seen = new Map<string, string>();
  let p: RegExpExecArray | null;
  while ((p = pairs.exec(prompt)) !== null) {
    const subject = `<Subject ${p[1]}>`;
    const speaker = p[2]!.replace(/\s+/g, "");
    const previous = seen.get(subject);
    if (previous && previous !== speaker && !speaker.includes(previous)) {
      push({
        severity: "error",
        rule: "speaker.unstable",
        section: "hablantes",
        offset: p.index,
        length: p[0].length,
        message: `${subject} aparece como (${previous}) y como (${speaker}). El ID debe mantenerse en todo el video.`,
      });
    } else if (!previous) {
      seen.set(subject, speaker);
    }
  }
}

// ---- scenetrans / cutoff (§17, §18) -------------------------------------------

function checkTransitionTags(prompt: string, push: (f: Finding) => void): void {
  const scenetrans = countOccurrences(prompt, "<scenetrans>");
  if (scenetrans % 2 !== 0) {
    push({
      severity: "error",
      rule: "scenetrans.unpaired",
      section: "diálogo",
      message:
        "<scenetrans> debe aparecer dos veces por línea partida: al cerrar el shot y al retomarla en el siguiente (§17).",
    });
  }
  if (scenetrans > 0 && !/continu\w+ seamlessly|continues uninterrupted|carries over|remains audible/i.test(prompt)) {
    push({
      severity: "warning",
      rule: "scenetrans.noContinuityPhrase",
      section: "diálogo",
      message:
        "Con <scenetrans> conviene decir explícitamente que el audio continúa a través del corte (§17).",
    });
  }

  const cutoffRe = /<cutoff>/g;
  let m: RegExpExecArray | null;
  while ((m = cutoffRe.exec(prompt)) !== null) {
    const after = prompt.slice(m.index + "<cutoff>".length, m.index + "<cutoff>".length + 8);
    if (!after.trimStart().startsWith("</d>")) {
      push({
        severity: "warning",
        rule: "cutoff.position",
        section: "diálogo",
        offset: m.index,
        length: "<cutoff>".length,
        message: "<cutoff> marca una frase interrumpida: debe ir al final del <d> (§18).",
      });
    }
  }
}

// ---- reference tags (§3, §46) -------------------------------------------------

function checkReferenceTags(
  prompt: string,
  definitions: SectionSpan | undefined,
  detailed: SectionSpan | undefined,
  mode: H3Mode,
  push: (f: Finding) => void,
): void {
  const all = collectTags(prompt);

  for (const [kind, numbers] of all) {
    const sorted = [...numbers].sort((a, b) => a - b);
    sorted.forEach((n, i) => {
      if (n !== i + 1) {
        push({
          severity: "error",
          rule: "reference.numbering",
          section: "referencias",
          message: `La numeración de <${kind} N> tiene un salto: se usa <${kind} ${n}> pero falta <${kind} ${i + 1}>.`,
        });
      }
    });
  }

  if (mode !== "full-reference") return;

  if (!definitions) return;
  const defined = collectTags(definitions.body);
  for (const [kind, numbers] of all) {
    for (const n of numbers) {
      if (!defined.get(kind)?.has(n)) {
        push({
          severity: "error",
          rule: "reference.undefined",
          section: "referencias",
          message: `<${kind} ${n}> se usa en el prompt pero no está definido en subject_definitions.`,
        });
      }
    }
  }
  // Only tags that own a definition line need to appear in the description. A
  // <Picture N> cited *inside* a <Subject N> definition is consumed by that
  // subject and is not expected to reappear (§5.1). retention_analysis does not
  // count as usage — every reference is listed there by construction.
  const body = detailed?.body ?? prompt.slice(definitions.end);
  for (const tag of definitionHeads(definitions.body)) {
    if (!body.includes(tag)) {
      push({
        severity: "warning",
        rule: "reference.unused",
        section: "referencias",
        message: `${tag} se define pero nunca se usa después de subject_definitions.`,
      });
    }
  }
}

function definitionHeads(definitionsBody: string): string[] {
  const re = /^(<(?:Subject|Picture|Video|Audio) \d+>)/gm;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(definitionsBody)) !== null) out.push(m[1]!);
  return out;
}

/**
 * The failure this catches: you load an image, generate, and the prompt never
 * mentions it. A reference the user paid attention to must reach the output.
 */
function checkEveryReferenceIsCited(
  prompt: string,
  project: Project,
  push: (f: Finding) => void,
): void {
  const numbering = numberReferences(project.references);

  for (const ref of project.references) {
    const tag = numbering.tag[ref.id];
    if (!tag) continue;
    if (prompt.includes(tag)) continue;

    push({
      severity: "error",
      rule: "reference.notCited",
      section: "referencias",
      message: `«${ref.fileName}» se cargó como ${tag} pero el prompt no la menciona nunca. Asigná la referencia a un Subject o cambiá su rol.`,
    });
  }
}

function collectTags(text: string): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  const re = /<(Subject|Picture|Video|Audio) (\d+)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const set = out.get(m[1]!) ?? new Set<number>();
    set.add(Number(m[2]));
    out.set(m[1]!, set);
  }
  return out;
}

function checkPictureAsSubject(detailed: SectionSpan, push: (f: Finding) => void): void {
  const re = new RegExp(`<Picture (\\d+)>\\s+(${SUBJECT_VERBS})\\b`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(detailed.body)) !== null) {
    push({
      severity: "error",
      rule: "reference.pictureAsSubject",
      section: detailed.name,
      offset: detailed.bodyStart + m.index,
      length: m[0].length,
      message: `<Picture ${m[1]}> se está usando como personaje. La imagen es la fuente; definí un <Subject N> y usá ese (§46).`,
    });
  }
}

// ---- visible text (§19, §20) --------------------------------------------------

function checkVisibleText(detailed: SectionSpan, project: Project, push: (f: Finding) => void): void {
  const { visibleTextPolicy, allowedText } = project.brief;
  if (visibleTextPolicy === "unrestricted") return;

  const allowed = new Set(allowedText.map((t) => t.trim()).filter(Boolean));
  const re = /"([^"\n]{1,120})"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(detailed.body)) !== null) {
    const value = m[1]!;
    if (allowed.has(value)) continue;
    push({
      severity: "error",
      rule: "text.notAllowed",
      section: detailed.name,
      offset: detailed.bodyStart + m.index,
      length: m[0].length,
      message:
        visibleTextPolicy === "none"
          ? `El prompt pide texto visible «${value}» pero la política es «sin texto».`
          : `«${value}» no está en la lista de texto permitido.`,
    });
  }
}

// ---- density (§12.3, §37) -----------------------------------------------------

function checkDensity(project: Project, push: (f: Finding) => void): void {
  const duration = project.brief.durationSec;
  if (duration <= 0) {
    push({
      severity: "error",
      rule: "brief.duration",
      section: "brief",
      message: "La duración debe ser mayor que cero.",
    });
    return;
  }

  const maxShots = Math.max(1, Math.round(duration / 2.5));
  if (project.shots.length > maxShots) {
    push({
      severity: "warning",
      rule: "shot.density",
      section: "shots",
      message: `${project.shots.length} shots en ${duration}s es mucho corte. La guía sugiere hasta ~${maxShots} (§12.3).`,
    });
  }

  const words = project.dialogue.reduce(
    (sum, line) => sum + line.text.trim().split(/\s+/).filter(Boolean).length,
    0,
  );
  const maxWords = Math.round(duration * 3.2);
  if (words > maxWords) {
    push({
      severity: "warning",
      rule: "dialogue.density",
      section: "diálogo",
      message: `${words} palabras de diálogo en ${duration}s suenan apuradas. La guía sugiere hasta ~${maxWords} (§37).`,
    });
  }
}

// ---- helpers ------------------------------------------------------------------

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
