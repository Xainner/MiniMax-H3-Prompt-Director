import type {
  AudioRetention,
  H3Mode,
  MediaKind,
  ReferenceItem,
  ReferenceRole,
  RefNumbering,
  Retention,
  VisualRetention,
} from "./types";

export interface RoleMeta {
  role: ReferenceRole;
  kind: MediaKind;
  /** Spanish label for the UI. */
  label: string;
  /** One-line explanation shown in the role picker. */
  hint: string;
  /**
   * True when the reference gets its own definition line as a concrete frame
   * or whole-media relationship. False when it is only cited from inside a
   * Subject definition (§5.1).
   */
  standalone: boolean;
  defaultRetention: Retention;
}

export const ROLES: RoleMeta[] = [
  // --- images cited from inside a Subject ---
  {
    role: "identity",
    kind: "image",
    label: "Identidad",
    hint: "Cara, cuerpo y rasgos de una persona o personaje.",
    standalone: false,
    defaultRetention: "fully_preserved",
  },
  {
    role: "wardrobe",
    kind: "image",
    label: "Vestuario",
    hint: "Ropa, materiales y accesorios que se transfieren.",
    standalone: false,
    defaultRetention: "attribute_transfer",
  },
  {
    role: "object",
    kind: "image",
    label: "Objeto / producto",
    hint: "Un objeto, vehículo o producto reutilizable.",
    standalone: false,
    defaultRetention: "fully_preserved",
  },
  {
    role: "environment",
    kind: "image",
    label: "Escenario",
    hint: "Locación o fondo donde ocurre la acción.",
    standalone: false,
    defaultRetention: "partially_preserved",
  },
  {
    role: "style",
    kind: "image",
    label: "Estilo visual",
    hint: "Lenguaje visual, paleta y tratamiento (§39).",
    standalone: false,
    defaultRetention: "weak_reference",
  },
  {
    role: "logo",
    kind: "image",
    label: "Logo",
    hint: "Marca exacta que no debe rediseñarse (§40).",
    standalone: false,
    defaultRetention: "fully_preserved",
  },
  {
    role: "screen",
    kind: "image",
    label: "Pantalla / UI",
    hint: "Captura exacta que el modelo no debe reinventar (§35).",
    standalone: false,
    defaultRetention: "fully_preserved",
  },
  // --- images with a frame role of their own ---
  {
    role: "first-frame",
    kind: "image",
    label: "Primer frame",
    hint: "Define el frame exacto de 0.00 s.",
    standalone: true,
    defaultRetention: "fully_preserved",
  },
  {
    role: "last-frame",
    kind: "image",
    label: "Último frame",
    hint: "Composición final hacia la que converge el video.",
    standalone: true,
    defaultRetention: "fully_preserved",
  },
  {
    role: "keyframe",
    kind: "image",
    label: "Keyframe",
    hint: "Momento concreto dentro de un shot.",
    standalone: true,
    defaultRetention: "fully_preserved",
  },
  {
    role: "composition",
    kind: "image",
    label: "Composición",
    hint: "Ancla de encuadre, cámara y disposición.",
    standalone: true,
    defaultRetention: "partially_preserved",
  },
  // --- video ---
  {
    role: "edit-source",
    kind: "video",
    label: "Video fuente (edición)",
    hint: "El video que se está editando.",
    standalone: true,
    defaultRetention: "fully_preserved",
  },
  {
    role: "continuation",
    kind: "video",
    label: "Continuación",
    hint: "El video generado continúa desde su estado final.",
    standalone: true,
    defaultRetention: "fully_preserved",
  },
  {
    role: "camera",
    kind: "video",
    label: "Cámara",
    hint: "Movimiento y tracking de cámara.",
    standalone: true,
    defaultRetention: "weak_reference",
  },
  {
    role: "cut-rhythm",
    kind: "video",
    label: "Ritmo de edición",
    hint: "Estructura temporal y cadencia de cortes.",
    standalone: true,
    defaultRetention: "weak_reference",
  },
  {
    role: "motion",
    kind: "video",
    label: "Movimiento / pose",
    hint: "Gesto, pose o timing corporal a reutilizar.",
    standalone: true,
    defaultRetention: "weak_reference",
  },
  // --- audio ---
  {
    role: "voice",
    kind: "audio",
    label: "Timbre de voz",
    hint: "Referencia vocal para un hablante.",
    standalone: true,
    defaultRetention: "reference",
  },
  {
    role: "soundtrack",
    kind: "audio",
    label: "Soundtrack exacto",
    hint: "Se copia la señal completa.",
    standalone: true,
    defaultRetention: "fully_copy",
  },
  {
    role: "music-style",
    kind: "audio",
    label: "Estilo musical",
    hint: "Ritmo, instrumentación y energía, sin copiar la señal.",
    standalone: true,
    defaultRetention: "reference",
  },
  {
    role: "sfx",
    kind: "audio",
    label: "Efectos de sonido",
    hint: "Sonidos puntuales reutilizados.",
    standalone: true,
    defaultRetention: "partially_copy",
  },
];

const ROLE_MAP = new Map(ROLES.map((r) => [r.role, r]));

export function roleMeta(role: ReferenceRole): RoleMeta {
  const meta = ROLE_MAP.get(role);
  if (!meta) throw new Error(`Rol desconocido: ${role}`);
  return meta;
}

export function rolesForKind(kind: MediaKind): RoleMeta[] {
  return ROLES.filter((r) => r.kind === kind);
}

