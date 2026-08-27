import { useEffect } from "react";
import { Group, Panel, Separator as PanelSeparator, useDefaultLayout } from "react-resizable-panels";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/overlays";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/controls";
import { BriefPanel } from "@/features/brief/BriefPanel";
import { OutputPanel } from "@/features/prompt/OutputPanel";
import { ProjectsDialog } from "@/features/projects/ProjectsDialog";
import { ReferenceLightbox } from "@/features/references/ReferenceLightbox";
import { ReferenceRail } from "@/features/references/ReferenceRail";
import { SettingsDialog } from "@/features/settings/SettingsDialog";
import { SubjectsPanel } from "@/features/subjects/SubjectsPanel";
import { TimelinePanel } from "@/features/timeline/TimelinePanel";
import { ipc } from "@/lib/ipc";
import { useProject } from "@/stores/projectStore";
import { useSettings } from "@/stores/settingsStore";
import { useUi } from "@/stores/uiStore";
import { CommandPalette } from "./CommandPalette";
import { StatusBar } from "./StatusBar";
import { TitleBar } from "./TitleBar";
import { useShortcuts } from "./useShortcuts";

export function App() {
  const loadSettings = useSettings((s) => s.load);
  const lightboxId = useUi((s) => s.lightboxReferenceId);
  const briefTab = useUi((s) => s.briefTab);
  const setUi = useUi((s) => s.set);

  useShortcuts();

  // Panel sizes persist per user, like any desktop tool.
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "director-layout",
    panelIds: ["rail", "editor", "output"],
    storage: localStorage,
  });

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  // Reopen whatever the user was last working on, like any desktop editor.
  useEffect(() => {
    void ipc
      .listProjects()
      .then((projects) => {
        const latest = projects[0];
        const { dirty, open } = useProject.getState();
        if (latest && !dirty) void open(latest.id);
      })
      .catch(() => undefined);
  }, []);

  // Autosave: a desktop tool should not lose work because nobody pressed Ctrl+S.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const { dirty, save, project } = useProject.getState();
      if (dirty && (project.brief.idea.trim() || project.references.length > 0)) {
        void save().catch(() => undefined);
      }
    }, 4000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <TooltipProvider delayDuration={400} skipDelayDuration={200}>
      <div className="stage-glow flex h-full flex-col overflow-hidden">
        <TitleBar />

        <Group
          orientation="horizontal"
          className="min-h-0 flex-1"
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChanged}
        >
          <Panel id="rail" defaultSize="21%" minSize="200px" maxSize="34%" className="border-r border-line">
            <ReferenceRail />
          </Panel>
          <Handle />

          <Panel id="editor" defaultSize="40%" minSize="320px" className="border-r border-line">
            <Tabs
              value={briefTab}
              onValueChange={(value) => setUi("briefTab", value as typeof briefTab)}
              className="flex h-full flex-col bg-panel"
            >
              <TabsList className="h-8 shrink-0">
                <TabsTrigger value="brief">Brief</TabsTrigger>
                <TabsTrigger value="subjects">Subjects</TabsTrigger>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
              </TabsList>
              <TabsContent value="brief" className="min-h-0 flex-1">
                <BriefPanel />
              </TabsContent>
              <TabsContent value="subjects" className="min-h-0 flex-1">
                <SubjectsPanel />
              </TabsContent>
              <TabsContent value="timeline" className="min-h-0 flex-1">
                <TimelinePanel />
              </TabsContent>
            </Tabs>
          </Panel>
          <Handle />

          <Panel id="output" defaultSize="39%" minSize="300px">
            <OutputPanel />
          </Panel>
        </Group>

        <StatusBar />
      </div>

      <SettingsDialog />
      <ProjectsDialog />
      <CommandPalette />
      {lightboxId ? <ReferenceLightbox /> : null}

      <Toaster
        theme="dark"
        position="bottom-right"
        offset={40}
        toastOptions={{
          classNames: {
            toast:
              "!bg-elevated !border-line-strong !text-ink !text-[12px] !rounded-lg !shadow-2xl",
            description: "!text-ink-muted !text-[11px]",
            actionButton: "!bg-amber !text-[#17120a] !text-[11px]",
          },
        }}
      />
    </TooltipProvider>
  );
}

function Handle() {
  return (
    <PanelSeparator className="group relative w-px bg-line transition-colors data-[state=dragging]:bg-amber">
      <div className="absolute inset-y-0 -left-1 -right-1 group-hover:bg-amber/25" />
    </PanelSeparator>
  );
}
