import { Plus, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea, Switch, ToggleGroup, ToggleGroupItem } from "@/components/ui/controls";
import { Field, Input, Label, Textarea } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { detectMode, MODE_HINTS, MODE_LABELS } from "@/core/h3/roles";
import type { H3Mode, VisibleTextPolicy } from "@/core/h3/types";
import { useProject } from "@/stores/projectStore";

const MODES: H3Mode[] = ["full-reference", "t2va", "i2va", "fl2va", "l2va"];

export function BriefPanel() {
  const brief = useProject((s) => s.project.brief);
  const references = useProject((s) => s.project.references);
  const multiWindow = useProject((s) => s.project.multiWindow);
  const patch = useProject((s) => s.patchBrief);
  const patchMultiWindow = useProject((s) => s.patchMultiWindow);

  const detected = detectMode(references);

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

        <Field
          label="Modo H3"
          hint={MODE_HINTS[brief.forcedMode ?? detected]}
          aside={
            brief.forcedMode ? (
              <button
                type="button"
                className="text-[10px] text-amber hover:underline"
                onClick={() => patch({ forcedMode: null })}
              >
                volver a automático
              </button>
            ) : (
              <span className="text-[10px] text-ink-faint">automático</span>
            )
          }
        >
          <Select
            value={brief.forcedMode ?? detected}
            onValueChange={(value) => patch({ forcedMode: value as H3Mode })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODES.map((mode) => (
                <SelectItem key={mode} value={mode} hint={MODE_HINTS[mode]}>
                  {MODE_LABELS[mode]}
                  {mode === detected ? " · detectado" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

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
                Genera una línea por ventana, con estado final encadenado.
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
                  min={2}
                  max={8}
                  value={multiWindow.windows}
                  onChange={(e) =>
                    patchMultiWindow({
                      windows: Math.min(8, Math.max(2, Number(e.target.value) || 2)),
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
