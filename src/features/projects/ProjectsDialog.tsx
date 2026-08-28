import { confirm, open, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { Archive, CopyPlus, Download, FilePlus2, FolderOpen, Loader2, Save, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/controls";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { Field, Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MODE_LABELS } from "@/core/h3/roles";
import type { H3Mode } from "@/core/h3/types";
import type { ProjectImportPreview } from "@/core/projects/types";
import { errorMessage, ipc, type ProjectSummary } from "@/lib/ipc";
import { formatBytes, formatRelative } from "@/lib/utils";
import { useApp } from "@/stores/appStore";
import { useProject } from "@/stores/projectStore";
import { useMaestro } from "@/stores/maestroStore";
import { useUi } from "@/stores/uiStore";
import { useProjectTransition } from "@/stores/projectTransitionStore";

type EditorMode = "list" | "new" | "save-as" | "export" | "import";
const MODES: H3Mode[] = ["full-reference", "t2va", "i2va", "fl2va", "l2va"];

export function ProjectsDialog() {
  const openDialog = useUi((state) => state.projectsOpen);
  const setUi = useUi((state) => state.set);
  const intent = useUi((state) => state.projectsIntent);
  const requestTransition = useProjectTransition((state) => state.request);
  const project = useProject((state) => state.project);
  const dirty = useProject((state) => state.dirty);
  const openProject = useProject((state) => state.open);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<EditorMode>("list");
  const [name, setName] = useState("");
  const [h3Mode, setH3Mode] = useState<H3Mode>("full-reference");
  const [selectedOutputs, setSelectedOutputs] = useState<string[]>([]);
  const [importPath, setImportPath] = useState("");
  const [importPreview, setImportPreview] = useState<ProjectImportPreview | null>(null);
  const maestroJobs = useMaestro((state) => state.jobs).filter((job) => job.projectId === project.id && job.status === "completed");
  const missingReferences = project.references.filter((reference) => reference.available === false);
  const outputChoices = useMemo(() => {
    const remote = maestroJobs.flatMap((job) => job.outputFiles.map((fileName) => ({ key: `${job.jobId}:${fileName}`, fileName, job, local: project.outputs.find((output) => output.jobId === job.jobId && output.fileName === fileName) })));
    const remoteIds = new Set(remote.flatMap((choice) => choice.local ? [choice.local.id] : []));
    return [...remote, ...project.outputs.filter((output) => !remoteIds.has(output.id)).map((local) => ({ key: `local:${local.id}`, fileName: local.fileName, local, job: undefined }))];
  }, [maestroJobs, project.outputs]);
  const selectedOutputSize = useMemo(() => outputChoices.filter((choice) => selectedOutputs.includes(choice.key)).reduce((sum, choice) => sum + (choice.local?.sizeBytes ?? 0), 0), [outputChoices, selectedOutputs]);

  async function refresh() {
    setLoading(true);
    try { setProjects(await ipc.listProjects()); }
    catch (error) { toast.error("No se pudieron listar los proyectos", { description: errorMessage(error) }); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (!openDialog) return;
    setMode(intent === "import" ? "list" : intent);
    if (intent === "save-as") setName(`${useProject.getState().project.name} copia`);
    if (intent === "export") setSelectedOutputs([]);
    if (intent === "import") void chooseImport();
    void refresh();
  }, [openDialog, intent]);

  async function createProject() {
    await requestTransition(async () => {
      try {
        await useProject.getState().create(name, h3Mode);
        useApp.getState().setView("workspace");
        setUi("projectsOpen", false);
        toast.success("Proyecto creado");
      } catch (error) { toast.error("No se pudo crear", { description: errorMessage(error) }); }
    });
  }

  async function saveCurrent() {
    try { await useProject.getState().save(); await refresh(); toast.success("Proyecto guardado"); }
    catch (error) { toast.error("No se pudo guardar", { description: errorMessage(error) }); }
  }

  async function saveAs() {
    try { await useProject.getState().saveAs(name); await refresh(); setMode("list"); toast.success("Copia creada"); }
    catch (error) { toast.error("No se pudo guardar como", { description: errorMessage(error) }); }
  }

  async function exportPackage() {
    if (missingReferences.length > 0) {
      toast.error("No se puede exportar", { description: "Relocalizá todas las referencias faltantes primero." });
      return;
    }
    const destination = await saveDialog({ defaultPath: `${safeBaseName(project.name)}.directorproj`, filters: [{ name: "Proyecto Director", extensions: ["directorproj"] }] });
    if (!destination) return;
    try {
      const includedOutputIds: string[] = [];
      const unavailable: string[] = [];
      for (const choice of outputChoices.filter((item) => selectedOutputs.includes(item.key))) {
        if (choice.local?.available) { includedOutputIds.push(choice.local.id); continue; }
        if (!choice.job) { unavailable.push(choice.fileName); continue; }
        try {
          const downloaded = await useMaestro.getState().preview(choice.job, choice.fileName);
          const asset = await ipc.ingestProjectAsset(project.id, downloaded, "output");
          useProject.getState().addOutput({ id: asset.id, jobId: choice.job.jobId, fileName: choice.fileName, path: asset.path, sizeBytes: asset.sizeBytes, sha256: asset.sha256, available: true, seed: choice.job.seed, createdAt: Date.now() });
          includedOutputIds.push(asset.id);
        } catch { unavailable.push(choice.fileName); }
      }
      await useProject.getState().save();
      const current = useProject.getState().project;
      const report = await ipc.exportProjectPackage({ destination, projectData: JSON.stringify(current), includedOutputIds });
      unavailable.forEach((fileName) => toast.warning("Resultado omitido", { description: `No se pudo descargar «${fileName}» desde Maestro.` }));
      report.warnings.forEach((warning) => toast.warning("Exportación parcial", { description: warning }));
      toast.success("Proyecto exportado", { description: `${report.assetCount} recursos · ${formatBytes(report.totalSize)}` });
      setMode("list");
    } catch (error) { toast.error("No se pudo exportar", { description: errorMessage(error) }); }
  }

  async function chooseImport() {
    const path = await open({ multiple: false, filters: [{ name: "Proyecto Director", extensions: ["directorproj"] }] });
    if (!path || Array.isArray(path)) return;
    try {
      setImportPath(path);
      setImportPreview(await ipc.previewProjectPackage(path));
      setMode("import");
    } catch (error) { toast.error("Paquete inválido", { description: errorMessage(error) }); }
  }

  async function importPackage(strategy: "copy" | "replace") {
    await requestTransition(async () => {
      try {
        const raw = await ipc.importProjectPackage(importPath, strategy);
        const imported = JSON.parse(raw) as { id: string; name: string };
        await openProject(imported.id);
        useApp.getState().setView("workspace");
        setUi("projectsOpen", false);
        toast.success(`«${imported.name}» importado`);
      } catch (error) { toast.error("No se pudo importar", { description: errorMessage(error) }); }
    });
  }

  return (
    <Dialog open={openDialog} onOpenChange={(value) => setUi("projectsOpen", value)}>
      <DialogContent title="Proyectos" description="Autosave local y paquetes portables .directorproj." className="w-[min(680px,94vw)]">
        {mode === "list" ? (
          <>
            <div className="flex flex-wrap gap-2 px-4 pt-3">
              <Button size="sm" variant="primary" onClick={() => { setName(""); setMode("new"); }}><FilePlus2 />Nuevo</Button>
              <Button size="sm" variant="outline" onClick={() => void saveCurrent()} disabled={!dirty}><Save />Guardar</Button>
              <Button size="sm" variant="outline" onClick={() => { setName(`${project.name} copia`); setMode("save-as"); }}><CopyPlus />Guardar como</Button>
              <Button size="sm" variant="outline" onClick={() => { setSelectedOutputs([]); setMode("export"); }}><Archive />Exportar</Button>
              <Button size="sm" variant="outline" onClick={() => void chooseImport()}><Upload />Importar</Button>
            </div>
            {missingReferences.length > 0 ? <p className="mx-4 mt-3 rounded border border-danger/40 bg-danger/10 p-2 text-[10.5px] text-danger">{missingReferences.length} referencias no disponibles en el proyecto actual.</p> : null}
            <ScrollArea className="mt-3 max-h-[50vh] min-h-[180px]">
              {loading ? <div className="grid h-[180px] place-items-center"><Loader2 className="size-4 animate-spin text-ink-faint" /></div> : projects.length === 0 ? (
                <div className="flex h-[180px] flex-col items-center justify-center gap-2"><FolderOpen className="size-5 text-ink-faint" /><p className="text-[11px] text-ink-faint">No hay proyectos guardados.</p></div>
              ) : <ul className="divide-y divide-line">{projects.map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => void requestTransition(async () => { await openProject(item.id); useApp.getState().setView("workspace"); setUi("projectsOpen", false); })}>
                    <p className="truncate text-xs text-ink">{item.name}{item.id === project.id ? <span className="ml-1.5 text-[10px] text-amber">actual</span> : null}</p>
                    <p className="text-[10px] text-ink-faint">{formatRelative(item.updatedAt)} · {item.referenceCount} refs · {formatBytes(item.totalSize)}</p>
                  </button>
                  <Button size="icon-sm" variant="ghost" aria-label={`Eliminar ${item.name}`} onClick={async () => {
                    if (!await confirm(`¿Eliminar «${item.name}» y sus recursos locales?`, { title: "Eliminar proyecto", kind: "warning" })) return;
                    try { await ipc.deleteProject(item.id); if (item.id === project.id) { useProject.getState().reset(); useApp.getState().setView("home"); } await refresh(); }
                    catch (error) { toast.error("No se pudo eliminar", { description: errorMessage(error) }); }
                  }}><Trash2 /></Button>
                </li>
              ))}</ul>}
            </ScrollArea>
          </>
        ) : null}

        {mode === "new" ? <ProjectForm name={name} onName={setName} mode={h3Mode} onMode={setH3Mode} onSubmit={() => void createProject()} /> : null}
        {mode === "save-as" ? <div className="space-y-4 p-4"><Field label="Nombre de la copia"><Input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></Field><Button variant="primary" size="md" disabled={!name.trim()} onClick={() => void saveAs()}><CopyPlus />Crear copia</Button></div> : null}
        {mode === "export" ? <div className="space-y-3 p-4"><p className="text-[11px] text-ink-muted">Se incluirán siempre {project.references.length} referencias originales ({formatBytes(project.references.reduce((sum, reference) => sum + reference.sizeBytes, 0))}).</p><div className="space-y-1"><p className="rail-label">Resultados opcionales</p>{outputChoices.length === 0 ? <p className="text-[10px] text-ink-faint">Este proyecto todavía no tiene resultados Maestro.</p> : outputChoices.map((choice) => <label key={choice.key} className="flex items-center gap-2 text-[10.5px] text-ink-muted"><input type="checkbox" checked={selectedOutputs.includes(choice.key)} onChange={(event) => setSelectedOutputs((items) => event.target.checked ? [...items, choice.key] : items.filter((id) => id !== choice.key))} /><span className="min-w-0 flex-1 truncate">{choice.fileName}</span><span>{choice.local ? formatBytes(choice.local.sizeBytes) : "se descargará"}</span></label>)}</div><p className="text-[10px] text-ink-faint">Tamaño local seleccionado: {formatBytes(selectedOutputSize)}</p><Button variant="primary" size="md" disabled={missingReferences.length > 0} onClick={() => void exportPackage()}><Download />Elegir destino</Button></div> : null}
        {mode === "import" && importPreview ? <div className="space-y-3 p-4"><p className="text-sm text-ink">{importPreview.projectName}</p><p className="text-[10.5px] text-ink-muted">Formato v{importPreview.formatVersion} · Director {importPreview.appVersion} · {importPreview.referenceCount} referencias · {importPreview.outputCount} resultados · {formatBytes(importPreview.totalSize)}</p>{importPreview.hasConflict ? <p className="rounded border border-warn/40 bg-warn/10 p-2 text-[10.5px] text-warn">Ya existe un proyecto con este ID.</p> : null}<div className="flex gap-2"><Button variant="primary" size="md" onClick={() => void importPackage("copy")}>{importPreview.hasConflict ? "Crear copia" : "Importar"}</Button>{importPreview.hasConflict ? <Button variant="danger" size="md" onClick={() => void importPackage("replace")}>Reemplazar</Button> : null}</div></div> : null}

        <DialogFooter><Button variant="outline" size="md" onClick={() => mode === "list" ? setUi("projectsOpen", false) : setMode("list")}>{mode === "list" ? "Cerrar" : "Volver"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProjectForm({ name, onName, mode, onMode, onSubmit }: { name: string; onName: (value: string) => void; mode: H3Mode; onMode: (value: H3Mode) => void; onSubmit: () => void }) {
  return <div className="space-y-4 p-4"><Field label="Nombre"><Input autoFocus value={name} onChange={(event) => onName(event.target.value)} placeholder="Mi proyecto" /></Field><Field label="Modo H3"><Select value={mode} onValueChange={(value) => onMode(value as H3Mode)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{MODES.map((item) => <SelectItem key={item} value={item}>{MODE_LABELS[item]}</SelectItem>)}</SelectContent></Select></Field><Button variant="primary" size="md" disabled={!name.trim()} onClick={onSubmit}><FilePlus2 />Crear proyecto</Button></div>;
}

function safeBaseName(value: string): string {
  return value.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, "_") || "Proyecto Director";
}
