import {
  AlertTriangle,
  CheckCircle2,
  CopyPlus,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea, Slider, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/controls";
import { Field, Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/overlays";
import { errorMessage, type Profile } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import { isProfileUsable, useSettings } from "@/stores/settingsStore";
import { useUi, type SettingsTab } from "@/stores/uiStore";
import { ipc } from "@/lib/ipc";

const PRESETS = [
  { label: "OpenAI", url: "https://api.openai.com/v1", model: "gpt-5" },
  { label: "OpenRouter", url: "https://openrouter.ai/api/v1", model: "" },
  { label: "Groq", url: "https://api.groq.com/openai/v1", model: "" },
  { label: "LM Studio (local)", url: "http://localhost:1234/v1", model: "" },
  { label: "Ollama (local)", url: "http://localhost:11434/v1", model: "" },
  { label: "vLLM (local)", url: "http://localhost:8000/v1", model: "" },
];

export function SettingsDialog() {
  const open = useUi((s) => s.settingsOpen);
  const tab = useUi((s) => s.settingsTab);
  const setUi = useUi((s) => s.set);
  const settings = useSettings((s) => s.settings);
  const load = useSettings((s) => s.load);

  useEffect(() => {
    if (open && !settings) void load();
  }, [open, settings, load]);

  return (
    <Dialog open={open} onOpenChange={(value) => setUi("settingsOpen", value)}>
      <DialogContent
        title="Ajustes"
        description="Dos modelos independientes: uno mira las referencias, otro escribe la prosa del prompt."
        className="w-[min(760px,94vw)]"
      >
        {settings ? (
          <Tabs
            value={tab}
            onValueChange={(value) => setUi("settingsTab", value as SettingsTab)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <TabsList>
              <TabsTrigger value="vision">
                Visión
                <PendingDot show={!isProfileUsable(settings.vision)} />
              </TabsTrigger>
              <TabsTrigger value="writer">
                Mejora de prompt
                <PendingDot show={!isProfileUsable(settings.writer)} />
              </TabsTrigger>
              <TabsTrigger value="cache">Caché</TabsTrigger>
            </TabsList>

            {/* Both models are required, and nothing else on screen said so. */}
            {(!isProfileUsable(settings.vision) || !isProfileUsable(settings.writer)) && (
              <p className="flex items-start gap-2 border-b border-line bg-warn/8 px-4 py-2 text-[11px] leading-snug text-warn">
                <AlertTriangle className="mt-px size-3 shrink-0" />
                La app usa <strong className="font-semibold">dos</strong> modelos y hay que
                configurar los dos: Visión lee las imágenes, Mejora de prompt escribe el texto.
                Falta{" "}
                {!isProfileUsable(settings.vision) && !isProfileUsable(settings.writer)
                  ? "configurar ambos"
                  : !isProfileUsable(settings.vision)
                    ? "«Visión»"
                    : "«Mejora de prompt»"}
                .
              </p>
            )}

            <ScrollArea className="min-h-0 flex-1">
              <TabsContent value="vision" className="p-4">
                <ProfileForm
                  key={`vision-${settings.vision.baseUrl}`}
                  profile={settings.vision}
                  hasKey={settings.vision.hasKey}
                  blurb="Analiza cada imagen y extrae identidad, vestuario, luz, composición y texto visible. Tiene que ser un modelo con visión."
                />
              </TabsContent>
              <TabsContent value="writer" className="p-4">
                <ProfileForm
                  key={`writer-${settings.writer.baseUrl}`}
                  profile={settings.writer}
                  hasKey={settings.writer.hasKey}
                  blurb="Escribe la prosa del prompt: resumen, estilo, shots, soundscape y música. La estructura la impone la app, no el modelo."
                  copyFrom={isProfileUsable(settings.vision) ? settings.vision : undefined}
                />
              </TabsContent>
              <TabsContent value="cache" className="p-4">
                <CacheTab />
              </TabsContent>
            </ScrollArea>
          </Tabs>
        ) : (
          <div className="flex flex-1 items-center justify-center p-10">
            <Loader2 className="size-4 animate-spin text-ink-faint" />
          </div>
        )}

        <DialogFooter>
          <p className="mr-auto flex items-center gap-1.5 text-[10.5px] text-ink-faint">
            <KeyRound className="size-3" />
            Las API keys se guardan en el Administrador de credenciales de Windows, nunca en la app.
          </p>
          <Button variant="outline" size="md" onClick={() => setUi("settingsOpen", false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PendingDot({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span
      className="ml-1.5 inline-block size-1.5 rounded-full bg-warn align-middle"
      aria-label="sin configurar"
    />
  );
}

function ProfileForm({
  profile,
  hasKey,
  blurb,
  copyFrom,
}: {
  profile: Profile;
  hasKey: boolean;
  blurb: string;
  /** When both models share a provider, offer to clone it. */
  copyFrom?: Profile & { hasKey: boolean };
}) {
  const saveProfile = useSettings((s) => s.saveProfile);
  const setApiKey = useSettings((s) => s.setApiKey);
  const clearApiKey = useSettings((s) => s.clearApiKey);
  const copyKey = useSettings((s) => s.copyApiKey);
  const test = useSettings((s) => s.test);
  const testing = useSettings((s) => s.testing[profile.id]);
  const lastTest = useSettings((s) => s.lastTest[profile.id]);

  const [draft, setDraft] = useState<Profile>(profile);
  const [apiKey, setLocalKey] = useState("");
  const [revealKey, setRevealKey] = useState(false);
  const [saving, setSaving] = useState(false);

  const insecure =
    draft.baseUrl.startsWith("http://") &&
    !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(draft.baseUrl);

  async function persist() {
    setSaving(true);
    try {
      await saveProfile(draft);
      if (apiKey.trim()) {
        await setApiKey(profile.id, apiKey.trim());
        setLocalKey("");
      }
      toast.success("Perfil guardado");
    } catch (e) {
      toast.error("No se pudo guardar", { description: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  }

  async function cloneFrom(source: Profile & { hasKey: boolean }) {
    setDraft({ ...draft, baseUrl: source.baseUrl, model: source.model });
    try {
      if (source.hasKey) await copyKey(source.id, profile.id);
      toast.success("Copiado del perfil de Visión", {
        description: source.hasKey
          ? "Se copió también la API key. Ajustá el modelo si querés y pulsá Guardar."
          : "Ajustá el modelo si querés y pulsá Guardar.",
      });
    } catch (e) {
      toast.error("No se pudo copiar la API key", { description: errorMessage(e) });
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-[11px] leading-snug text-ink-muted">{blurb}</p>

      {copyFrom ? (
        <div className="flex items-center gap-3 rounded-lg border border-line bg-base/50 p-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-ink">¿Usás el mismo proveedor que para Visión?</p>
            <p className="truncate text-[10.5px] text-ink-faint">
              {copyFrom.baseUrl} · {copyFrom.model}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void cloneFrom(copyFrom)}>
            <CopyPlus />
            Copiar de Visión
          </Button>
        </div>
      ) : null}

      <Field
        label="Base URL"
        hint="Cualquier endpoint compatible con OpenAI. Se le agrega /chat/completions automáticamente."
        aside={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="text-[10px] text-amber hover:underline">
                usar preset
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Proveedores</DropdownMenuLabel>
              {PRESETS.map((preset) => (
                <DropdownMenuItem
                  key={preset.label}
                  onSelect={() =>
                    setDraft((d) => ({
                      ...d,
                      baseUrl: preset.url,
                      model: d.model || preset.model,
                    }))
                  }
                >
                  {preset.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      >
        <Input
          value={draft.baseUrl}
          placeholder="http://localhost:1234/v1"
          spellCheck={false}
          onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
        />
      </Field>

      {insecure ? (
        <p className="flex items-start gap-2 rounded border border-warn/30 bg-warn/8 p-2 text-[10.5px] leading-snug text-warn">
          <ShieldAlert className="mt-px size-3 shrink-0" />
          Esta URL usa http:// hacia un host remoto: la API key y tus imágenes viajarían sin cifrar.
          Usá https:// salvo que sea un servidor en tu propia máquina.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Modelo">
          <Input
            value={draft.model}
            placeholder="qwen2.5-vl-7b / gpt-5 / claude-opus-5"
            spellCheck={false}
            onChange={(e) => setDraft({ ...draft, model: e.target.value })}
          />
        </Field>

        <Field
          label="API key"
          hint={hasKey ? "Ya hay una key guardada." : "Los servidores locales no necesitan key."}
          aside={
            hasKey ? (
              <button
                type="button"
                className="text-[10px] text-danger hover:underline"
                onClick={() => void clearApiKey(profile.id)}
              >
                borrar
              </button>
            ) : null
          }
        >
          <div className="flex gap-1.5">
            <Input
              type={revealKey ? "text" : "password"}
              value={apiKey}
              placeholder={hasKey ? "••••••••••••" : "sk-…"}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setLocalKey(e.target.value)}
            />
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setRevealKey((v) => !v)}
              aria-label={revealKey ? "Ocultar" : "Mostrar"}
            >
              {revealKey ? <EyeOff /> : <Eye />}
            </Button>
          </div>
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label={`Temperatura · ${draft.temperature.toFixed(2)}`}>
          <div className="flex h-7 items-center">
            <Slider
              min={0}
              max={1.4}
              step={0.05}
              value={[draft.temperature]}
              onValueChange={([value]) => setDraft({ ...draft, temperature: value ?? 0 })}
            />
          </div>
        </Field>
        <Field label="Max tokens">
          <Input
            type="number"
            min={256}
            max={32000}
            step={256}
            value={draft.maxTokens}
            className="tnum"
            onChange={(e) => setDraft({ ...draft, maxTokens: Number(e.target.value) || 4096 })}
          />
        </Field>
        <Field label="Timeout (s)">
          <Input
            type="number"
            min={10}
            max={900}
            value={draft.timeoutSecs}
            className="tnum"
            onChange={(e) => setDraft({ ...draft, timeoutSecs: Number(e.target.value) || 180 })}
          />
        </Field>
      </div>

      <div className="flex items-center gap-2 border-t border-line pt-3">
        <Button variant="primary" size="md" disabled={saving} onClick={() => void persist()}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          Guardar
        </Button>
        <Button
          variant="outline"
          size="md"
          disabled={testing || !draft.baseUrl || !draft.model}
          onClick={() => void test(draft, apiKey || undefined)}
        >
          {testing ? <Loader2 className="animate-spin" /> : null}
          Probar conexión
        </Button>

        {lastTest ? (
          <p
            className={cn(
              "flex min-w-0 items-center gap-1.5 text-[10.5px]",
              lastTest.ok ? "text-ok" : "text-danger",
            )}
          >
            {lastTest.ok ? (
              <CheckCircle2 className="size-3 shrink-0" />
            ) : (
              <XCircle className="size-3 shrink-0" />
            )}
            <span className="truncate">{lastTest.message}</span>
            {lastTest.ok ? (
              <span className="tnum shrink-0 text-ink-faint">{lastTest.latencyMs} ms</span>
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function CacheTab() {
  const [clearing, setClearing] = useState(false);

  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-snug text-ink-muted">
        El análisis de cada imagen se guarda por hash del archivo y modelo. Si cambiás de modelo de
        visión, el nuevo análisis se calcula solo la primera vez.
      </p>
      <Button
        variant="outline"
        size="md"
        disabled={clearing}
        onClick={async () => {
          setClearing(true);
          try {
            const removed = await ipc.clearVisionCache();
            toast.success(`Caché vaciada (${removed} entradas)`);
          } catch (e) {
            toast.error("No se pudo vaciar la caché", { description: errorMessage(e) });
          } finally {
            setClearing(false);
          }
        }}
      >
        {clearing ? <Loader2 className="animate-spin" /> : null}
        Vaciar caché de visión
      </Button>
    </div>
  );
}
