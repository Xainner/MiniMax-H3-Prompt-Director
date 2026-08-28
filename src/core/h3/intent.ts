import type { Brief, Project, ReferenceItem, SubjectDef, VisualRetention } from "./types";

function requestText(brief: Brief): string {
  return `${brief.idea}\n${brief.extraConstraints}`.toLocaleLowerCase();
}

/** True when source clothing must not be treated as an identity attribute. */
export function requestsWardrobeChange(brief: Brief): boolean {
  const text = requestText(brief);
  return [
    /\b(?:sin|quitar|quita|remover|eliminar|cambiar|cambia|reemplazar|reemplaza)\b[^.\n]{0,80}\b(?:ropa|vestuario|atuendo|bikini|camisa|vestido|chaqueta|uniforme|accesorios?)\b/i,
    /\b(?:desnud[ao]s?|semidesnud[ao]s?|topless)\b/i,
    /\b(?:without|remove|change|replace|discard|ignore)\b[^.\n]{0,80}\b(?:clothes|clothing|wardrobe|outfit|bikini|shirt|dress|jacket|uniform|accessories)\b/i,
    /\b(?:nude|naked|topless)\b/i,
  ].some((pattern) => pattern.test(text));
}

export function requestsAdditionalPerson(brief: Brief): boolean {
  const text = requestText(brief);
  return /\b(?:pareja|acompañante|otra persona|segund[ao] persona|dos personas|hombre y mujer|mujer y hombre|partner|another person|second person|two people|man and woman|woman and man)\b/i.test(
    text,
  );
}

export function requestsVocalizations(brief: Brief): boolean {
  const text = requestText(brief);
  return /\b(?:gemid[oa]s?|gemir|gruñid[oa]s?|gruñir|jade[oa]s?|moans?|moaning|groans?|groaning|whimpers?|whimpering|grunts?|grunting|vocalizations?)\b/i.test(
    text,
  );
}

export function isPersonSubject(subject: SubjectDef, references: ReferenceItem[]): boolean {
  const refMap = new Map(references.map((ref) => [ref.id, ref]));
  const sources = subject.sourceRefIds.map((id) => refMap.get(id)).filter(Boolean) as ReferenceItem[];
  if (sources.some((ref) => ref.analysis?.subjectType === "person")) return true;
  if (sources.some((ref) => ref.role === "identity")) return true;
  return /\b(woman|man|person|girl|boy|character|narrator|presenter)\b/i.test(subject.description);
}

export function subjectRetentionForPrompt(
  project: Project,
  subject: SubjectDef,
): VisualRetention {
  if (
    subject.retention === "fully_preserved" &&
    requestsWardrobeChange(project.brief) &&
    isPersonSubject(subject, project.references)
  ) {
    return "partially_preserved";
  }
  return subject.retention;
}

/** Identity-only preservation text used when source wardrobe must be discarded. */
export function subjectAttributesForPrompt(project: Project, subject: SubjectDef): string {
  if (!requestsWardrobeChange(project.brief) || !isPersonSubject(subject, project.references)) {
    return subject.attributes.trim();
  }

  const refMap = new Map(project.references.map((ref) => [ref.id, ref]));
  const identities = subject.sourceRefIds
    .map((id) => refMap.get(id)?.analysis?.identity.trim())
    .filter((value): value is string => Boolean(value));
  const identityDetails = [...new Set(identities)].join("; ");
  const baseline =
    "exact facial identity, facial geometry, eye shape, nose shape, lips, jawline, skin tone, hairstyle, hairline, apparent age, and body proportions";

  return identityDetails ? `${identityDetails}; ${baseline}` : baseline;
}
