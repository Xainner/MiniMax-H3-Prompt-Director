import { Copy, Lock, Plus, RefreshCw, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea, Switch, ToggleGroup, ToggleGroupItem } from "@/components/ui/controls";
import { Field, Input, Label, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { detectMode, MODE_HINTS, MODE_LABELS } from "@/core/h3/roles";
import {
  getH3StyleSkill,
  H3_SKILLS_SOURCE,
  H3_SKILLS_SOURCE_REVISION,
  H3_STYLE_SKILLS,
  validateH3SkillProfile,
  type H3StyleSkillId,
} from "@/core/h3/skills";
import type { VisibleTextPolicy } from "@/core/h3/types";
import { useProject } from "@/stores/projectStore";
import { toast } from "sonner";

export function BriefPanel() {
  const brief = useProject((s) => s.project.brief);
  const references = useProject((s) => s.project.references);
  const multiWindow = useProject((s) => s.project.multiWindow);
  const videoSeed = useProject((s) => s.project.videoSeed);
  const h3Skill = useProject((s) => s.project.h3Skill);
  const patch = useProject((s) => s.patchBrief);
  const patchMultiWindow = useProject((s) => s.patchMultiWindow);
  const patchH3Skill = useProject((s) => s.patchH3Skill);
  const setVideoSeed = useProject((s) => s.setVideoSeed);

  const detected = detectMode(references);
  // The mode is chosen once, in the launcher, and travels inside the project.
  const lockedMode = brief.forcedMode ?? detected;

  return (
    <ScrollArea className="h-full">
      <div className="space-y-5 p-4">
        <Field
          label="Idea"
          hint="Contá qué querés que pase en el video. El motor se encarga de la estructura."
        >
          <Textarea
            value={brief.idea}
            rows={5}
            placeholder="p. ej. Laura entra al local, mira el catálogo en su celular y sonríe a cámara mientras aparece el logo."
            onChange={(e) => patch({ idea: e.target.value })}
            className="min-h-[110px] text-[12.5px]"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Duración" hint="Segundos del video final.">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={120}
                value={brief.durationSec}
                onChange={(e) => patch({ durationSec: Math.max(1, Number(e.target.value) || 1) })}
                className="tnum w-16"
              />
              <span className="text-[11px] text-ink-faint">s</span>
            </div>
          </Field>

          <Field label="Formato">
            <ToggleGroup
              type="single"
              value={brief.aspectRatio}
              onValueChange={(value) => value && patch({ aspectRatio: value as never })}
              className="flex gap-0.5 rounded-md border border-line bg-base p-0.5"
            >
              <ToggleGroupItem value="9:16">9:16</ToggleGroupItem>
              <ToggleGroupItem value="16:9">16:9</ToggleGroupItem>
              <ToggleGroupItem value="1:1">1:1</ToggleGroupItem>
            </ToggleGroup>
          </Field>
        </div>

        <Field label="Seed de video" hint="Viaja con el proyecto y permite repetir una generación compatible.">
          <div className="flex items-center gap-2">
            <Input type="number" min={0} max={2147483647} value={videoSeed} onChange={(event) => setVideoSeed(Number(event.target.value))} className="tnum flex-1" />
            <Button variant="outline" size="icon-sm" title="Copiar seed" onClick={() => { void navigator.clipboard.writeText(String(videoSeed)); toast.success("Seed copiado"); }}><Copy /></Button>
            <Button variant="outline" size="icon-sm" title="Nuevo seed" onClick={() => setVideoSeed(crypto.getRandomValues(new Uint32Array(1))[0]! & 0x7fffffff)}><RefreshCw /></Button>
          </div>
        </Field>

        <Field
          label="Modo H3"
          hint={MODE_HINTS[lockedMode]}
          aside={
            brief.forcedMode ? (
              <span className="flex items-center gap-1 text-[10px] text-amber">
                <Lock className="size-2.5" /> fijado
              </span>
            ) : (
              <span className="text-[10px] text-ink-faint">automático</span>
            )
          }
        >
          <div className="flex h-7 items-center justify-between rounded-md border border-line bg-base/50 px-2.5">
            <span className="truncate text-[12px] text-ink">{MODE_LABELS[lockedMode]}</span>
            <Lock className="size-3 shrink-0 text-ink-faint" />
          </div>
        </Field>

        <H3SkillSection
          profile={h3Skill}
          references={references}
          onStyle={(styleId) => patchH3Skill({ styleId })}
          onInput={(key, value) => patchH3Skill({ inputs: { [key]: value } })}
          onApplyRecommendations={(durationSec, aspectRatio) => patch({ durationSec, aspectRatio })}
        />

        <Field label="Estilo visual" hint="Se convierte en la frase que abre detailed_description.">
          <Input
            value={brief.styleNote}
            placeholder="p. ej. premium cinematic advertising, luz suave, poca profundidad de campo"
            onChange={(e) => patch({ styleNote: e.target.value })}
          />
        </Field>

        <VisibleTextSection
          policy={brief.visibleTextPolicy}
          allowed={brief.allowedText}
          antiMicrotext={brief.antiMicrotext}
          onPolicy={(visibleTextPolicy) => patch({ visibleTextPolicy })}
          onAllowed={(allowedText) => patch({ allowedText })}
          onAnti={(antiMicrotext) => patch({ antiMicrotext })}
        />

        <div className="flex items-start justify-between gap-3 rounded-lg border border-line bg-base/50 p-3">
          <div className="space-y-0.5">
            <Label>Blindaje de continuidad</Label>
            <p className="max-w-[46ch] text-[10.5px] leading-snug text-ink-faint">
              Prohíbe deriva de identidad, cambio de ropa y personas duplicadas o clonadas
              (§32–§34). Son los fallos que la guía dice que los modelos producen solos.
            </p>
          </div>
          <Switch
            checked={brief.continuityGuards}
            onCheckedChange={(continuityGuards) => patch({ continuityGuards })}
          />
        </div>

        <Field
          label="Restricciones duras"
          hint="Máxima prioridad al resolver contradicciones (§49)."
        >
          <Textarea
            value={brief.extraConstraints}
            rows={3}
            placeholder="p. ej. exactamente dos personas visibles, sin espejos, sin cambio de ropa"
            onChange={(e) => patch({ extraConstraints: e.target.value })}
          />
        </Field>

        <div className="space-y-3 rounded-lg border border-line bg-base/50 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <Label>Maestro multi-window</Label>
              <p className="text-[10.5px] leading-snug text-ink-faint">
                Genera una línea por ventana, con estado final encadenado. Este conteo es para uso offline; Preparar y enviar lo deriva de Maestro.
              </p>
            </div>
            <Switch
              checked={multiWindow.enabled}
              onCheckedChange={(enabled) => patchMultiWindow({ enabled })}
            />
          </div>

          {multiWindow.enabled ? (
            <div className="grid grid-cols-2 gap-3 border-t border-line pt-3">
              <Field label="Ventanas">
                <Input
                  type="number"
                  min={1}
                  max={99}
                  value={multiWindow.windows}
                  onChange={(e) =>
                    patchMultiWindow({
                      windows: Math.min(99, Math.max(1, Number(e.target.value) || 1)),
                    })
                  }
                  className="tnum w-16"
                />
              </Field>
              <Field label="Carry motion & sound">
                <div className="flex h-7 items-center">
                  <Switch
                    checked={multiWindow.carryMotionAndSound}
                    onCheckedChange={(carryMotionAndSound) =>
                      patchMultiWindow({ carryMotionAndSound })
                    }
                  />
                </div>
              </Field>
            </div>
          ) : null}
        </div>
      </div>
    </ScrollArea>
  );
}

function H3SkillSection({
  profile,
  references,
  onStyle,
  onInput,
  onApplyRecommendations,
}: {
  profile: ReturnType<typeof useProject.getState>["project"]["h3Skill"];
  references: ReturnType<typeof useProject.getState>["project"]["references"];
  onStyle: (styleId: H3StyleSkillId | null) => void;
  onInput: (key: string, value: string) => void;
  onApplyRecommendations: (durationSec: number, aspectRatio: "9:16" | "16:9" | "1:1") => void;
}) {
  const skill = getH3StyleSkill(profile.styleId);
  const errors = validateH3SkillProfile(profile, references);

  return (
    <div className="space-y-3 rounded-lg border border-line bg-base/50 p-3">
      <Field
        label="Skill MiniMax H3"
        hint="La base técnica h3-prompt-writing siempre está activa; podés sumar exactamente un workflow visual."
      >
        <Select
          value={profile.styleId ?? "general"}
          onValueChange={(value) => onStyle(value === "general" ? null : value as H3StyleSkillId)}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="general" hint="Solo la estructura técnica oficial H3">General H3</SelectItem>
            {H3_STYLE_SKILLS.map((item) => (
              <SelectItem key={item.id} value={item.id} hint={item.bestFor}>{item.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <div className="rounded-md border border-line px-2.5 py-2 text-[10.5px] leading-relaxed text-ink-faint">
        {skill ? (
          <>
            <p className="text-[11px] font-medium text-ink">{skill.description}</p>
            <p><span className="text-ink-muted">Uso recomendado:</span> {skill.bestFor}</p>
            <p><span className="text-ink-muted">Requisitos:</span> {skill.requirements}</p>
          </>
        ) : (
          <p>Escritura H3 general con estructura técnica adaptada automáticamente al modo del proyecto.</p>
        )}
        <a className="mt-1 inline-block text-amber hover:underline" href={H3_SKILLS_SOURCE} target="_blank" rel="noreferrer">
          Fuente oficial · revisión {H3_SKILLS_SOURCE_REVISION.slice(0, 8)}
        </a>
      </div>

      {skill?.fields.map((field) => (
        <Field key={field.key} label={`${field.label}${field.required ? " *" : ""}`}>
          {field.multiline ? (
            <Textarea
              rows={3}
              value={profile.inputs[field.key] ?? ""}
              placeholder={field.placeholder}
              onChange={(event) => onInput(field.key, event.target.value)}
            />
          ) : (
            <Input
              value={profile.inputs[field.key] ?? ""}
              placeholder={field.placeholder}
              onChange={(event) => onInput(field.key, event.target.value)}
            />
          )}
        </Field>
      ))}

      {skill?.recommendedDurationSec && skill.recommendedAspectRatio ? (
        <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
          <p className="text-[10.5px] text-ink-faint">Sugerencia: {skill.recommendedDurationSec}s · {skill.recommendedAspectRatio}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onApplyRecommendations(skill.recommendedDurationSec!, skill.recommendedAspectRatio!)}
          >
            Aplicar recomendaciones
          </Button>
        </div>
      ) : null}

      {errors.length > 0 ? (
        <ul className="space-y-1 text-[10.5px] text-danger">
          {errors.map((error) => <li key={error}>{error}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

function VisibleTextSection({
  policy,
  allowed,
  antiMicrotext,
  onPolicy,
  onAllowed,
  onAnti,
}: {
  policy: VisibleTextPolicy;
  allowed: string[];
  antiMicrotext: boolean;
  onPolicy: (p: VisibleTextPolicy) => void;
  onAllowed: (values: string[]) => void;
  onAnti: (value: boolean) => void;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const value = draft.trim();
    if (!value || allowed.includes(value)) return;
    onAllowed([...allowed, value]);
    setDraft("");
  }

  return (
    <div className="space-y-3 rounded-lg border border-line bg-base/50 p-3">
      <Field
        label="Texto visible en pantalla"
        hint="Los modelos de video inventan microtexto. Controlarlo es la diferencia entre un render usable y uno con letras basura."
      >
        <ToggleGroup
          type="single"
          value={policy}
          onValueChange={(value) => value && onPolicy(value as VisibleTextPolicy)}
          className="flex gap-0.5 rounded-md border border-line bg-base p-0.5"
        >
          <ToggleGroupItem value="none">Sin texto</ToggleGroupItem>
          <ToggleGroupItem value="allow-list">Lista permitida</ToggleGroupItem>
          <ToggleGroupItem value="unrestricted">Libre</ToggleGroupItem>
        </ToggleGroup>
      </Field>

      {policy === "allow-list" ? (
        <div className="space-y-2">
          <div className="flex gap-1.5">
            <Input
              value={draft}
              placeholder="PUBLICÁ TU NEGOCIO"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
            />
            <Button size="icon" variant="outline" onClick={add} aria-label="Agregar texto">
              <Plus />
            </Button>
          </div>
          {allowed.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {allowed.map((value) => (
                <li
                  key={value}
                  className="flex items-center gap-1 rounded border border-line-strong bg-raised py-0.5 pl-2 pr-1 font-mono text-[10.5px] text-ink"
                >
                  “{value}”
                  <button
                    type="button"
                    className="rounded p-0.5 text-ink-faint hover:text-danger"
                    onClick={() => onAllowed(allowed.filter((v) => v !== value))}
                    aria-label={`Quitar ${value}`}
                  >
                    <X className="size-2.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[10.5px] text-ink-faint">
              Sin entradas: se tratará como «sin texto visible».
            </p>
          )}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
        <div className="space-y-0.5">
          <Label>Bloque anti-microtexto</Label>
          <p className="text-[10.5px] leading-snug text-ink-faint">
            Prohíbe explícitamente etiquetas falsas, números y pseudo-texto (§20.1).
          </p>
        </div>
        <Switch checked={antiMicrotext} onCheckedChange={onAnti} />
      </div>
    </div>
  );
}
