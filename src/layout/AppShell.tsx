import { Group, Panel, Separator } from "react-resizable-panels";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Clapperboard, PanelLeftClose, PanelLeftOpen, Command as CommandIcon, Settings2, FolderOpen, FilePlus2, Save, House } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/stores/appStore";
import { useUi } from "@/stores/uiStore";
import { useProject } from "@/stores/projectStore";
import { useProjectTransition } from "@/stores/projectTransitionStore";
import { HomeView } from "@/views/HomeView";
import { WizardModal } from "@/views/WizardModal";
import { WorkspaceView } from "@/views/WorkspaceView";
import logoImg from "@/assets/brand/logo.png";

/**
 * The launcher runs full-screen, without any chrome: picking a mode is the
 * whole screen. The wizard collects the brief before the project exists; the
 * mode travels inside the project once created.
 */
export function AppShell() {
  const view = useApp((s) => s.view);
  const pendingMode = useApp((s) => s.pendingMode);
  const openSettings = useUi((s) => s.openSettings);
  const openProjects = useUi((s) => s.openProjects);
  const setUi = useUi((s) => s.set);
  const dirty = useProject((s) => s.dirty);
  const requestTransition = useProjectTransition((s) => s.request);
  const [collapsed, setCollapsed] = useState(false);

  const returnHome = () => requestTransition(() => {
    useProject.getState().reset();
    useApp.getState().setView("home");
  });
  const saveProject = async () => {
    await useProject.getState().save();
    toast.success("Proyecto guardado");
  };

  if (view !== "workspace") {
    return (
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key="home"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="h-full"
          >
            <HomeView />
          </motion.div>
        </AnimatePresence>
        <AnimatePresence>{pendingMode && <WizardModal key="wizard" />}</AnimatePresence>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <Group orientation="horizontal" className="min-h-0 flex-1">
        {!collapsed && (
          <>
            <Panel defaultSize="13" minSize="10" maxSize="22">
              <aside className="bg-sidebar flex h-full flex-col px-3 py-4">
                <div className="relative flex items-center justify-center pb-5">
                  <img
                    src={logoImg}
                    alt="Director"
                    draggable={false}
                    className="w-[85%] max-w-48 object-contain drop-shadow-[0_0_30px_oklch(0.72_0.14_70/0.3)]"
                  />
                  <button
                    onClick={() => setCollapsed(true)}
                    title="Colapsar sidebar"
                    aria-label="Colapsar sidebar"
                    className="text-muted-foreground hover:text-foreground absolute top-0 right-0 transition-colors"
                  >
                    <PanelLeftClose className="size-4" />
                  </button>
                </div>

                <nav className="space-y-1">
                  <button className="border-primary/35 from-primary/25 relative flex w-full items-center gap-2.5 rounded-lg border bg-gradient-to-r via-transparent to-transparent px-2.5 py-2 text-left text-sm text-foreground">
                    <Clapperboard className="text-primary relative z-10 size-4 shrink-0" />
                    <span className="relative z-10 truncate font-medium">Taller</span>
                  </button>
                  <button onClick={() => openProjects("list")} className="text-muted-foreground hover:text-foreground relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors"><FolderOpen className="size-4 shrink-0" /><span className="truncate">Proyectos</span></button>
                  <button onClick={() => void returnHome()} className="text-muted-foreground hover:text-foreground relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors"><FilePlus2 className="size-4 shrink-0" /><span className="truncate">Nuevo proyecto</span></button>
                  <button onClick={() => void saveProject()} disabled={!dirty} className="text-muted-foreground hover:text-foreground disabled:opacity-40 relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors"><Save className="size-4 shrink-0" /><span className="truncate">Guardar</span></button>
                  <button
                    onClick={() => openSettings()}
                    className="text-muted-foreground hover:text-foreground relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors"
                  >
                    <Settings2 className="size-4 shrink-0" />
                    <span className="truncate">Ajustes</span>
                  </button>
                </nav>

                <div className="mt-auto space-y-2 px-1">
                  <button
                    onClick={() => void returnHome()}
                    className="border-primary/40 from-primary/25 shadow-primary/40 flex w-full items-center gap-2.5 rounded-xl border bg-gradient-to-r to-transparent px-3 py-2.5 text-left text-sm font-medium shadow-[0_0_20px_-8px] transition-all hover:border-primary/60 hover:shadow-[0_0_28px_-6px]"
                  >
                    <House className="text-primary size-4 shrink-0" />
                    <span className="truncate">Volver al inicio</span>
                  </button>
                  <button
                    onClick={() => setUi("paletteOpen", true)}
                    className="border-border text-muted-foreground hover:border-primary/40 hover:text-foreground flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs transition-colors"
                  >
                    <span>Comandos</span>
                    <kbd className="bg-foreground/[0.06] border-border rounded-md border px-1.5 py-0.5 font-mono text-[10px]">
                      Ctrl K
                    </kbd>
                  </button>
                </div>
              </aside>
            </Panel>

            <Separator className="relative w-1 before:absolute before:top-0 before:left-1/2 before:h-full before:w-px before:-translate-x-1/2 before:bg-border before:transition-colors hover:before:bg-primary/60" />
          </>
        )}

        <Panel minSize={collapsed ? "0" : "55"}>
          <main className="relative flex h-full min-w-0 flex-col overflow-hidden">
            <div className={collapsed ? "h-full pl-14" : "h-full"}>
              <AnimatePresence mode="wait">
                <motion.div
                  key="workspace"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="h-full"
                >
                  <WorkspaceView />
                </motion.div>
              </AnimatePresence>
            </div>

            <AnimatePresence>
              {collapsed && (
                <motion.aside
                  initial={{ x: -56 }}
                  animate={{ x: 0 }}
                  exit={{ x: -56 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="bg-sidebar absolute top-0 left-0 flex h-full w-14 flex-col items-center border-r border-black/30 px-2 py-4"
                >
                  <button onClick={() => setCollapsed(false)} title="Expandir sidebar" className="shrink-0">
                    <img
                      src={logoImg}
                      alt="Director"
                      draggable={false}
                      className="size-10 object-contain drop-shadow-[0_0_14px_oklch(0.72_0.14_70/0.3)]"
                    />
                  </button>
                  <button
                    onClick={() => setCollapsed(false)}
                    title="Expandir"
                    className="text-muted-foreground hover:text-foreground mt-2 rounded-lg p-1.5 transition-colors"
                  >
                    <PanelLeftOpen className="size-4" />
                  </button>

                  <nav className="mt-4 space-y-1.5">
                    <button
                      title="Taller"
                      className="bg-primary/15 border-primary/40 relative flex w-full items-center justify-center rounded-lg border p-2 text-primary"
                    >
                      <Clapperboard className="relative z-10 size-4" />
                    </button>
                    <button onClick={() => openProjects("list")} title="Proyectos" className="text-muted-foreground hover:text-foreground relative flex w-full items-center justify-center rounded-lg p-2 transition-colors"><FolderOpen className="size-4" /></button>
                    <button onClick={() => void returnHome()} title="Nuevo proyecto" className="text-muted-foreground hover:text-foreground relative flex w-full items-center justify-center rounded-lg p-2 transition-colors"><FilePlus2 className="size-4" /></button>
                    <button onClick={() => void saveProject()} disabled={!dirty} title="Guardar" className="text-muted-foreground hover:text-foreground disabled:opacity-35 relative flex w-full items-center justify-center rounded-lg p-2 transition-colors"><Save className="size-4" /></button>
                    <button onClick={() => void returnHome()} title="Volver al inicio" className="text-muted-foreground hover:text-foreground relative flex w-full items-center justify-center rounded-lg p-2 transition-colors"><House className="size-4" /></button>
                    <button
                      onClick={() => openSettings()}
                      title="Ajustes"
                      className="text-muted-foreground hover:text-foreground relative flex w-full items-center justify-center rounded-lg p-2 transition-colors"
                    >
                      <Settings2 className="size-4" />
                    </button>
                  </nav>

                  <div className="mt-auto flex flex-col items-center gap-2">
                    <button
                      onClick={() => setUi("paletteOpen", true)}
                      title="Comandos (Ctrl+K)"
                      className="text-muted-foreground hover:text-foreground rounded-lg border border-transparent p-2 transition-colors hover:border-white/10"
                    >
                      <CommandIcon className="size-4" />
                    </button>
                  </div>
                </motion.aside>
              )}
            </AnimatePresence>
          </main>
        </Panel>
      </Group>
    </div>
  );
}
