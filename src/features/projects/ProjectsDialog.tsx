import { FolderOpen, Loader2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/controls";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { errorMessage, ipc, type ProjectSummary } from "@/lib/ipc";
import { formatRelative } from "@/lib/utils";
import { useProject } from "@/stores/projectStore";
import { useUi } from "@/stores/uiStore";

export function ProjectsDialog() {
  const open = useUi((s) => s.projectsOpen);
  const setUi = useUi((s) => s.set);
  const openProject = useProject((s) => s.open);
  const currentId = useProject((s) => s.project.id);

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    ipc
      .listProjects()
      .then(setProjects)
      .catch((e) => toast.error("No se pudieron listar los proyectos", { description: errorMessage(e) }))
      .finally(() => setLoading(false));
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(value) => setUi("projectsOpen", value)}>
      <DialogContent title="Proyectos" description="Se guardan localmente en SQLite." className="w-[min(560px,92vw)]">
        <ScrollArea className="max-h-[50vh] min-h-[140px]">
          {loading ? (
            <div className="flex h-[140px] items-center justify-center">
              <Loader2 className="size-4 animate-spin text-ink-faint" />
            </div>
          ) : projects.length === 0 ? (
            <div className="flex h-[140px] flex-col items-center justify-center gap-2 text-center">
              <FolderOpen className="size-5 text-ink-faint" />
              <p className="text-[11px] text-ink-faint">Todavía no guardaste ningún proyecto.</p>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {projects.map((project) => (
                <li key={project.id} className="flex items-center gap-2 px-4 py-2.5">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={async () => {
                      await openProject(project.id);
                      setUi("projectsOpen", false);
                      toast.success(`«${project.name}» abierto`);
                    }}
                  >
                    <p className="truncate text-xs text-ink">
                      {project.name}
                      {project.id === currentId ? (
                        <span className="ml-1.5 text-[10px] text-amber">actual</span>
                      ) : null}
                    </p>
                    <p className="text-[10px] text-ink-faint">{formatRelative(project.updatedAt)}</p>
                  </button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Eliminar ${project.name}`}
                    onClick={async () => {
                      await ipc.deleteProject(project.id);
                      setProjects((list) => list.filter((p) => p.id !== project.id));
                    }}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" size="md" onClick={() => setUi("projectsOpen", false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
