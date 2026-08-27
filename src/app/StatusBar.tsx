import { AlertTriangle, Check, CircleDashed, Eye, PenLine } from "lucide-react";
import type { ReactNode } from "react";
import { numberReferences } from "@/core/h3/roles";
import { assignSpeakers } from "@/core/h3/render";
import { cn } from "@/lib/utils";
import { useProject } from "@/stores/projectStore";
import { isProfileUsable, useSettings } from "@/stores/settingsStore";
import { useUi } from "@/stores/uiStore";

export function StatusBar() {
  const project = useProject((s) => s.project);
  const generation = useProject((s) => s.generation);
  const settings = useSettings((s) => s.settings);
  const openSettings = useUi((s) => s.openSettings);

  const numbering = numberReferences(project.references);
  const counts = Object.values(numbering.tag).reduce(
    (acc, tag) => {
      if (tag.startsWith("<Picture")) acc.pictures += 1;
      else if (tag.startsWith("<Video")) acc.videos += 1;
      else if (tag.startsWith("<Audio")) acc.audios += 1;
      return acc;
    },
    { pictures: 0, videos: 0, audios: 0 },
  );

  const speakers = assignSpeakers(project);
  const errors = generation.findings.filter((f) => f.severity === "error").length;

  return (
    <footer className="flex h-6 shrink-0 items-center gap-3 border-t border-line bg-panel px-3 text-[10.5px] text-ink-faint">
      <Counter label="Pictures" value={counts.pictures} />
      <Counter label="Videos" value={counts.videos} />
      <Counter label="Audios" value={counts.audios} />
      <Counter label="Subjects" value={project.subjects.length} />
      <Counter label="Shots" value={project.shots.length} />
      <Counter label="Speakers" value={speakers.size} />

      <div className="flex-1" />

      {generation.prompt ? (
        <span
          className={cn(
            "flex items-center gap-1",
            errors > 0 ? "text-danger" : "text-ok",
          )}
        >
          {errors > 0 ? <AlertTriangle className="size-3" /> : <Check className="size-3" />}
          {errors > 0 ? `${errors} errores` : "prompt válido"}
        </span>
      ) : null}

      <ModelChip
        icon={<Eye className="size-3" />}
        label={settings?.vision.model || "sin modelo de visión"}
        ok={isProfileUsable(settings?.vision)}
        onClick={() => openSettings("vision")}
      />
      <ModelChip
        icon={<PenLine className="size-3" />}
        label={settings?.writer.model || "sin modelo de escritura"}
        ok={isProfileUsable(settings?.writer)}
        onClick={() => openSettings("writer")}
      />
    </footer>
  );
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <span className={cn("flex items-center gap-1", value === 0 && "opacity-45")}>
      <span className="tnum font-mono text-ink-muted">{value}</span>
      {label}
    </span>
  );
}

function ModelChip({
  icon,
  label,
  ok,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  ok: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={ok ? "Cambiar modelo" : "Configurar este modelo"}
      className={cn(
        "flex max-w-[190px] items-center gap-1 rounded px-1.5 py-0.5 transition-colors hover:bg-elevated",
        ok ? "text-ink-muted" : "text-warn",
      )}
    >
      {ok ? icon : <CircleDashed className="size-3" />}
      <span className="truncate">{label}</span>
    </button>
  );
}
