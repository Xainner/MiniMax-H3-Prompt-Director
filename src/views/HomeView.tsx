import { motion } from "motion/react";
import { FolderOpen, Upload } from "lucide-react";
import { Button } from "@/components/ui-v2/button";
import { Deploy } from "@/components/ui-v2/deploy";
import { useApp } from "@/stores/appStore";
import { useUi } from "@/stores/uiStore";
import { MODE_TILES } from "@/views/modeTiles";

export function HomeView() {
  const startWizard = useApp((s) => s.startWizard);
  const openProjects = useUi((s) => s.openProjects);

  return (
    <div className="flex h-full flex-col items-center overflow-y-auto px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="w-full max-w-6xl"
      >
        <header className="flex flex-col items-center pb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">¿Qué vamos a crear?</h1>
          <p className="text-muted-foreground mt-1.5 max-w-md text-xs leading-relaxed">
            El modo define qué referencias entiende el modelo y cómo se estructura el prompt.
            Se fija para todo el proyecto.
          </p>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" size="sm" onClick={() => openProjects("list")}><FolderOpen />Abrir proyecto</Button>
            <Button variant="outline" size="sm" onClick={() => openProjects("import")}><Upload />Importar .directorproj</Button>
          </div>
        </header>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-4">
          {MODE_TILES.map((tile, index) => (
            <Deploy key={tile.mode} index={index}>
              <motion.button
                onClick={() => startWizard(tile.mode)}
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.96 }}
                transition={{ type: "spring", stiffness: 340, damping: 26 }}
                className="group relative block aspect-[16/6.5] w-full overflow-hidden rounded-xl bg-black"
              >
                <img
                  src={tile.image}
                  alt=""
                  draggable={false}
                  className="absolute inset-0 size-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <span className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${tile.gradient}`} />
                <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_35%,oklch(1_0_0/14%)_50%,transparent_65%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <tile.icon className="absolute top-3 left-3 size-5 text-white/85 drop-shadow" />
                <span className="absolute top-3 right-3 rounded-md border border-white/25 bg-black/30 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white/90 backdrop-blur-sm">
                  {tile.code}
                </span>
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-3 pt-8 pb-2.5 text-left">
                  <span className="block text-base font-semibold text-white">{tile.label}</span>
                  <span className="mt-0.5 block text-xs leading-snug text-white/70">{tile.hint}</span>
                </span>
              </motion.button>
            </Deploy>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
