import { convertFileSrc } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { AlertTriangle, Download, Loader2, Play, RefreshCw, Square, WandSparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea, Switch } from "@/components/ui/controls";
import { Field, Input, Label, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { computeMaestroGeometry } from "@/core/maestro/geometry";
import { defaultMaestroIntent } from "@/core/maestro/references";
import { applyLoraTriggers, chooseTrigger, validateTriggerPlacements } from "@/core/maestro/triggers";
import type {
  MaestroAudioIntent,
  MaestroImageIntent,
  MaestroJob,
  MaestroLora,
  MaestroLoraSelection,
  MaestroTurboOption,
  MaestroTurboPreset,
  MaestroRunDraft,
} from "@/core/maestro/types";
import { errorMessage } from "@/lib/ipc";
import { useMaestro } from "@/stores/maestroStore";
import { useProject } from "@/stores/projectStore";
import { useSettings } from "@/stores/settingsStore";
import { useUi } from "@/stores/uiStore";

const IMAGE_INTENTS: MaestroImageIntent[] = ["identity", "scene", "style", "composition"];
const AUDIO_INTENTS: MaestroAudioIntent[] = ["voice", "drive", "style"];

export function MaestroPanel() {
  const project = useProject((state) => state.project);
  const generation = useProject((state) => state.generation);
  const patchMaestro = useProject((state) => state.patchMaestro);
  const patchMultiWindow = useProject((state) => state.patchMultiWindow);
  const generateWindows = useProject((state) => state.generateWindows);
  const setGeneratedWindows = useProject((state) => state.setGeneratedWindows);
  const instances = useSettings((state) => state.maestroInstances);
  const openSettings = useUi((state) => state.openSettings);
  const models = useMaestro((state) => state.models);
  const capabilities = useMaestro((state) => state.capabilities);
  const loras = useMaestro((state) => state.loras);
  const jobs = useMaestro((state) => state.jobs);
  const loading = useMaestro((state) => state.loadingCatalog);
  const submitting = useMaestro((state) => state.submitting);
  const loadInstance = useMaestro((state) => state.loadInstance);
  const loadModel = useMaestro((state) => state.loadModel);
  const submit = useMaestro((state) => state.submit);
  const cancel = useMaestro((state) => state.cancel);
  const preview = useMaestro((state) => state.preview);
  const download = useMaestro((state) => state.download);
  const [placements, setPlacements] = useState<ReturnType<typeof applyLoraTriggers>["placements"]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const draft = project.maestro ?? blankDraft();
  const context = [project.brief.idea, project.brief.styleNote, ...project.shots.map((shot) => shot.beat)].join(" ");
  const geometry = useMemo(
    () => capabilities
      ? computeMaestroGeometry(project.brief.durationSec, capabilities, draft.windowFrames, draft.overlapFrames, draft.continuity)
      : null,
    [capabilities, draft.continuity, draft.overlapFrames, draft.windowFrames, project.brief.durationSec],
  );
  const turboPresets = useMemo(() => getTurboPresets(capabilities?.turbo), [capabilities?.turbo]);
  const managedTurboFiles = useMemo(() => new Set(turboPresets.map((preset) => preset.filename)), [turboPresets]);
  const regularLoras = useMemo(() => loras.filter((lora) => !managedTurboFiles.has(lora.filename)), [loras, managedTurboFiles]);
  const projectJobs = jobs.filter((job) => job.projectId === project.id);
  const currentJob = projectJobs[0];

  useEffect(() => {
    if (instances.length === 0) return;
    const saved = useProject.getState().project.maestro;
    const instanceId = instances.some((item) => item.id === saved?.instanceId)
      ? saved!.instanceId
      : instances[0]!.id;
    void (async () => {
      try {
        const available = await loadInstance(instanceId);
        const currentProject = useProject.getState().project;
        const wantsOmni = currentProject.references.some((reference) => !["first-frame", "last-frame"].includes(reference.role));
        const model = available.find((item) => item.model_type === saved?.modelType)
          ?? available.find((item) => item.model_type.includes("ref2va") === wantsOmni)
          ?? available[0];
        if (!model) return;
        patchMaestro({ instanceId, modelType: model.model_type });
        await loadModel(instanceId, model.model_type);
        const caps = useMaestro.getState().capabilities;
        if (!caps) return;
        patchMaestro({
          resolution: saved?.resolution && caps.resolutions.some((item) => item.value === saved.resolution)
            ? saved.resolution
            : chooseResolution(caps.resolutions.map((item) => item.value), String(caps.defaults.resolution ?? ""), useProject.getState().project.brief.aspectRatio),
          windowFrames: saved?.windowFrames ?? caps.framesMaximum,
          overlapFrames: saved?.overlapFrames ?? caps.overlapDefault,
          turboEnabled: Boolean(saved?.turboEnabled && caps.turbo),
          turboPresetId: getTurboPresets(caps.turbo).some((preset) => preset.id === saved?.turboPresetId)
            ? saved?.turboPresetId
            : caps.turbo?.preset_id ?? getTurboPresets(caps.turbo)[0]?.id,
          turboWeight: saved?.turboWeight
            ?? getTurboPresets(caps.turbo).find((preset) => preset.id === saved?.turboPresetId)?.weight
            ?? getTurboPresets(caps.turbo).find((preset) => preset.id === caps.turbo?.preset_id)?.weight
            ?? getTurboPresets(caps.turbo)[0]?.weight,
        });
      } catch (error) {
        toast.error("No se pudo restaurar Maestro", { description: errorMessage(error) });
      }
    })();
  }, [instances, loadInstance, loadModel, patchMaestro, project.id]);

  async function selectInstance(instanceId: string) {
    patchMaestro({ instanceId, modelType: "", loras: [], reviewedWindows: [], turboEnabled: false, turboPresetId: undefined, turboWeight: undefined });
    try {
      const available = await loadInstance(instanceId);
      const wantsOmni = (project.brief.forcedMode ?? "") === "full-reference" || project.references.some((ref) => !["first-frame", "last-frame"].includes(ref.role));
      const preferred = available.find((model) => wantsOmni === model.model_type.includes("ref2va")) ?? available[0];
      if (preferred) await selectModel(instanceId, preferred.model_type);
    } catch (error) {
      toast.error("No se pudo leer Maestro", { description: errorMessage(error) });
    }
  }

  async function selectModel(instanceId: string, modelType: string) {
    patchMaestro({ modelType, loras: [], reviewedWindows: [], turboEnabled: false, turboPresetId: undefined, turboWeight: undefined });
    try {
      await loadModel(instanceId, modelType);
      const caps = useMaestro.getState().capabilities;
      if (!caps) return;
      const resolution = draft.resolution && caps.resolutions.some((item) => item.value === draft.resolution)
        ? draft.resolution
        : chooseResolution(caps.resolutions.map((item) => item.value), String(caps.defaults.resolution ?? ""), project.brief.aspectRatio);
      patchMaestro({
        modelType,
        resolution,
        windowFrames: caps.framesMaximum,
        overlapFrames: caps.overlapDefault,
        turboEnabled: false,
        turboPresetId: caps.turbo?.preset_id ?? getTurboPresets(caps.turbo)[0]?.id,
        turboWeight: getTurboPresets(caps.turbo).find((preset) => preset.id === caps.turbo?.preset_id)?.weight
          ?? getTurboPresets(caps.turbo)[0]?.weight,
      });
    } catch (error) {
      toast.error("No se pudo cargar el modelo", { description: errorMessage(error) });
    }
  }

  function updateLoras(selections: MaestroLoraSelection[]) {
    patchMaestro({ loras: selections, reviewedWindows: [] });
  }

  function toggleLora(lora: MaestroLora, enabled: boolean) {
    if (!enabled) return updateLoras(draft.loras.filter((item) => item.filename !== lora.filename));
    updateLoras([
      ...draft.loras,
      {
        filename: lora.filename,
        weight: recommendedWeight(lora),
        trigger: chooseTrigger(lora, context),
        omitTrigger: lora.trained_words.length === 0,
      },
    ]);
  }

  async function prepareWindows(): Promise<string[]> {
    if (!geometry) throw new Error("Seleccioná una instancia y un modelo Maestro.");
    let windows = useProject.getState().generation.windows;
    if (windows.length !== geometry.windows.length) {
      patchMultiWindow({ enabled: true, windows: geometry.windows.length, carryMotionAndSound: draft.continuity });
      await generateWindows(geometry.windows.length);
      windows = useProject.getState().generation.windows;
    }
    const applied = applyLoraTriggers(windows, loras, draft.loras, context);
    setPlacements(applied.placements);
    const selections = draft.loras.map((selection) => {
      const placement = applied.placements.find((item) => item.filename === selection.filename);
      return selection.trigger || !placement?.trigger ? selection : { ...selection, trigger: placement.trigger };
    });
    patchMaestro({ loras: selections, reviewedWindows: applied.windows });
    setGeneratedWindows(applied.windows);
    return applied.windows;
  }

  async function send() {
    try {
      const windows = await prepareWindows();
      const current = useProject.getState().project;
      const currentDraft = current.maestro ?? draft;
      const errors = validateTriggerPlacements(windows, useMaestro.getState().loras, currentDraft.loras);
      if (errors.length > 0) throw new Error(errors.join(" "));
      await submit(current, currentDraft, windows);
      toast.success("Trabajo enviado a Maestro");
    } catch (error) {
      toast.error("No se pudo enviar", { description: errorMessage(error) });
    }
  }

  async function showPreview(job: MaestroJob, filename: string) {
    try {
      const path = await preview(job, filename);
      setPreviewUrl(convertFileSrc(path));
    } catch (error) {
      toast.error("No se pudo cargar el resultado", { description: errorMessage(error) });
    }
  }

  async function saveOutput(job: MaestroJob, filename: string) {
    const destination = await save({ defaultPath: filename });
    if (!destination) return;
    try {
      await download(job, filename, destination);
      toast.success("Resultado guardado");
    } catch (error) {
      toast.error("No se pudo descargar", { description: errorMessage(error) });
    }
  }

  if (instances.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <AlertTriangle className="size-6 text-warn" />
        <p className="text-xs text-ink">No hay instancias Maestro configuradas</p>
        <p className="max-w-[44ch] text-[11px] text-ink-faint">Podés seguir generando prompts offline o agregar una URL/IP para preparar, enviar y seguir renders.</p>
        <Button variant="outline" size="md" onClick={() => openSettings("maestro")}>Abrir Ajustes</Button>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Instancia">
            <Select value={draft.instanceId} onValueChange={(value) => void selectInstance(value)}>
              <SelectTrigger><SelectValue placeholder="Elegir instancia" /></SelectTrigger>
              <SelectContent>{instances.map((instance) => <SelectItem key={instance.id} value={instance.id}>{instance.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Modelo H3">
            <Select value={draft.modelType} onValueChange={(value) => void selectModel(draft.instanceId, value)} disabled={!draft.instanceId || loading}>
              <SelectTrigger><SelectValue placeholder={loading ? "Cargando…" : "Elegir modelo"} /></SelectTrigger>
              <SelectContent>{models.map((model) => <SelectItem key={model.model_type} value={model.model_type}>{model.name}{!model.is_downloaded ? " · no descargado" : ""}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>

        {capabilities ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Resolución">
                <Select value={draft.resolution} onValueChange={(resolution) => patchMaestro({ resolution })}>
                  <SelectTrigger><SelectValue placeholder="Resolución" /></SelectTrigger>
                  <SelectContent>{capabilities.resolutions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Ventana (frames)">
                <Input type="number" value={draft.windowFrames ?? capabilities.framesMaximum} min={capabilities.framesMinimum} max={capabilities.framesMaximum} step={capabilities.framesStep} onChange={(event) => patchMaestro({ windowFrames: Number(event.target.value) })} />
              </Field>
              <Field label="Overlap">
                <Input type="number" value={draft.overlapFrames ?? capabilities.overlapDefault} min={capabilities.overlapMinimum} max={capabilities.overlapMaximum} step={capabilities.overlapStep} disabled={!draft.continuity} onChange={(event) => patchMaestro({ overlapFrames: Number(event.target.value) })} />
              </Field>
            </div>
            <div className="flex items-center justify-between rounded-md border border-line bg-base/50 p-3">
              <div><Label>Continuidad nativa</Label><p className="text-[10px] text-ink-faint">Carry de movimiento y audio; desactivado produce clips independientes.</p></div>
              <Switch checked={draft.continuity} onCheckedChange={(continuity) => patchMaestro({ continuity })} />
            </div>
            {geometry ? (
              <div className="rounded-md border border-line bg-base/50 px-3 py-2 text-[10.5px] text-ink-muted">
                {geometry.totalFrames} frames · {capabilities.fps} fps · {geometry.windows.length} {geometry.windows.length === 1 ? "ventana" : "ventanas"} · spans {geometry.windows.map((window) => `${window.startFrame}–${window.endFrame}`).join(" / ")}
              </div>
            ) : null}

            {capabilities.omniReference ? (
              <ReferenceIntents draft={draft} onChange={(referenceIntents) => patchMaestro({ referenceIntents })} />
            ) : (
              <p className="rounded-md border border-line bg-base/50 p-3 text-[10.5px] text-ink-faint">First/Last usa exclusivamente las referencias con roles first-frame y last-frame como endpoints.</p>
            )}

            {capabilities.turbo && turboPresets.length > 0 ? (
              <TurboSection
                option={capabilities.turbo}
                presets={turboPresets}
                enabled={Boolean(draft.turboEnabled)}
                presetId={draft.turboPresetId}
                weight={draft.turboWeight}
                onEnabledChange={(turboEnabled) => patchMaestro({ turboEnabled })}
                onPresetChange={(preset) => patchMaestro({ turboPresetId: preset.id, turboWeight: preset.weight })}
                onWeightChange={(turboWeight) => patchMaestro({ turboWeight })}
              />
            ) : null}

            <LoraSection catalog={regularLoras} selections={draft.loras} placements={placements} onToggle={toggleLora} onChange={updateLoras} />

            <div className="space-y-2">
              <div className="flex items-center gap-2"><span className="rail-label">Prompts revisados</span><div className="h-px flex-1 bg-line" /><Button variant="outline" size="sm" disabled={generation.status === "writing" || !geometry} onClick={() => void prepareWindows()}>{generation.status === "writing" ? <Loader2 className="animate-spin" /> : <WandSparkles />}Preparar {geometry?.windows.length ?? ""}</Button></div>
              {generation.windows.map((window, index) => (
                <Field key={index} label={`Window ${index + 1}`}>
                  <div className="space-y-1.5">
                    <Textarea rows={4} value={window} onChange={(event) => {
                      const next = [...generation.windows]; next[index] = event.target.value.replace(/\s*\n+\s*/g, " "); setGeneratedWindows(next);
                    }} />
                    <div className="flex flex-wrap gap-1">
                      {draft.loras.flatMap((selection) => selection.trigger && window.includes(selection.trigger)
                        ? [<span key={`${selection.filename}-${selection.trigger}`} className="rounded border border-amber/40 bg-amber/10 px-1.5 py-0.5 font-mono text-[9.5px] text-amber">{selection.trigger}</span>]
                        : [])}
                    </div>
                  </div>
                </Field>
              ))}
            </div>

            <div className="flex justify-end">
              <Button variant="primary" size="md" disabled={submitting || loading || !geometry} onClick={() => void send()}>{submitting ? <Loader2 className="animate-spin" /> : <Play />}Preparar y enviar</Button>
            </div>
          </>
        ) : null}

        {currentJob ? <JobCard job={currentJob} previewUrl={previewUrl} onPreview={showPreview} onDownload={saveOutput} onCancel={cancel} /> : null}
      </div>
    </ScrollArea>
  );
}

function ReferenceIntents({ draft, onChange }: { draft: MaestroRunDraft; onChange: (value: MaestroRunDraft["referenceIntents"]) => void }) {
  const references = useProject((state) => state.project.references);
  return (
    <div className="space-y-2 rounded-md border border-line bg-base/50 p-3">
      <span className="rail-label">Referencias Omni</span>
      {references.filter((reference) => ["image", "video", "audio"].includes(reference.kind)).map((reference) => {
        const options = reference.kind === "image" ? IMAGE_INTENTS : reference.kind === "audio" ? AUDIO_INTENTS : [];
        const value = draft.referenceIntents[reference.id] ?? defaultMaestroIntent(reference);
        return (
          <div key={reference.id} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[10.5px] text-ink-muted">{reference.fileName}</span>
            {options.length > 0 ? (
              <Select value={value} onValueChange={(intent) => onChange({ ...draft.referenceIntents, [reference.id]: intent as MaestroImageIntent | MaestroAudioIntent })}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>{options.map((intent) => <SelectItem key={intent} value={intent}>{intent}</SelectItem>)}</SelectContent>
              </Select>
            ) : <span className="text-[10px] text-ink-faint">video</span>}
          </div>
        );
      })}
    </div>
  );
}

function TurboSection({ option, presets, enabled, presetId, weight, onEnabledChange, onPresetChange, onWeightChange }: {
  option: MaestroTurboOption;
  presets: MaestroTurboPreset[];
  enabled: boolean;
  presetId?: string;
  weight?: number;
  onEnabledChange: (enabled: boolean) => void;
  onPresetChange: (preset: MaestroTurboPreset) => void;
  onWeightChange: (weight: number) => void;
}) {
  const selected = presets.find((preset) => preset.id === presetId)
    ?? presets.find((preset) => preset.id === option.preset_id)
    ?? presets[0]!;
  return (
    <div className="space-y-3 rounded-md border border-amber/30 bg-amber/5 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><Label>Modo Turbo</Label>{option.experimental ? <span className="rounded border border-warn/40 px-1.5 py-0.5 text-[9px] uppercase text-warn">experimental</span> : null}</div>
          <p className="text-[10px] text-ink-faint">Usa la aceleración y los pasos definidos por esta instancia de Maestro.</p>
        </div>
        <Switch checked={enabled} onCheckedChange={onEnabledChange} />
      </div>
      {enabled ? (
        <div className="grid grid-cols-[1fr_88px] gap-3">
          <Field label="Preset Turbo">
            <Select value={selected.id} onValueChange={(id) => onPresetChange(presets.find((preset) => preset.id === id) ?? selected)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{presets.map((preset) => <SelectItem key={preset.id} value={preset.id}>{preset.label}{preset.status ? ` · ${preset.status}` : ""}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Peso">
            <Input type="number" min={selected.weight_min ?? 0} max={selected.weight_max ?? 2} step={0.05} value={weight ?? selected.weight} onChange={(event) => onWeightChange(Number(event.target.value))} />
          </Field>
          <p className="col-span-2 text-[10px] text-ink-muted">{selected.steps} pasos · {selected.description ?? selected.revision ?? selected.filename}</p>
          {option.guide ? <p className="col-span-2 whitespace-pre-wrap text-[9.5px] leading-relaxed text-ink-faint">{option.guide}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function LoraSection({ catalog, selections, placements, onToggle, onChange }: { catalog: MaestroLora[]; selections: MaestroLoraSelection[]; placements: ReturnType<typeof applyLoraTriggers>["placements"]; onToggle: (lora: MaestroLora, enabled: boolean) => void; onChange: (value: MaestroLoraSelection[]) => void }) {
  return (
    <div className="space-y-2 rounded-md border border-line bg-base/50 p-3">
      <div className="flex items-center gap-2"><span className="rail-label">LoRAs de esta instancia</span><span className="text-[10px] text-ink-faint">{catalog.length}</span></div>
      {catalog.length === 0 ? <p className="text-[10.5px] text-ink-faint">No hay LoRAs compatibles instaladas.</p> : catalog.map((lora) => {
        const selected = selections.find((item) => item.filename === lora.filename);
        const placement = placements.find((item) => item.filename === lora.filename);
        return (
          <div key={lora.filename} className="space-y-2 border-t border-line pt-2 first:border-0 first:pt-0">
            <div className="flex items-center gap-2"><Switch checked={Boolean(selected)} onCheckedChange={(enabled) => onToggle(lora, enabled)} /><span className="min-w-0 flex-1 truncate text-[10.5px] text-ink">{lora.filename}</span>{lora.has_guide ? <span className="text-[9.5px] text-ok">guide</span> : null}</div>
            {selected ? (
              <div className="grid grid-cols-[80px_1fr_auto] gap-2 pl-8">
                <Input type="number" min={0} max={2} step={0.05} value={selected.weight} onChange={(event) => onChange(selections.map((item) => item.filename === selected.filename ? { ...item, weight: Number(event.target.value) } : item))} />
                {lora.trained_words.length > 0 ? (
                  <Select value={selected.trigger ?? lora.trained_words[0]} onValueChange={(trigger) => onChange(selections.map((item) => item.filename === selected.filename ? { ...item, trigger, omitTrigger: false } : item))}>
                    <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{lora.trained_words.map((word) => <SelectItem key={word} value={word}>{word}</SelectItem>)}</SelectContent>
                  </Select>
                ) : <span className="self-center text-[10px] text-ink-faint">sin trained_words</span>}
                <label className="flex items-center gap-1 text-[9.5px] text-ink-faint"><Switch checked={selected.omitTrigger} onCheckedChange={(omitTrigger) => onChange(selections.map((item) => item.filename === selected.filename ? { ...item, omitTrigger } : item))} />omitir</label>
                {placement ? <p className={`col-span-3 text-[9.5px] ${placement.omitted ? "text-warn" : "text-ok"}`}>{placement.omitted ? placement.reason : `Trigger exacto en Window ${placement.windowIndexes.join(", ")}`}</p> : null}
              </div>
            ) : null}
            {selected && lora.guide ? (
              <details className="ml-8 rounded border border-line bg-base px-2 py-1 text-[9.5px] text-ink-faint">
                <summary className="cursor-pointer text-ink-muted">Guía de uso</summary>
                <p className="mt-1 whitespace-pre-wrap leading-relaxed">{lora.guide}</p>
              </details>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function JobCard({ job, previewUrl, onPreview, onDownload, onCancel }: { job: MaestroJob; previewUrl: string | null; onPreview: (job: MaestroJob, filename: string) => Promise<void>; onDownload: (job: MaestroJob, filename: string) => Promise<void>; onCancel: (job: MaestroJob) => Promise<void> }) {
  const filename = job.outputFiles[0];
  const active = ["queued", "running", "held"].includes(job.status);
  return (
    <div className="space-y-3 rounded-lg border border-line-strong bg-raised p-3">
      <div className="flex items-center gap-2"><RefreshCw className={`size-3.5 ${active ? "animate-spin text-amber" : "text-ink-faint"}`} /><div className="min-w-0 flex-1"><p className="text-[11px] text-ink">{job.status} · {Math.round(job.progress)}%</p><p className="truncate text-[10px] text-ink-faint">{job.message || job.phase || job.jobId}</p></div>{active ? <Button variant="danger" size="sm" onClick={() => void onCancel(job)}><Square />Cancelar</Button> : null}</div>
      <div className="h-1 overflow-hidden rounded bg-base"><div className="h-full bg-amber transition-all" style={{ width: `${Math.max(0, Math.min(100, job.progress))}%` }} /></div>
      {job.error ? <p className="text-[10.5px] text-danger">{job.error}</p> : null}
      {filename ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate font-mono text-[10px] text-ink-muted">{filename}</span><Button variant="outline" size="sm" onClick={() => void onPreview(job, filename)}>Previsualizar</Button><Button variant="outline" size="sm" onClick={() => void onDownload(job, filename)}><Download />Guardar como</Button></div>
          {previewUrl ? <MediaPreview url={previewUrl} filename={filename} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function MediaPreview({ url, filename }: { url: string; filename: string }) {
  if (/\.(mp4|webm|mov|mkv)$/i.test(filename)) return <video src={url} controls className="max-h-72 w-full rounded bg-black" />;
  if (/\.(wav|mp3|m4a|ogg)$/i.test(filename)) return <audio src={url} controls className="w-full" />;
  return <img src={url} alt="Resultado Maestro" className="max-h-72 w-full rounded object-contain" />;
}

function recommendedWeight(lora: MaestroLora): number {
  if (typeof lora.recommended_weights === "number") return lora.recommended_weights;
  if (lora.recommended_weights && typeof lora.recommended_weights === "object") {
    const value = (lora.recommended_weights as Record<string, unknown>).default;
    if (typeof value === "number") return value;
  }
  return 0.8;
}

function chooseResolution(values: string[], preferred: string, aspect: "9:16" | "16:9" | "1:1"): string {
  const dimensions = (value: string) => {
    const match = /^(\d+)x(\d+)$/.exec(value);
    return match ? { value, width: Number(match[1]), height: Number(match[2]) } : null;
  };
  const candidates = values.map(dimensions).filter((item): item is NonNullable<ReturnType<typeof dimensions>> => Boolean(item));
  const preferredSize = dimensions(preferred);
  const targetPixels = preferredSize ? preferredSize.width * preferredSize.height : 864 * 480;
  const matching = candidates.filter((item) => aspect === "1:1"
    ? item.width === item.height
    : aspect === "9:16" ? item.height > item.width : item.width > item.height);
  return (matching.sort((a, b) => Math.abs(a.width * a.height - targetPixels) - Math.abs(b.width * b.height - targetPixels))[0]?.value
    ?? (values.includes(preferred) ? preferred : values[0])
    ?? preferred);
}

function blankDraft(): MaestroRunDraft {
  return { instanceId: "", modelType: "", resolution: "", continuity: true, turboEnabled: false, referenceIntents: {}, loras: [], reviewedWindows: [] };
}

function getTurboPresets(option?: MaestroTurboOption | null): MaestroTurboPreset[] {
  if (option?.presets?.length) return option.presets;
  if (!option?.filename) return [];
  return [{
    id: option.preset_id ?? "default",
    label: option.label ?? option.version_label ?? "Turbo",
    filename: option.filename,
    steps: option.steps ?? 20,
    weight: option.weight ?? 1,
  }];
}
