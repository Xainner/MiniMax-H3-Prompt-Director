import { save } from "@tauri-apps/plugin-dialog";
import {
  AlertTriangle,
  Copy,
  Download,
  FileWarning,
  Loader2,
  Play,
  ShieldCheck,
  Square,
  Terminal,
  Wrench,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea, Separator, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/controls";
import { Tooltip } from "@/components/ui/overlays";
import { MODE_LABELS } from "@/core/h3/roles";
import type { Finding } from "@/core/h3/types";
import { isModelFixable } from "@/core/h3/validate";
import { errorMessage, ipc, onLlmChunk } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import { useProject } from "@/stores/projectStore";
import { isProfileUsable, useSettings } from "@/stores/settingsStore";
import { useUi } from "@/stores/uiStore";
import { PromptView } from "./PromptView";
import { MaestroPanel } from "@/features/maestro/MaestroPanel";

export function OutputPanel() {
  const generation = useProject((s) => s.generation);
  const multiWindow = useProject((s) => s.project.multiWindow);
  const outputTab = useUi((s) => s.outputTab);
  const setUi = useUi((s) => s.set);

  const busy = generation.status === "writing" || generation.status === "rendering";
  const errors = generation.findings.filter((f) => f.severity === "error");
  const warnings = generation.findings.filter((f) => f.severity === "warning");

  useEffect(() => {
    if (!multiWindow.enabled && outputTab === "windows") setUi("outputTab", "prompt");
  }, [multiWindow.enabled, outputTab, setUi]);

  return (
    <section className="flex h-full flex-col bg-panel">
      <OutputToolbar busy={busy} />

      <Tabs
          value={outputTab}
          onValueChange={(value) => setUi("outputTab", value as "prompt" | "windows" | "maestro")}
          className="flex min-h-0 flex-1 flex-col"
        >
          <TabsList>
            <TabsTrigger value="prompt">Prompt</TabsTrigger>
            {multiWindow.enabled ? (
              <TabsTrigger value="windows">
                Ventanas
                {generation.windows.length > 0 ? (
                  <span className="ml-1 text-ink-faint">{generation.windows.length}</span>
                ) : null}
              </TabsTrigger>
            ) : null}
            <TabsTrigger value="maestro">Preparar y enviar</TabsTrigger>
          </TabsList>
          <TabsContent value="prompt" className="min-h-0 flex-1">
            <PromptSurface busy={busy} errors={errors} warnings={warnings} />
          </TabsContent>
          <TabsContent value="windows" className="min-h-0 flex-1">
            <WindowsSurface />
          </TabsContent>
          <TabsContent value="maestro" className="min-h-0 flex-1">
            <MaestroPanel />
          </TabsContent>
        </Tabs>
    </section>
  );
}

function OutputToolbar({ busy }: { busy: boolean }) {
  const generate = useProject((s) => s.generate);
  const generateWindows = useProject((s) => s.generateWindows);
  const cancel = useProject((s) => s.cancel);
  const prompt = useProject((s) => s.generation.prompt);
  const mode = useProject((s) => s.mode());
  const multiWindow = useProject((s) => s.project.multiWindow);
  const projectName = useProject((s) => s.project.name);
  const writerProfile = useSettings((s) => s.settings?.writer);
  const consoleOpen = useUi((s) => s.consoleOpen);
  const setUi = useUi((s) => s.set);
  const openSettings = useUi((s) => s.openSettings);
  const outputTab = useUi((s) => s.outputTab);
  const windows = useProject((s) => s.generation.windows);

  const showingWindows = multiWindow.enabled && outputTab === "windows";
  const content = showingWindows ? windows.join("\n\n") : prompt;

  async function run() {
    if (!isProfileUsable(writerProfile)) {
      toast.error("Falta configurar el LLM de mejora de prompt", {
        description:
          "Es un segundo modelo, aparte del de Visión. Definí base URL y modelo en la pestaña «Mejora de prompt».",
        action: { label: "Abrir Ajustes", onClick: () => openSettings("writer") },
      });
      return;
    }
    try {
      if (showingWindows) await generateWindows();
      else await generate();
    } catch (e) {
      toast.error("No se pudo generar el prompt", { description: errorMessage(e) });
    }
  }

  async function copy() {
    if (!content) return;
    await navigator.clipboard.writeText(content);
    toast.success(showingWindows ? "Ventanas copiadas" : "Prompt copiado");
  }

  async function exportFile() {
    if (!content) return;
    const path = await save({
      defaultPath: `${projectName.replace(/[\\/:*?"<>|]/g, "-")}.txt`,
      filters: [{ name: "Texto", extensions: ["txt", "md"] }],
    });
    if (!path) return;
    try {
      await ipc.exportText(path, content);
      toast.success("Archivo guardado");
    } catch (e) {
      toast.error("No se pudo guardar", { description: errorMessage(e) });
    }
  }

  return (
    <header className="flex h-8 shrink-0 items-center gap-1.5 border-b border-line px-2">
      <span className="rail-label">Salida</span>
      <span className="truncate text-[10px] text-ink-faint">{MODE_LABELS[mode]}</span>

      <div className="flex-1" />

      <Tooltip content="Consola del modelo">
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn(consoleOpen && "text-amber")}
          onClick={() => setUi("consoleOpen", !consoleOpen)}
        >
          <Terminal />
        </Button>
      </Tooltip>
      <Tooltip content="Copiar" shortcut="Ctrl ⇧ C">
        <Button variant="ghost" size="icon-sm" disabled={!content} onClick={() => void copy()}>
          <Copy />
        </Button>
      </Tooltip>
      <Tooltip content="Exportar a archivo">
        <Button variant="ghost" size="icon-sm" disabled={!content} onClick={() => void exportFile()}>
          <Download />
        </Button>
      </Tooltip>

      <Separator orientation="vertical" className="mx-1 h-4" />

      {busy ? (
        <Button variant="danger" size="md" onClick={() => void cancel()}>
          <Square />
          Cancelar
        </Button>
      ) : (
        <Button variant="primary" size="md" onClick={() => void run()}>
          <Play />
          Generar
        </Button>
      )}
    </header>
  );
}

