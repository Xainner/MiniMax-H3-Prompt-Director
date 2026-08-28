import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/overlays";
import { useProjectTransition } from "@/stores/projectTransitionStore";
import { toast } from "sonner";
import { errorMessage } from "@/lib/ipc";

export function ProjectTransitionDialog() {
  const open = useProjectTransition((state) => state.open);
  const running = useProjectTransition((state) => state.running);
  const saveAndContinue = useProjectTransition((state) => state.saveAndContinue);
  const discardAndContinue = useProjectTransition((state) => state.discardAndContinue);
  const cancel = useProjectTransition((state) => state.cancel);
  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value && !running) cancel(); }}>
      <DialogContent title="Cambios sin guardar" description="¿Qué querés hacer antes de salir del proyecto actual?" className="w-[min(460px,92vw)]">
        <p className="p-4 text-[11px] leading-relaxed text-ink-muted">Guardar conserva el proyecto y sus referencias administradas. Descartar vuelve al último estado guardado y no permite que el autosave recupere estos cambios.</p>
        <DialogFooter>
          <Button variant="outline" size="md" disabled={running} onClick={cancel}>Cancelar</Button>
          <Button variant="danger" size="md" disabled={running} onClick={() => void discardAndContinue().catch((error) => toast.error("No se pudo cerrar el proyecto", { description: errorMessage(error) }))}>Descartar cambios</Button>
          <Button variant="primary" size="md" disabled={running} onClick={() => void saveAndContinue().catch((error) => toast.error("No se pudo guardar y continuar", { description: errorMessage(error) }))}>{running ? <Loader2 className="animate-spin" /> : null}Guardar y continuar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
