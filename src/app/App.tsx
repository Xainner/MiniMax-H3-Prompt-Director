import { useEffect } from "react";
import { Toaster } from "@/components/ui-v2/sonner";
import { TooltipProvider } from "@/components/ui/overlays";
import { ProjectsDialog } from "@/features/projects/ProjectsDialog";
import { ProjectTransitionDialog } from "@/features/projects/ProjectTransitionDialog";
import { ReferenceLightbox } from "@/features/references/ReferenceLightbox";
import { SettingsDialog } from "@/features/settings/SettingsDialog";
import { AppShell } from "@/layout/AppShell";
import { useProject } from "@/stores/projectStore";
import { useSettings } from "@/stores/settingsStore";
import { useMaestro } from "@/stores/maestroStore";
import { useUi } from "@/stores/uiStore";
import { CommandPalette } from "./CommandPalette";
import { StatusBar } from "./StatusBar";
import { TitleBar } from "./TitleBar";
import { useShortcuts } from "./useShortcuts";

export function App() {
  const loadSettings = useSettings((s) => s.load);
  const resumeMaestroJobs = useMaestro((s) => s.resumeJobs);
  const lightboxId = useUi((s) => s.lightboxReferenceId);

  useShortcuts();

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    void resumeMaestroJobs();
  }, [resumeMaestroJobs]);

  // The app always opens on the launcher; a project starts by picking a mode.
  // Autosave: a desktop tool should not lose work because nobody pressed Ctrl+S.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const { dirty, save } = useProject.getState();
      if (dirty) {
        void save(false).catch(() => undefined);
      }
    }, 4000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <TooltipProvider delayDuration={400} skipDelayDuration={200}>
      <div className="stage-glow flex h-full flex-col overflow-hidden">
        <TitleBar />
        <AppShell />
        <StatusBar />
      </div>

      <SettingsDialog />
      <ProjectsDialog />
      <ProjectTransitionDialog />
      <CommandPalette />
      {lightboxId ? <ReferenceLightbox /> : null}

      <Toaster position="bottom-right" offset={40} />
    </TooltipProvider>
  );
}
