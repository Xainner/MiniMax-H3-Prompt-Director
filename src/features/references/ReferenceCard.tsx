import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertTriangle,
  AudioLines,
  Check,
  Eye,
  Film,
  GripVertical,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, toneForTag } from "@/components/ui/controls";
import { Field, Textarea } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/overlays";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { retentionsForKind, roleMeta, rolesForKind } from "@/core/h3/roles";
import type { ReferenceItem, ReferenceRole, Retention } from "@/core/h3/types";
import { errorMessage } from "@/lib/ipc";
import { cn, formatBytes } from "@/lib/utils";
import { useProject } from "@/stores/projectStore";
import { isProfileUsable, useSettings } from "@/stores/settingsStore";
import { useUi } from "@/stores/uiStore";

const FRAME_ROLES: ReferenceRole[] = ["keyframe", "composition"];

export function ReferenceCard({ reference, tag }: { reference: ReferenceItem; tag: string }) {
  const selectedId = useUi((s) => s.selectedReferenceId);
  const setUi = useUi((s) => s.set);
  const openSettings = useUi((s) => s.openSettings);
  const patch = useProject((s) => s.patchReference);
  const remove = useProject((s) => s.removeReference);
  const analyze = useProject((s) => s.analyzeReference);
  const shots = useProject((s) => s.project.shots);
  const visionProfile = useSettings((s) => s.settings?.vision);

  const selected = selectedId === reference.id;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: reference.id,
  });

  const style = { transform: CSS.Transform.toString(transform), transition };

  async function runAnalysis() {
    if (!isProfileUsable(visionProfile)) {
      toast.error("Falta configurar el LLM de visión", {
        description: "Definí base URL y modelo en la pestaña «Visión» de Ajustes.",
        action: { label: "Abrir Ajustes", onClick: () => openSettings("vision") },
      });
      return;
    }
    try {
      await analyze(reference.id, Boolean(reference.analysis));
      toast.success(`${reference.fileName} analizada`);
    } catch (e) {
      toast.error("El análisis falló", { description: errorMessage(e) });
    }
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "group overflow-hidden rounded-lg border bg-elevated transition-colors",
        selected ? "border-amber/50" : "border-line hover:border-line-strong",
        isDragging && "opacity-60 shadow-xl",
      )}
    >
      <div className="flex items-stretch">
        <button
          type="button"
          className="flex w-4 cursor-grab items-center justify-center text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
          {...attributes}
          {...listeners}
          aria-label="Reordenar"
        >
          <GripVertical className="size-3" />
        </button>

        <button
          type="button"
          onClick={() => setUi("selectedReferenceId", selected ? null : reference.id)}
          className="flex min-w-0 flex-1 items-center gap-2 py-2 pr-2 text-left"
        >
          <Thumbnail reference={reference} />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-1.5">
              <Badge tone={toneForTag(tag)}>{tag}</Badge>
              <StatusDot reference={reference} />
            </div>
            <p className="truncate text-[11px] text-ink" title={reference.fileName}>
              {reference.fileName}
            </p>
            <p className="text-[10px] text-ink-faint">
              {roleMeta(reference.role).label} · {formatBytes(reference.sizeBytes)}
            </p>
          </div>
        </button>
      </div>

      {selected ? (
        <div className="space-y-2.5 border-t border-line bg-panel/60 p-2.5">
          <Field label="Rol">
            <Select
              value={reference.role}
              onValueChange={(role) => patch(reference.id, { role: role as ReferenceRole })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {rolesForKind(reference.kind).map((meta) => (
                  <SelectItem key={meta.role} value={meta.role} hint={meta.hint}>
                    {meta.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {FRAME_ROLES.includes(reference.role) ? (
            <Field label="Shot al que pertenece">
              <Select
                value={reference.shotId ?? shots[0]?.id ?? ""}
                onValueChange={(shotId) => patch(reference.id, { shotId })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {shots.map((shot, i) => (
                    <SelectItem key={shot.id} value={shot.id}>
                      Shot {i + 1}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}

          <Field label="Retención" hint={retentionHint(reference.retention)}>
            <Select
              value={reference.retention}
              onValueChange={(retention) =>
                patch(reference.id, { retention: retention as Retention })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {retentionsForKind(reference.kind).map((item) => (
                  <SelectItem key={item.value} value={item.value} hint={item.hint}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            label={reference.kind === "image" ? "Nota" : "Descripción (obligatoria)"}
            hint={
              reference.kind === "image"
                ? undefined
                : "Video y audio no se analizan: describí qué aporta esta referencia."
            }
          >
            <Textarea
              value={reference.note}
              rows={2}
              placeholder={
                reference.kind === "image"
                  ? "Qué querés que se conserve de esta imagen"
                  : "p. ej. gesto de saludo con la mano derecha, ritmo pausado"
              }
              onChange={(e) => patch(reference.id, { note: e.target.value })}
            />
          </Field>

          {reference.analysis ? (
            <div className="space-y-1 rounded border border-line bg-base/60 p-2">
              <p className="rail-label">Lo que vio el modelo</p>
              <p className="selectable text-[11px] leading-snug text-ink-muted">
                {reference.analysis.summary}
              </p>
              {reference.analysis.visibleText.length > 0 ? (
                <p className="text-[10px] text-warn">
                  Texto en la imagen: {reference.analysis.visibleText.map((t) => `"${t}"`).join(", ")}
                </p>
              ) : null}
            </div>
          ) : null}

          {reference.analysisError ? (
            <p className="rounded border border-danger/30 bg-danger/8 p-2 text-[10.5px] text-danger">
              {reference.analysisError}
            </p>
          ) : null}

          <div className="flex items-center gap-1.5">
            {reference.kind === "image" ? (
              <>
                <Button
                  size="sm"
                  variant={reference.analysis ? "outline" : "primary"}
                  className="flex-1"
                  disabled={reference.analyzing}
                  onClick={() => void runAnalysis()}
                >
                  {reference.analyzing ? <Loader2 className="animate-spin" /> : <Sparkles />}
                  {reference.analysis ? "Re-analizar" : "Analizar"}
                </Button>
                <Tooltip content="Ver a tamaño completo">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => setUi("lightboxReferenceId", reference.id)}
                  >
                    <Eye />
                  </Button>
                </Tooltip>
              </>
            ) : null}
            <Tooltip content="Quitar del proyecto">
              <Button
                size="icon-sm"
                variant="ghost"
                className={cn(reference.kind !== "image" && "ml-auto")}
                onClick={() => remove(reference.id)}
              >
                <Trash2 />
              </Button>
            </Tooltip>
          </div>
        </div>
      ) : null}
    </li>
  );
}

function Thumbnail({ reference }: { reference: ReferenceItem }) {
  if (reference.thumbnail) {
    return (
      <img
        src={reference.thumbnail}
        alt=""
        className="size-11 shrink-0 rounded object-cover ring-1 ring-line"
      />
    );
  }
  const Icon = reference.kind === "video" ? Film : reference.kind === "audio" ? AudioLines : ImageIcon;
  return (
    <div className="grid size-11 shrink-0 place-items-center rounded bg-raised ring-1 ring-line">
      <Icon className="size-4 text-ink-faint" />
    </div>
  );
}

function StatusDot({ reference }: { reference: ReferenceItem }) {
  if (reference.kind !== "image") {
    return reference.note.trim() ? null : (
      <Tooltip content="Falta describir esta referencia">
        <AlertTriangle className="size-3 text-warn" />
      </Tooltip>
    );
  }
  if (reference.analyzing) return <Loader2 className="size-3 animate-spin text-amber" />;
  if (reference.analysisError) return <AlertTriangle className="size-3 text-danger" />;
  if (reference.analysis) return <Check className="size-3 text-ok" />;
  return (
    <Tooltip content="Sin analizar">
      <span className="size-1.5 rounded-full bg-ink-faint" />
    </Tooltip>
  );
}

function retentionHint(retention: Retention): string {
  const all = [...retentionsForKind("image"), ...retentionsForKind("audio")];
  return all.find((r) => r.value === retention)?.hint ?? "";
}