export function defaultRoleFor(kind: MediaKind): ReferenceRole {
  switch (kind) {
    case "image":
      return "identity";
    case "video":
      return "motion";
    case "audio":
      return "voice";
    default:
      return "object";
  }
}

export const VISUAL_RETENTIONS: { value: VisualRetention; label: string; hint: string }[] = [
  {
    value: "fully_preserved",
    label: "fully_preserved",
    hint: "Se conserva exactamente: identidad, colores, geometría.",
  },
  {
    value: "partially_preserved",
    label: "partially_preserved",
    hint: "Se conserva parte y se reemplaza el resto.",
  },
  {
    value: "attribute_transfer",
    label: "attribute_transfer",
    hint: "Se transfiere un atributo a otro sujeto.",
  },
  {
    value: "weak_reference",
    label: "weak_reference",
    hint: "Solo inspiración general.",
  },
];

export const AUDIO_RETENTIONS: { value: AudioRetention; label: string; hint: string }[] = [
  { value: "fully_copy", label: "fully_copy", hint: "Se reutiliza la señal completa." },
  { value: "partially_copy", label: "partially_copy", hint: "Se copia una sección." },
  { value: "reference", label: "reference", hint: "Timbre o estilo, sin copiar la señal." },
  { value: "weak_reference", label: "weak_reference", hint: "Solo una pista general." },
];

export function retentionsForKind(kind: MediaKind) {
  return kind === "audio" ? AUDIO_RETENTIONS : VISUAL_RETENTIONS;
}

// ---- numbering ---------------------------------------------------------------

/**
 * `<Picture N>` / `<Video N>` / `<Audio N>` are positional per media kind: they
 * must match the upload order in the MiniMax UI, not a global counter (§7.1).
 */
export function numberReferences(references: ReferenceItem[]): RefNumbering {
  const counters: Record<string, number> = { image: 0, video: 0, audio: 0, unknown: 0 };
  const tagName: Record<string, string> = {
    image: "Picture",
    video: "Video",
    audio: "Audio",
    unknown: "Picture",
  };

  const tag: Record<string, string> = {};
  const index: Record<string, number> = {};

  for (const ref of references) {
    const kind = ref.kind in counters ? ref.kind : "unknown";
    const n = (counters[kind] ?? 0) + 1;
    counters[kind] = n;
    index[ref.id] = n;
    tag[ref.id] = `<${tagName[kind]} ${n}>`;
  }

  return { tag, index };
}

// ---- mode detection ----------------------------------------------------------

const FRAME_ROLES: ReferenceRole[] = ["first-frame", "last-frame", "keyframe", "composition"];

/**
 * Full-Reference wins whenever more than one reference is in play or any
 * non-frame role exists, because only it can express Subjects and retention
 * (§2). The single-frame modes are reserved for the simple cases they describe.
 */
export function detectMode(references: ReferenceItem[]): H3Mode {
  if (references.length === 0) return "t2va";

  const images = references.filter((r) => r.kind === "image");
  const nonImages = references.filter((r) => r.kind !== "image");
  const frameImages = images.filter((r) => FRAME_ROLES.includes(r.role));
  const subjectImages = images.filter((r) => !FRAME_ROLES.includes(r.role));

  if (nonImages.length > 0 || subjectImages.length > 0) return "full-reference";

  const hasFirst = frameImages.some((r) => r.role === "first-frame");
  const hasLast = frameImages.some((r) => r.role === "last-frame");

  if (hasFirst && hasLast && frameImages.length === 2) return "fl2va";
  if (hasFirst && frameImages.length === 1) return "i2va";
  if (hasLast && frameImages.length === 1) return "l2va";
  return "full-reference";
}

export const MODE_LABELS: Record<H3Mode, string> = {
  "full-reference": "Full-Reference / Omni",
  t2va: "T2VA — Texto a video",
  i2va: "I2VA — Primer frame",
  fl2va: "FL2VA — Primer + último frame",
  l2va: "L2VA — Último frame",
};

export const MODE_HINTS: Record<H3Mode, string> = {
  "full-reference": "Seis secciones. El único modo que expresa Subjects y retención.",
  t2va: "Sin imágenes obligatorias. La línea temporal nace del texto.",
  i2va: "Una imagen define el frame exacto de 0.00 s.",
  fl2va: "Describe el camino visual entre el primer y el último frame.",
  l2va: "El modelo infiere un estado previo y converge al frame final.",
};

// ---- task prefixes (§9) -------------------------------------------------------

export function taskPrefixes(references: ReferenceItem[]): string[] {
  const prefixes: string[] = [];
  const has = (...roles: ReferenceRole[]) => references.some((r) => roles.includes(r.role));

  if (has("first-frame", "last-frame", "keyframe", "composition")) {
    prefixes.push("keyframe completion");
  }
  if (
    has("identity", "wardrobe", "object", "environment", "style", "logo", "screen", "camera", "cut-rhythm", "motion")
  ) {
    prefixes.push("reference generation");
  }
  if (has("edit-source")) prefixes.push("video editing");
  if (has("continuation")) prefixes.push("video continuation");
  if (references.some((r) => r.kind === "audio" && (r.retention === "fully_copy" || r.retention === "partially_copy"))) {
    prefixes.push("audio reuse");
  }
  if (references.some((r) => r.kind === "audio" && (r.retention === "reference" || r.retention === "weak_reference"))) {
    prefixes.push("audio reference");
  }

  return prefixes.length > 0 ? prefixes : ["reference generation"];
}
