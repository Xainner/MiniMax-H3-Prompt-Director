import { Group, Panel, Separator as PanelSeparator, useDefaultLayout } from "react-resizable-panels";
import { Lock } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/controls";
import { BriefPanel } from "@/features/brief/BriefPanel";
import { OutputPanel } from "@/features/prompt/OutputPanel";
import { ReferenceRail } from "@/features/references/ReferenceRail";
import { SubjectsPanel } from "@/features/subjects/SubjectsPanel";
import { TimelinePanel } from "@/features/timeline/TimelinePanel";
import { detectMode } from "@/core/h3/roles";
import { useProject } from "@/stores/projectStore";
import { useUi } from "@/stores/uiStore";
import { MODE_TILES } from "@/views/modeTiles";

/**
 * The production surface: header | rail | editor tabs | output. Panel sizes
 * persist per user, like any desktop tool.
 */
export function WorkspaceView() {
  const briefTab = useUi((s) => s.briefTab);
  const setUi = useUi((s) => s.set);
  const name = useProject((s) => s.project.name);
  const dirty = useProject((s) => s.dirty);
  const forcedMode = useProject((s) => s.project.brief.forcedMode);
  const detectedMode = detectMode(useProject((s) => s.project.references));
  const mode = forcedMode ?? detectedMode;
  const tile = MODE_TILES.find((t) => t.mode === mode);
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "director-layout",
    panelIds: ["rail", "editor", "output"],
    storage: localStorage,
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-line flex h-9 shrink-0 items-center gap-2.5 border-b px-4">
        {tile && (
          <>
            <img src={tile.image} alt="" draggable={false} className="h-4 w-7 rounded-sm object-cover" />
            <span className="text-primary font-mono text-[10px] font-semibold">{tile.code}</span>
            <span className="bg-border h-3.5 w-px" />
          </>
        )}
        <p className="min-w-0 truncate text-xs font-medium">{name}</p>
        {forcedMode && (
          <span title="Modo fijado">
            <Lock className="text-amber size-2.5 shrink-0" />
          </span>
        )}
        <span className={`ml-auto flex items-center gap-1.5 text-[10px] ${dirty ? "text-amber" : "text-emerald-400"}`}>
          <span className={`size-1.5 rounded-full ${dirty ? "animate-pulse bg-amber" : "bg-emerald-400"}`} />
          {dirty ? "Cambios sin guardar" : "Guardado"}
        </span>
      </header>

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
    </div>
  );
}

function Handle() {
  return (
    <PanelSeparator className="group relative w-px bg-line transition-colors data-[state=dragging]:bg-amber">
      <div className="absolute inset-y-0 -left-1 -right-1 group-hover:bg-amber/25" />
    </PanelSeparator>
  );
}
