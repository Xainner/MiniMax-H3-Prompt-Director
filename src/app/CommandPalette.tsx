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
} from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { open } from "@tauri-apps/plugin-dialog";
import { errorMessage } from "@/lib/ipc";
import { useProject } from "@/stores/projectStore";
import { useUi } from "@/stores/uiStore";

interface Action {
  id: string;
  label: string;
  hint?: string;
  shortcut?: string;
  icon: ReactNode;
  run: () => void | Promise<void>;
  group: string;
}

export function CommandPalette() {
  const openPalette = useUi((s) => s.paletteOpen);
  const setUi = useUi((s) => s.set);
  const project = useProject();

  const actions: Action[] = [
    {
      id: "new",
      group: "Proyecto",
      label: "Nuevo proyecto",
      icon: <FilePlus2 />,
      run: () => project.reset(),
    },
    {
      id: "open",
      group: "Proyecto",
      label: "Abrir proyecto…",
      icon: <FolderOpen />,
      run: () => setUi("projectsOpen", true),
    },
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
    <Command.Dialog
      open={openPalette}
      onOpenChange={(value) => setUi("paletteOpen", value)}
      label="Paleta de comandos"
      className="fixed inset-0 z-50"
      overlayClassName="fade-in fixed inset-0 bg-black/70 backdrop-blur-[2px]"
      contentClassName="pop-in fixed left-1/2 top-[18%] w-[min(560px,92vw)] -translate-x-1/2 overflow-hidden rounded-xl border border-line-strong bg-panel shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]"
    >
      <Command.Input
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
                  onSelect={() => {
                    setUi("paletteOpen", false);
                    void action.run();
                  }}
                  className="flex cursor-default items-center gap-2.5 rounded-md px-2 py-2 text-xs text-ink-muted data-[selected=true]:bg-raised data-[selected=true]:text-ink [&_svg]:size-3.5 [&_svg]:text-ink-faint"
                >
                  {action.icon}
                  <span className="flex-1">{action.label}</span>
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
    </Command.Dialog>
  );
}
