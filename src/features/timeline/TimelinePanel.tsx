import { MessageSquarePlus, Scissors, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, ScrollArea, Switch } from "@/components/ui/controls";
import { Field, Input, Label, Textarea } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger, Tooltip } from "@/components/ui/overlays";
import { recommendedShots, suggestedShotCount } from "@/core/h3/plan";
import { assignSpeakers, formatTimestamp, subjectTag } from "@/core/h3/render";
import type { DialogueLine, ShotDef } from "@/core/h3/types";
import { cn } from "@/lib/utils";
import { useProject } from "@/stores/projectStore";

export function TimelinePanel() {
  const project = useProject((s) => s.project);
  const addShot = useProject((s) => s.addShot);
  const patchShot = useProject((s) => s.patchShot);
  const removeShot = useProject((s) => s.removeShot);
  const addDialogue = useProject((s) => s.addDialogue);

  const speakers = assignSpeakers(project);
  const durationMs = Math.round(project.brief.durationSec * 1000);

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-4">
        <Ruler shots={project.shots} durationMs={durationMs} />

        <ul className="space-y-3">
          {project.shots.map((shot, index) => {
            const lines = project.dialogue.filter((l) => l.shotId === shot.id);
            const invalid =
              index > 0 &&
              (shot.cutMs === null ||
                shot.cutMs >= durationMs ||
                shot.cutMs <= (project.shots[index - 1]?.cutMs ?? 0));

            return (
              <li
                key={shot.id}
                className={cn(
                  "space-y-3 rounded-lg border bg-elevated p-3",
                  invalid ? "border-danger/50" : "border-line",
                )}
              >
                <div className="flex items-center gap-2">
                  <Badge tone="neutral" className="shrink-0">
                    [Shot {index + 1}]
                  </Badge>

                  {index === 0 ? (
                    <span className="tnum font-mono text-[10.5px] text-ink-faint">
                      00:00.000 · sin timestamp (§12.1)
                    </span>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10.5px] text-ink-faint">corte en</span>
                      <Input
                        type="number"
                        step={0.1}
                        min={0}
                        max={project.brief.durationSec}
                        value={((shot.cutMs ?? 0) / 1000).toFixed(1)}
                        onChange={(e) =>
                          patchShot(shot.id, {
                            cutMs: Math.round((Number(e.target.value) || 0) * 1000),
                          })
                        }
                        className="tnum h-6 w-16"
                      />
                      <span className="tnum font-mono text-[10.5px] text-ink-faint">
                        {formatTimestamp(shot.cutMs ?? 0)}
                      </span>
                    </div>
                  )}

                  <div className="flex-1" />

                  <Tooltip content="Agregar línea de diálogo">
                    <Button size="icon-sm" variant="ghost" onClick={() => addDialogue(shot.id)}>
                      <MessageSquarePlus />
                    </Button>
                  </Tooltip>
                  {project.shots.length > 1 ? (
                    <Tooltip content="Eliminar shot">
                      <Button size="icon-sm" variant="ghost" onClick={() => removeShot(shot.id)}>
                        <Trash2 />
                      </Button>
                    </Tooltip>
                  ) : null}
                </div>

                <Field label="Qué pasa en este shot" hint="Opcional. El modelo escribe la prosa.">
                  <Input
                    value={shot.beat}
                    placeholder="p. ej. entra al local y mira alrededor"
                    onChange={(e) => patchShot(shot.id, { beat: e.target.value })}
                  />
                </Field>

                {lines.length > 0 ? (
                  <ul className="space-y-2 border-t border-line pt-3">
                    {lines.map((line) => (
                      <DialogueRow key={line.id} line={line} speakers={speakers} />
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>

        <Button variant="outline" size="md" className="w-full" onClick={addShot}>
          <Scissors />
          Agregar corte
        </Button>
      </div>
    </ScrollArea>
  );
}

function Ruler({ shots, durationMs }: { shots: ShotDef[]; durationMs: number }) {
  const durationSec = durationMs / 1000;
  const { min, max } = recommendedShots(durationSec);
  const suggested = suggestedShotCount(durationSec);
  const planShots = useProject((s) => s.planShots);
  const offPlan = shots.length < min || shots.length > max;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="rail-label">Línea de tiempo</span>
        <span className="tnum font-mono text-[10px] text-ink-faint">
          {formatTimestamp(durationMs)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <p className={cn("flex-1 text-[10.5px] leading-snug", offPlan ? "text-warn" : "text-ink-faint")}>
          Para {durationSec}s la guía sugiere {min}–{max} shots (§12.3). Tenés {shots.length}.
          {shots.length === 1 ? " Con uno solo, todo ocurre en una toma continua." : ""}
        </p>
        {shots.length !== suggested ? (
          <Button size="sm" variant="outline" onClick={() => planShots(suggested)}>
            <Scissors />
            Planificar {suggested}
          </Button>
        ) : null}
      </div>
      <div className="relative h-8 overflow-hidden rounded-md border border-line bg-base">
        {shots.map((shot, index) => {
          const start = index === 0 ? 0 : (shot.cutMs ?? 0);
          const next = shots[index + 1]?.cutMs ?? durationMs;
          const left = (start / durationMs) * 100;
          const width = Math.max(2, ((next - start) / durationMs) * 100);
          return (
            <div
              key={shot.id}
              className="absolute inset-y-0 flex items-center justify-center border-l border-line-strong first:border-l-0"
              style={{ left: `${left}%`, width: `${width}%` }}
            >
              <span
                className={cn(
                  "tnum rounded px-1 font-mono text-[10px]",
                  index % 2 === 0 ? "bg-amber/12 text-amber" : "bg-cyan/12 text-cyan",
                )}
              >
                {index + 1}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DialogueRow({ line, speakers }: { line: DialogueLine; speakers: Map<string, string> }) {
  const subjects = useProject((s) => s.project.subjects);
  const patch = useProject((s) => s.patchDialogue);
  const remove = useProject((s) => s.removeDialogue);

  const speakerId =
    line.subjectIds.length > 0
      ? line.subjectIds.map((id) => speakers.get(id)).filter(Boolean).join(",")
      : speakers.get("__narrator__");

  const words = line.text.trim().split(/\s+/).filter(Boolean).length;

  return (
    <li className="space-y-2 rounded-md border border-line bg-base/60 p-2.5">
      <div className="flex items-center gap-2">
        <Badge tone="subject">{speakerId ? `(${speakerId})` : "(S?)"}</Badge>

        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex h-6 min-w-0 flex-1 items-center gap-1 rounded border border-line bg-base px-2 text-left text-[11px] text-ink-muted hover:border-line-strong"
            >
              {line.subjectIds.length === 0
                ? "Narrador en off"
                : line.subjectIds
                    .map((id) => {
                      const idx = subjects.findIndex((s) => s.id === id);
                      return idx >= 0 ? subjectTag(idx) : "?";
                    })
                    .join(" + ")}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 p-1">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-ink-muted hover:bg-raised"
              onClick={() => patch(line.id, { subjectIds: [] })}
            >
              <span
                className={cn(
                  "size-3 rounded-[3px] border",
                  line.subjectIds.length === 0 ? "border-amber bg-amber" : "border-line-strong",
                )}
              />
              Narrador en off
            </button>
            {subjects.map((subject, index) => {
              const active = line.subjectIds.includes(subject.id);
              return (
                <button
                  key={subject.id}
                  type="button"
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-ink hover:bg-raised"
                  onClick={() =>
                    patch(line.id, {
                      subjectIds: active
                        ? line.subjectIds.filter((id) => id !== subject.id)
                        : [...line.subjectIds, subject.id],
                    })
                  }
                >
                  <span
                    className={cn(
                      "size-3 rounded-[3px] border",
                      active ? "border-amber bg-amber" : "border-line-strong",
                    )}
                  />
                  <Badge tone="subject">{subjectTag(index)}</Badge>
                  <span className="truncate">{subject.label || "sin nombre"}</span>
                </button>
              );
            })}
          </PopoverContent>
        </Popover>

        <Input
          value={line.language}
          onChange={(e) => patch(line.id, { language: e.target.value })}
          className="h-6 w-24"
          placeholder="Spanish"
        />

        <Tooltip content="Eliminar línea">
          <Button size="icon-sm" variant="ghost" onClick={() => remove(line.id)}>
            <Trash2 />
          </Button>
        </Tooltip>
      </div>

      <Input
        value={line.delivery}
        placeholder={
          line.subjectIds.length === 0
            ? "Descripción del narrador — p. ej. A warm Latin-American female narrator"
            : "Actuación, fuera del tag <d> — p. ej. smiles warmly and"
        }
        onChange={(e) => patch(line.id, { delivery: e.target.value })}
      />

      <Textarea
        value={line.text}
        rows={2}
        placeholder="Palabras exactas. No se reescriben (§15.2)."
        onChange={(e) => patch(line.id, { text: e.target.value })}
        className="font-mono text-[11.5px]"
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <ToggleRow
          label="Voice-over"
          checked={line.voiceover}
          onChange={(voiceover) => patch(line.id, { voiceover })}
        />
        <ToggleRow
          label="Cruza el corte"
          checked={line.scenetrans}
          onChange={(scenetrans) => patch(line.id, { scenetrans })}
        />
        <ToggleRow
          label="Se interrumpe"
          checked={line.cutoff}
          onChange={(cutoff) => patch(line.id, { cutoff })}
        />
        <span className="tnum ml-auto font-mono text-[10px] text-ink-faint">{words} palabras</span>
      </div>

      {line.scenetrans && !line.text.includes("<scenetrans>") ? (
        <p className="rounded border border-warn/30 bg-warn/8 px-2 py-1 text-[10.5px] text-warn">
          Insertá <code className="font-mono">{"<scenetrans>"}</code> en el punto exacto donde la
          frase cruza el corte.
        </p>
      ) : null}
    </li>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5">
      <Switch checked={checked} onCheckedChange={onChange} />
      <Label className="cursor-pointer">{label}</Label>
    </label>
  );
}