function PromptSurface({
  busy,
  errors,
  warnings,
}: {
  busy: boolean;
  errors: Finding[];
  warnings: Finding[];
}) {
  const generation = useProject((s) => s.generation);
  const consoleOpen = useUi((s) => s.consoleOpen);
  const [range, setRange] = useState<{ offset: number; length: number } | null>(null);

  useEffect(() => {
    setRange(null);
  }, [generation.prompt]);

  useEffect(() => {
    if (!range) return;
    document.getElementById("finding-anchor")?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [range]);

  if (busy) return <WritingState />;

  if (generation.status === "error") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <FileWarning className="size-6 text-danger" />
        <p className="text-xs font-medium text-ink">La generación falló</p>
        <p className="max-w-[44ch] text-[11px] leading-snug text-ink-muted">{generation.error}</p>
      </div>
    );
  }

  if (!generation.prompt) return <IdleState />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-4">
          <PromptView text={generation.prompt} highlightRange={range} />
        </div>
      </ScrollArea>

      {consoleOpen ? <ModelConsole raw={generation.raw} /> : null}

      <ValidationBar
        errors={errors}
        warnings={warnings}
        onSelect={(finding) =>
          setRange(
            finding.offset !== undefined
              ? { offset: finding.offset, length: finding.length ?? 12 }
              : null,
          )
        }
      />
    </div>
  );
}

function WindowsSurface() {
  const windows = useProject((s) => s.generation.windows);
  const findings = useProject((s) => s.generation.windowFindings);

  if (windows.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-xs text-ink-muted">Todavía no generaste las ventanas</p>
        <p className="max-w-[44ch] text-[11px] leading-snug text-ink-faint">
          Cada ventana sale como una sola línea, autosuficiente, encadenada por el estado final de
          la anterior.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <ul className="space-y-3 p-4">
          {windows.map((text, index) => (
            <li key={index} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="rail-label">Window {index + 1}</span>
                <div className="h-px flex-1 bg-line" />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(text);
                    toast.success(`Window ${index + 1} copiada`);
                  }}
                >
                  <Copy />
                </Button>
              </div>
              <div className="rounded-md border border-line bg-base p-3">
                <PromptView text={text} className="text-[11.5px]" />
              </div>
            </li>
          ))}
        </ul>
      </ScrollArea>
      <ValidationBar
        errors={findings.filter((f) => f.severity === "error")}
        warnings={findings.filter((f) => f.severity === "warning")}
        onSelect={() => undefined}
      />
    </div>
  );
}

