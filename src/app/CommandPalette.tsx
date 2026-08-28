import { Command } from "cmdk";
import {
  FilePlus2,
  FolderOpen,
  ImagePlus,
  Play,
  Save,
  Settings2,
  Sparkles,
  Copy,
  Terminal,
  LayoutGrid,
  Archive,
  Upload,
  House,
  CopyPlus,
} from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { open } from "@tauri-apps/plugin-dialog";
import { errorMessage } from "@/lib/ipc";
import { useApp } from "@/stores/appStore";
import { useProject } from "@/stores/projectStore";
import { useUi } from "@/stores/uiStore";
import { useProjectTransition } from "@/stores/projectTransitionStore";
import { Dialog, DialogContent } from "@/components/ui/overlays";

interface Action {
  id: string;
  label: string;
  hint?: string;
  shortcut?: string;
  icon: ReactNode;
  run: () => void | Promise<void>;
  group: string;
  disabled?: boolean;
  disabledReason?: string;
}

export function CommandPalette() {
  const openPalette = useUi((s) => s.paletteOpen);
  const setUi = useUi((s) => s.set);
  const openProjects = useUi((s) => s.openProjects);
  const requestTransition = useProjectTransition((s) => s.request);
  const view = useApp((s) => s.view);
  const project = useProject();

  const actions: Action[] = [
    {
      id: "new",
      group: "Proyecto",
      label: "Nuevo proyecto",
      icon: <FilePlus2 />,
      run: () => requestTransition(() => { useProject.getState().reset(); useApp.getState().setView("home"); }),
    },
    {
      id: "open",
      group: "Proyecto",
      label: "Abrir proyecto…",
      icon: <FolderOpen />,
      run: () => openProjects("list"),
    },
    { id: "save-as", group: "Proyecto", label: "Guardar como…", icon: <CopyPlus />, run: () => openProjects("save-as"), disabled: view === "home", disabledReason: "Abrí o creá un proyecto primero" },
    { id: "import", group: "Proyecto", label: "Importar .directorproj…", icon: <Upload />, run: () => openProjects("import") },
    { id: "export", group: "Proyecto", label: "Exportar .directorproj…", icon: <Archive />, run: () => openProjects("export"), disabled: view === "home", disabledReason: "No hay un proyecto activo" },
    { id: "home", group: "Proyecto", label: "Volver al inicio", icon: <House />, run: () => requestTransition(() => { useProject.getState().reset(); useApp.getState().setView("home"); }), disabled: view === "home", disabledReason: "Ya estás en el inicio" },
    {
      id: "save",
      group: "Proyecto",
      label: "Guardar",
      shortcut: "Ctrl S",
      icon: <Save />,
      run: async () => {
        await project.save();
        toast.success("Proyecto guardado");
      },
      disabled: view === "home",
      disabledReason: "No hay un proyecto activo",
    },
    {
      id: "add-ref",
      group: "Referencias",
      label: "Agregar referencias…",
      shortcut: "Ctrl O",
      icon: <ImagePlus />,
      run: async () => {
        const selected = await open({ multiple: true });
        if (!selected) return;
        await project.addReferences(Array.isArray(selected) ? selected : [selected]);
      },
      disabled: view === "home",
      disabledReason: "Abrí o creá un proyecto primero",
    },
    {
      id: "analyze",
      group: "Referencias",
      label: "Analizar todas las imágenes",
      icon: <Sparkles />,
      run: async () => {
        try {
          await project.analyzeAll();
          toast.success("Referencias analizadas");
        } catch (e) {
          toast.error("El análisis falló", { description: errorMessage(e) });
        }
      },
      disabled: view === "home",
      disabledReason: "No hay referencias de un proyecto activo",
    },
    {
      id: "generate",
      group: "Generación",
      label: "Generar prompt",
      shortcut: "Ctrl ⏎",
      icon: <Play />,
      run: async () => {
        try {
          await project.generate();
        } catch (e) {
          toast.error("No se pudo generar", { description: errorMessage(e) });
        }
      },
      disabled: view === "home",
      disabledReason: "Abrí o creá un proyecto primero",
    },
    {
      id: "generate-windows",
      group: "Generación",
      label: "Generar ventanas de Maestro",
      icon: <LayoutGrid />,
      run: async () => {
        if (!project.project.multiWindow.enabled) {
          toast.error("Activá multi-window en el brief primero");
          return;
        }
        useUi.getState().set("outputTab", "windows");
        try {
          await project.generateWindows();
        } catch (e) {
          toast.error("No se pudo generar", { description: errorMessage(e) });
        }
      },
      disabled: view === "home" || !project.project.multiWindow.enabled,
      disabledReason: view === "home" ? "Abrí o creá un proyecto primero" : "Activá multi-window en Brief",
    },
    {
      id: "copy",
      group: "Generación",
      label: "Copiar prompt",
      shortcut: "Ctrl ⇧ C",
      icon: <Copy />,
      run: async () => {
        const text = project.generation.prompt;
        if (!text) {
          toast.error("Todavía no hay prompt");
          return;
        }
        await navigator.clipboard.writeText(text);
        toast.success("Prompt copiado");
      },
      disabled: view === "home" || !project.generation.prompt,
      disabledReason: view === "home" ? "No hay un proyecto activo" : "Generá un prompt primero",
    },
    {
      id: "console",
      group: "Vista",
      label: "Alternar consola del modelo",
      icon: <Terminal />,
      run: () => setUi("consoleOpen", !useUi.getState().consoleOpen),
    },
    {
      id: "settings",
      group: "Vista",
      label: "Ajustes",
      shortcut: "Ctrl ,",
      icon: <Settings2 />,
      run: () => setUi("settingsOpen", true),
    },
  ];

  const groups = [...new Set(actions.map((a) => a.group))];

  return (
    <Dialog open={openPalette} onOpenChange={(value) => setUi("paletteOpen", value)}>
      <DialogContent title="Comandos" description="Buscá una acción o navegá con las flechas." className="w-[min(560px,92vw)] overflow-hidden p-0">
      <Command label="Paleta de comandos" loop className="bg-panel">
      <Command.Input
        autoFocus
        placeholder="Buscar acción…"
        className="h-11 w-full border-b border-line bg-transparent px-4 text-sm text-ink outline-none placeholder:text-ink-faint"
      />
      <Command.List className="max-h-[340px] overflow-y-auto p-1.5">
        <Command.Empty className="px-3 py-6 text-center text-[11px] text-ink-faint">
          Sin resultados
        </Command.Empty>
        {groups.map((group) => (
          <Command.Group
            key={group}
            heading={group}
            className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-ink-faint"
          >
            {actions
              .filter((a) => a.group === group)
              .map((action) => (
                <Command.Item
                  key={action.id}
                  value={`${action.label} ${action.group}`}
                  disabled={action.disabled}
                  onSelect={() => {
                    setUi("paletteOpen", false);
                    void action.run();
                  }}
                  className="flex cursor-default items-center gap-2.5 rounded-md px-2 py-2 text-xs text-ink-muted data-[disabled=true]:opacity-35 data-[selected=true]:bg-raised data-[selected=true]:text-ink [&_svg]:size-3.5 [&_svg]:text-ink-faint"
                >
                  {action.icon}
                  <span className="flex-1">{action.label}</span>
                  {action.disabled && action.disabledReason ? (
                    <span className="max-w-44 truncate text-[9.5px] text-ink-faint">{action.disabledReason}</span>
                  ) : null}
                  {action.shortcut ? (
                    <kbd className="rounded border border-line-strong bg-base px-1 font-mono text-[10px] text-ink-faint">
                      {action.shortcut}
                    </kbd>
                  ) : null}
                </Command.Item>
              ))}
          </Command.Group>
        ))}
      </Command.List>
      </Command>
      </DialogContent>
    </Dialog>
  );
}
