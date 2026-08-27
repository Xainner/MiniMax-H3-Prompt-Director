import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { ImagePlus, Sparkles, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/controls";
import { numberReferences } from "@/core/h3/roles";
import { errorMessage } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import { useProject } from "@/stores/projectStore";
import { useSettings, isProfileUsable } from "@/stores/settingsStore";
import { useUi } from "@/stores/uiStore";
import { ReferenceCard } from "./ReferenceCard";

const MEDIA_FILTERS = [
  {
    name: "Referencias",
    extensions: [
      "jpg", "jpeg", "png", "webp", "gif", "bmp", "tif", "tiff", "avif",
      "mp4", "mov", "mkv", "webm", "avi", "m4v",
      "mp3", "wav", "flac", "m4a", "aac", "ogg", "opus",
    ],
  },
];

export function ReferenceRail() {
  const references = useProject((s) => s.project.references);
  const addReferences = useProject((s) => s.addReferences);
  const reorder = useProject((s) => s.reorderReferences);
  const analyzeAll = useProject((s) => s.analyzeAll);
  const visionProfile = useSettings((s) => s.settings?.vision);
  const openSettings = useUi((s) => s.openSettings);

  const [dropActive, setDropActive] = useState(false);
  const [analyzingAll, setAnalyzingAll] = useState(false);

  const numbering = numberReferences(references);
  const pendingAnalysis = references.filter((r) => r.kind === "image" && !r.analysis).length;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Native OS drag-and-drop straight onto the window.
  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "over") {
        setDropActive(true);
      } else if (event.payload.type === "drop") {
        setDropActive(false);
        void handleAdd(event.payload.paths);
      } else {
        setDropActive(false);
      }
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAdd(paths: string[]) {
    if (paths.length === 0) return;
    try {
      await addReferences(paths);
    } catch (e) {
      toast.error("No se pudo agregar la referencia", { description: errorMessage(e) });
    }
  }

  async function pickFiles() {
    const selected = await open({ multiple: true, filters: MEDIA_FILTERS });
    if (!selected) return;
    await handleAdd(Array.isArray(selected) ? selected : [selected]);
  }

  async function runAnalyzeAll() {
    if (!isProfileUsable(visionProfile)) {
      toast.error("Falta configurar el LLM de visión", {
        description: "Definí base URL y modelo en la pestaña «Visión» de Ajustes.",
        action: { label: "Abrir Ajustes", onClick: () => openSettings("vision") },
      });
      return;
    }
    setAnalyzingAll(true);
    try {
      await analyzeAll();
      toast.success("Referencias analizadas");
    } catch (e) {
      toast.error("El análisis falló", { description: errorMessage(e) });
    } finally {
      setAnalyzingAll(false);
    }
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = references.map((r) => r.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const next = [...ids];
    next.splice(to, 0, next.splice(from, 1)[0]!);
    reorder(next);
  }

  return (
    <section
      className={cn(
        "flex h-full flex-col bg-panel transition-colors",
        dropActive && "bg-amber/6 ring-1 ring-inset ring-amber/50",
      )}
    >
      <header className="flex h-8 shrink-0 items-center justify-between border-b border-line px-2.5">
        <div className="flex items-center gap-2">
          <span className="rail-label">Referencias</span>
          <span className="tnum rounded bg-raised px-1 text-[10px] text-ink-faint">
            {references.length}
          </span>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={() => void pickFiles()} title="Agregar (Ctrl+O)">
          <ImagePlus />
        </Button>
      </header>

      {references.length === 0 ? (
        <EmptyRail onPick={() => void pickFiles()} active={dropActive} />
      ) : (
        <ScrollArea className="flex-1">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={onDragEnd}
          >
            <SortableContext items={references.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              <ul className="flex flex-col gap-1.5 p-2">
                {references.map((ref) => (
                  <ReferenceCard key={ref.id} reference={ref} tag={numbering.tag[ref.id] ?? "<?>"} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </ScrollArea>
      )}

      {pendingAnalysis > 0 ? (
        <footer className="shrink-0 border-t border-line p-2">
          <Button
            variant="primary"
            size="md"
            className="w-full"
            disabled={analyzingAll}
            onClick={() => void runAnalyzeAll()}
          >
            {analyzingAll ? <Loader2 className="animate-spin" /> : <Sparkles />}
            Analizar {pendingAnalysis} {pendingAnalysis === 1 ? "imagen" : "imágenes"}
          </Button>
        </footer>
      ) : null}
    </section>
  );
}

function EmptyRail({ onPick, active }: { onPick: () => void; active: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <div
        className={cn(
          "grid size-16 place-items-center rounded-xl border border-dashed border-line-strong transition-colors",
          active && "border-amber bg-amber/10",
        )}
      >
        <ImagePlus className={cn("size-6 text-ink-faint", active && "text-amber")} />
      </div>
      <div className="space-y-1">
        <p className="text-xs font-medium text-ink-muted">Arrastrá tus referencias acá</p>
        <p className="text-[11px] leading-snug text-ink-faint">
          Las imágenes las lee el LLM de visión. Video y audio se describen a mano.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onPick}>
        Elegir archivos
      </Button>
    </div>
  );
}