/**
 * Streaming JSON is not readable as a prompt, so the live tokens go to a
 * collapsible console instead of pretending to be the result.
 */
function WritingState() {
  const [ticker, setTicker] = useState("");
  const requestId = useProject((s) => s.generation.requestId);
  const status = useProject((s) => s.generation.status);
  const bufferRef = useRef("");

  useEffect(() => {
    bufferRef.current = "";
    setTicker("");
    const unlisten = onLlmChunk((chunk) => {
      if (chunk.requestId !== requestId) return;
      bufferRef.current = (bufferRef.current + chunk.delta).slice(-400);
      setTicker(bufferRef.current);
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [requestId]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <div className="flex items-center gap-2 text-xs text-ink">
        <Loader2 className="size-4 animate-spin text-amber" />
        {status === "writing" ? "El modelo está escribiendo…" : "Ensamblando el prompt…"}
      </div>
      <div className="h-24 w-full max-w-[520px] overflow-hidden rounded-md border border-line bg-base p-3">
        <p className="break-words font-mono text-[10.5px] leading-relaxed text-ink-faint">
          {ticker || "…"}
        </p>
      </div>
      <p className="max-w-[44ch] text-center text-[11px] leading-snug text-ink-faint">
        La estructura la arma la app. El modelo solo escribe la prosa, así que las secciones,
        timestamps y diálogos ya están garantizados.
      </p>
    </div>
  );
}

/**
 * Both models are mandatory and they live in separate tabs, so the idle state
 * says what is missing instead of letting the user find out by pressing Generar.
 */
function IdleState() {
  const settings = useSettings((s) => s.settings);
  const openSettings = useUi((s) => s.openSettings);

  const visionOk = isProfileUsable(settings?.vision);
  const writerOk = isProfileUsable(settings?.writer);
  const ready = visionOk && writerOk;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="grid size-14 place-items-center rounded-xl border border-line-strong bg-base">
        <Play className="size-5 text-ink-faint" />
      </div>
      <p className="text-xs font-medium text-ink-muted">Sin prompt todavía</p>

      {ready ? (
        <p className="max-w-[40ch] text-[11px] leading-snug text-ink-faint">
          Cargá referencias, describí la idea y pulsá Generar. El resultado se valida contra el
          checklist de la guía antes de mostrarse.
        </p>
      ) : (
        <div className="w-full max-w-[300px] space-y-2 rounded-lg border border-line bg-base/60 p-3 text-left">
          <p className="text-[11px] text-ink">Faltan modelos por configurar</p>
          <ul className="space-y-1.5">
            <SetupRow
              ok={visionOk}
              label="Visión"
              detail="Lee las imágenes de referencia"
              onClick={() => openSettings("vision")}
            />
            <SetupRow
              ok={writerOk}
              label="Mejora de prompt"
              detail="Escribe la prosa del prompt"
              onClick={() => openSettings("writer")}
            />
          </ul>
          <p className="text-[10.5px] leading-snug text-ink-faint">
            Son dos modelos distintos. Pueden apuntar al mismo proveedor: en la pestaña «Mejora de
            prompt» hay un botón para copiar la configuración de Visión.
          </p>
        </div>
      )}
    </div>
  );
}

function SetupRow({
  ok,
  label,
  detail,
  onClick,
}: {
  ok: boolean;
  label: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left transition-colors hover:bg-elevated"
      >
        {ok ? (
          <ShieldCheck className="size-3.5 shrink-0 text-ok" />
        ) : (
          <AlertTriangle className="size-3.5 shrink-0 text-warn" />
        )}
        <span className="min-w-0 flex-1">
          <span className={cn("block text-[11px]", ok ? "text-ink-muted" : "text-ink")}>{label}</span>
          <span className="block text-[10px] text-ink-faint">{detail}</span>
        </span>
        {!ok ? <span className="shrink-0 text-[10px] text-amber">configurar</span> : null}
      </button>
    </li>
  );
}

function ModelConsole({ raw }: { raw: string }) {
  return (
    <div className="max-h-40 shrink-0 border-t border-line bg-base">
      <div className="flex h-6 items-center gap-2 border-b border-line px-2">
        <span className="rail-label">Salida cruda del modelo</span>
      </div>
      <ScrollArea className="max-h-[136px]">
        <pre className="selectable whitespace-pre-wrap break-words p-2.5 font-mono text-[10.5px] leading-relaxed text-ink-faint">
          {raw || "(vacío)"}
        </pre>
      </ScrollArea>
    </div>
  );
}

function ValidationBar({
  errors,
  warnings,
  onSelect,
}: {
  errors: Finding[];
  warnings: Finding[];
  onSelect: (finding: Finding) => void;
}) {
  const [open, setOpen] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const repairAction = useProject((s) => s.repair);
  const total = errors.length + warnings.length;

  // Only prose problems can be repaired by re-running the writer. The rest come
  // from the project and need the user to change something.
  const repairable = errors.filter(isModelFixable);

  async function repair() {
    setRepairing(true);
    try {
      await repairAction();
      const remaining = useProject
        .getState()
        .generation.findings.filter((f) => f.severity === "error").length;
      if (remaining === 0) toast.success("Prompt reparado y validado");
      else toast.warning(`Quedan ${remaining} errores`, { description: "Revisá el panel." });
    } catch (e) {
      toast.error("La reparación falló", { description: errorMessage(e) });
    } finally {
      setRepairing(false);
    }
  }

  useEffect(() => {
    if (errors.length > 0) setOpen(true);
  }, [errors.length]);

  return (
    <div className="shrink-0 border-t border-line bg-base">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-full items-center gap-2 px-3 text-left"
      >
        {errors.length > 0 ? (
          <AlertTriangle className="size-3.5 text-danger" />
        ) : warnings.length > 0 ? (
          <AlertTriangle className="size-3.5 text-warn" />
        ) : (
          <ShieldCheck className="size-3.5 text-ok" />
        )}
        <span className="text-[11px] text-ink">
          {errors.length > 0
            ? `${errors.length} ${errors.length === 1 ? "error" : "errores"}`
            : warnings.length > 0
              ? "Sin errores"
              : "Válido contra el checklist de la guía"}
        </span>
        {warnings.length > 0 ? (
          <span className="text-[11px] text-warn">
            {warnings.length} {warnings.length === 1 ? "aviso" : "avisos"}
          </span>
        ) : null}
        <div className="flex-1" />
        {repairable.length > 0 ? (
          <span
            role="button"
            tabIndex={0}
            aria-disabled={repairing}
            title="Vuelve a pedirle la prosa al modelo con estos errores como instrucción. La estructura la rearma la app."
            className={cn(
              "inline-flex items-center gap-1 rounded border border-amber/40 bg-amber/12 px-1.5 py-0.5 text-[10.5px] text-amber hover:bg-amber/20",
              repairing && "opacity-50",
            )}
            onClick={(e) => {
              e.stopPropagation();
              if (!repairing) void repair();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !repairing) void repair();
            }}
          >
            {repairing ? <Loader2 className="size-3 animate-spin" /> : <Wrench className="size-3" />}
            Reescribir la prosa
          </span>
        ) : null}
        {total > 0 ? (
          <span className="text-[10px] text-ink-faint">{open ? "ocultar" : "ver"}</span>
        ) : null}
      </button>

      {open && total > 0 ? (
        <ScrollArea className="max-h-44 border-t border-line">
          <ul className="divide-y divide-line">
            {[...errors, ...warnings].map((finding, i) => (
              <li key={`${finding.rule}-${i}`}>
                <button
                  type="button"
                  onClick={() => onSelect(finding)}
                  className="flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-elevated"
                >
                  <span
                    className={cn(
                      "mt-1 size-1.5 shrink-0 rounded-full",
                      finding.severity === "error" ? "bg-danger" : "bg-warn",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] leading-snug text-ink-muted">
                      {finding.message}
                    </span>
                    <span className="font-mono text-[9.5px] text-ink-faint">
                      {finding.section} · {finding.rule}
                      {finding.severity === "error" && !isModelFixable(finding)
                        ? " · lo arreglás vos"
                        : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </ScrollArea>
      ) : null}
    </div>
  );
}
