import { Layers, Plus, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, ScrollArea, toneForTag } from "@/components/ui/controls";
import { Field, Input, Textarea } from "@/components/ui/input";
import { PopoverContent, Popover, PopoverTrigger, Tooltip } from "@/components/ui/overlays";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { numberReferences, roleMeta, VISUAL_RETENTIONS } from "@/core/h3/roles";
import { subjectTag } from "@/core/h3/render";
import type { ReferenceItem, SubjectDef, VisualRetention } from "@/core/h3/types";
import { cn } from "@/lib/utils";
import { useProject } from "@/stores/projectStore";

export function SubjectsPanel() {
  const subjects = useProject((s) => s.project.subjects);
  const references = useProject((s) => s.project.references);
  const shots = useProject((s) => s.project.shots);
  const addSubject = useProject((s) => s.addSubject);
  const patchSubject = useProject((s) => s.patchSubject);
  const removeSubject = useProject((s) => s.removeSubject);

  const numbering = numberReferences(references);

  function createFromReference(ref: ReferenceItem) {
    addSubject({
      label: ref.fileName.replace(/\.[^.]+$/, ""),
      description: describeFor(ref),
      sourceRefIds: [ref.id],
      attributes: ref.analysis?.h3AttributeLine ?? "",
      retention: (ref.retention as VisualRetention) ?? "fully_preserved",
    });
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <p className="max-w-[46ch] text-[11px] leading-snug text-ink-faint">
            Un Subject es contenido visual reutilizable. La imagen es la fuente; el Subject es lo
            que actúa en el video (§4).
          </p>
          <div className="flex shrink-0 gap-1.5">
            {references.length > 0 ? (
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="outline">
                    <Wand2 />
                    Desde referencia
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 p-1">
                  {references.map((ref) => (
                    <button
                      key={ref.id}
                      type="button"
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-ink hover:bg-raised"
                      onClick={() => createFromReference(ref)}
                    >
                      <Badge tone={toneForTag(numbering.tag[ref.id] ?? "")}>
                        {numbering.tag[ref.id]}
                      </Badge>
                      <span className="truncate">{ref.fileName}</span>
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            ) : null}
            <Button size="sm" variant="primary" onClick={() => addSubject()}>
              <Plus />
              Subject
            </Button>
          </div>
        </div>

        {subjects.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="space-y-2.5">
            {subjects.map((subject, index) => (
              <li key={subject.id} className="space-y-2.5 rounded-lg border border-line bg-elevated p-3">
                <div className="flex items-center gap-2">
                  <Badge tone="subject">{subjectTag(index)}</Badge>
                  <Input
                    value={subject.label}
                    placeholder="Nombre interno (Laura, el producto…)"
                    onChange={(e) => patchSubject(subject.id, { label: e.target.value })}
                    className="h-6 flex-1"
                  />
                  <Tooltip content="Eliminar subject">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => removeSubject(subject.id)}
                    >
                      <Trash2 />
                    </Button>
                  </Tooltip>
                </div>

                <Field label="Qué es (en inglés)" hint="Se escribe después de «is» en la definición.">
                  <Input
                    value={subject.description}
                    placeholder="the young woman / the exact DondeCR logo / the visual style"
                    onChange={(e) => patchSubject(subject.id, { description: e.target.value })}
                  />
                </Field>

                <SourcesField
                  subject={subject}
                  references={references}
                  tags={numbering.tag}
                  onChange={(sourceRefIds) => patchSubject(subject.id, { sourceRefIds })}
                />

                <Field
                  label="Atributos a preservar"
                  hint="Se escribe después de «preserving». Sé específico: la identidad se pierde con frases vagas (§34)."
                  aside={
                    subject.sourceRefIds.some(
                      (id) => references.find((r) => r.id === id)?.analysis?.h3AttributeLine,
                    ) ? (
                      <button
                        type="button"
                        className="text-[10px] text-amber hover:underline"
                        onClick={() =>
                          patchSubject(subject.id, {
                            attributes: subject.sourceRefIds
                              .map((id) => references.find((r) => r.id === id)?.analysis?.h3AttributeLine)
                              .filter(Boolean)
                              .join("; "),
                          })
                        }
                      >
                        usar análisis
                      </button>
                    ) : null
                  }
                >
                  <Textarea
                    value={subject.attributes}
                    rows={2}
                    placeholder="her exact facial geometry, eye shape, jawline, skin tone, hairstyle, and body proportions"
                    onChange={(e) => patchSubject(subject.id, { attributes: e.target.value })}
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Retención">
                    <Select
                      value={subject.retention}
                      onValueChange={(retention) =>
                        patchSubject(subject.id, { retention: retention as VisualRetention })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VISUAL_RETENTIONS.map((item) => (
                          <SelectItem key={item.value} value={item.value} hint={item.hint}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field label="Aparece en" hint="Vacío = todos los shots.">
                    <div className="flex flex-wrap gap-1">
                      {shots.map((shot, i) => {
                        const active = subject.appearsIn.includes(shot.id);
                        return (
                          <button
                            key={shot.id}
                            type="button"
                            onClick={() =>
                              patchSubject(subject.id, {
                                appearsIn: active
                                  ? subject.appearsIn.filter((id) => id !== shot.id)
                                  : [...subject.appearsIn, shot.id],
                              })
                            }
                            className={cn(
                              "tnum rounded border px-1.5 py-0.5 font-mono text-[10px] transition-colors",
                              active
                                ? "border-amber/50 bg-amber/12 text-amber"
                                : "border-line-strong text-ink-faint hover:text-ink",
                            )}
                          >
                            {i + 1}
                          </button>
                        );
                      })}
                    </div>
                  </Field>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ScrollArea>
  );
}

function SourcesField({
  subject,
  references,
  tags,
  onChange,
}: {
  subject: SubjectDef;
  references: ReferenceItem[];
  tags: Record<string, string>;
  onChange: (ids: string[]) => void;
}) {
  return (
    <Field
      label="Fuentes"
      hint="Un subject puede combinar identidad de una imagen, ropa de otra y movimiento de un video (§4.1)."
    >
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex min-h-7 w-full flex-wrap items-center gap-1 rounded-md border border-line bg-base px-2 py-1 text-left transition-colors hover:border-line-strong"
          >
            {subject.sourceRefIds.length === 0 ? (
              <span className="text-[11px] text-ink-faint">Elegir referencias…</span>
            ) : (
              subject.sourceRefIds.map((id) => (
                <Badge key={id} tone={toneForTag(tags[id] ?? "")}>
                  {tags[id] ?? "?"}
                </Badge>
              ))
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-1">
          {references.length === 0 ? (
            <p className="px-2 py-1.5 text-[11px] text-ink-faint">No hay referencias cargadas.</p>
          ) : (
            references.map((ref) => {
              const active = subject.sourceRefIds.includes(ref.id);
              return (
                <button
                  key={ref.id}
                  type="button"
                  onClick={() =>
                    onChange(
                      active
                        ? subject.sourceRefIds.filter((id) => id !== ref.id)
                        : [...subject.sourceRefIds, ref.id],
                    )
                  }
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-raised",
                    active ? "text-ink" : "text-ink-muted",
                  )}
                >
                  <span
                    className={cn(
                      "size-3 shrink-0 rounded-[3px] border",
                      active ? "border-amber bg-amber" : "border-line-strong",
                    )}
                  />
                  <Badge tone={toneForTag(tags[ref.id] ?? "")}>{tags[ref.id]}</Badge>
                  <span className="min-w-0 flex-1 truncate">{ref.fileName}</span>
                  <span className="shrink-0 text-[10px] text-ink-faint">
                    {roleMeta(ref.role).label}
                  </span>
                </button>
              );
            })
          )}
        </PopoverContent>
      </Popover>
    </Field>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line-strong px-6 py-10 text-center">
      <Layers className="size-5 text-ink-faint" />
      <p className="text-xs text-ink-muted">Todavía no definiste ningún Subject</p>
      <p className="max-w-[42ch] text-[11px] leading-snug text-ink-faint">
        Sin Subjects, el prompt no puede pedirle a H3 que conserve una identidad. Creá uno desde una
        referencia analizada.
      </p>
    </div>
  );
}

function describeFor(ref: ReferenceItem): string {
  const analysis = ref.analysis;
  if (!analysis) return "";
  switch (analysis.subjectType) {
    case "person":
      return "the person";
    case "logo":
      return "the exact logo";
    case "product":
      return "the product";
    case "environment":
      return "the environment";
    case "interface":
      return "the exact screen content";
    case "artwork":
      return "the visual style";
    default:
      return analysis.subjectType ? `the ${analysis.subjectType}` : "the referenced content";
  }
}
