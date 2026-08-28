import { open } from "@tauri-apps/plugin-dialog";
import { useEffect } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/ipc";
import { useProject } from "@/stores/projectStore";
import { useUi } from "@/stores/uiStore";
import { useApp } from "@/stores/appStore";

/** Shortcuts must never fire while the user is typing (§28). */
function inTextField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
}

async function handle(event: KeyboardEvent): Promise<void> {
  const ui = useUi.getState();
  const project = useProject.getState();
  const ctrl = event.ctrlKey || event.metaKey;

  if (event.key === "Escape") {
    ui.closeOverlays();
    return;
  }

  if (ctrl && event.key.toLowerCase() === "k") {
    event.preventDefault();
    ui.set("paletteOpen", !ui.paletteOpen);
    return;
  }

  if (ctrl && event.key === ",") {
    event.preventDefault();
    ui.set("settingsOpen", true);
    return;
  }

  // Home has no active project. Keep global navigation shortcuts above this
  // guard, but do not save/generate the launcher's in-memory placeholder.
  if (useApp.getState().view === "home") return;

  if (ctrl && event.key.toLowerCase() === "s") {
    event.preventDefault();
    await project.save();
    toast.success("Proyecto guardado");
    return;
  }

  if (ctrl && event.key.toLowerCase() === "o") {
    event.preventDefault();
    const selected = await open({ multiple: true });
    if (selected) {
      await project.addReferences(Array.isArray(selected) ? selected : [selected]);
    }
    return;
  }

  if (ctrl && event.shiftKey && event.key.toLowerCase() === "c") {
    event.preventDefault();
    if (!project.generation.prompt) {
      toast.error("Todavía no hay prompt");
      return;
    }
    await navigator.clipboard.writeText(project.generation.prompt);
    toast.success("Prompt copiado");
    return;
  }

  const wantsGenerate =
    (ctrl && event.key === "Enter") ||
    (!ctrl && !event.altKey && event.key.toLowerCase() === "g" && !inTextField(event.target));

  if (wantsGenerate) {
    event.preventDefault();
    if (project.generation.status === "writing") return;
    try {
      await project.generate();
    } catch (e) {
      toast.error("No se pudo generar", { description: errorMessage(e) });
    }
  }
}

export function useShortcuts(): void {
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      void handle(event);
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
}
