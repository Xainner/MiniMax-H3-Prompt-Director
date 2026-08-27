import { getCurrentWindow } from "@tauri-apps/api/window";
import { Command, Minus, Settings2, Square, X } from "lucide-react";
import type * as React from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/overlays";
import { useProject } from "@/stores/projectStore";
import { useUi } from "@/stores/uiStore";
import { MODE_LABELS } from "@/core/h3/roles";
import { cn } from "@/lib/utils";

export function TitleBar() {
  const name = useProject((s) => s.project.name);
  const dirty = useProject((s) => s.dirty);
  const rename = useProject((s) => s.rename);
  const mode = useProject((s) => s.mode());
  const setUi = useUi((s) => s.set);

  const [editing, setEditing] = useState(false);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const win = getCurrentWindow();
    void win.isMaximized().then(setMaximized);
    const unlisten = win.onResized(() => {
      void win.isMaximized().then(setMaximized);
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <header
      data-tauri-drag-region
      className="flex h-9 shrink-0 items-center gap-3 border-b border-line bg-panel pl-3 pr-0 select-none"
    >
      <div data-tauri-drag-region className="flex items-center gap-2">
        <Mark />
        <span data-tauri-drag-region className="text-[12px] font-semibold tracking-tight text-ink">
          Director
        </span>
      </div>

      <div data-tauri-drag-region className="h-4 w-px bg-line" />

      {editing ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => rename(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") setEditing(false);
          }}
          className="h-6 min-w-[160px] max-w-[320px] rounded border border-amber/50 bg-base px-1.5 text-xs text-ink outline-none"
        />
      ) : (
        <button
          type="button"
          onDoubleClick={() => setEditing(true)}
          onClick={() => setEditing(true)}
          className="max-w-[320px] truncate rounded px-1.5 py-0.5 text-xs text-ink-muted transition-colors hover:bg-elevated hover:text-ink"
          title="Renombrar proyecto"
        >
          {name}
          {dirty ? <span className="ml-1.5 text-amber">•</span> : null}
        </button>
      )}

      <div data-tauri-drag-region className="flex-1" />

      <span className="hidden items-center gap-1.5 rounded border border-line-strong bg-base px-2 py-0.5 text-[10px] text-ink-muted md:inline-flex">
        <span className="size-1.5 rounded-full bg-amber" />
        {MODE_LABELS[mode]}
      </span>

      <Tooltip content="Paleta de comandos" shortcut="Ctrl K">
        <Button variant="ghost" size="icon-sm" onClick={() => setUi("paletteOpen", true)}>
          <Command />
        </Button>
      </Tooltip>

      <Tooltip content="Ajustes" shortcut="Ctrl ,">
        <Button variant="ghost" size="icon-sm" onClick={() => setUi("settingsOpen", true)}>
          <Settings2 />
        </Button>
      </Tooltip>

      <div className="ml-1 flex h-9 items-stretch">
        <WindowButton label="Minimizar" onClick={() => void getCurrentWindow().minimize()}>
          <Minus className="size-3.5" />
        </WindowButton>
        <WindowButton
          label={maximized ? "Restaurar" : "Maximizar"}
          onClick={() => void getCurrentWindow().toggleMaximize()}
        >
          <Square className={cn("size-3", maximized && "size-2.5")} />
        </WindowButton>
        <WindowButton label="Cerrar" danger onClick={() => void getCurrentWindow().close()}>
          <X className="size-3.5" />
        </WindowButton>
      </div>
    </header>
  );
}

function WindowButton({
  children,
  onClick,
  label,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "grid w-11 place-items-center text-ink-faint transition-colors",
        danger ? "hover:bg-danger hover:text-white" : "hover:bg-elevated hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

/** The aperture mark from the app icon, drawn inline so it scales crisply. */
function Mark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="var(--color-amber)" strokeWidth="2.4" />
      <path
        d="M5.2 8.6A8.5 8.5 0 0 1 12 3.5"
        fill="none"
        stroke="var(--color-cyan)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path d="M10 8.6l5.2 3.4L10 15.4z" fill="var(--color-amber)" />
    </svg>
  );
}
