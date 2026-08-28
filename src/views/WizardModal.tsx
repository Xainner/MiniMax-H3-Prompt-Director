import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, Loader2, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { H3_STYLE_SKILLS, type H3SkillDefinition, type H3StyleSkillId } from "@/core/h3/skills";
import type { Brief } from "@/core/h3/types";
import { useApp } from "@/stores/appStore";
import { useProject } from "@/stores/projectStore";
import logoImg from "@/assets/brand/logo.png";
import generalImg from "@/assets/skills/general.png";
import minimalistProductAdImg from "@/assets/skills/minimalist-product-ad.png";
import threeDAnimationShortImg from "@/assets/skills/3d-animation-short.png";
import papercraftStopMotionImg from "@/assets/skills/papercraft-stop-motion-explainer.png";
import brandPromoImg from "@/assets/skills/brand-promo-video.png";
import musicVideoImg from "@/assets/skills/music-video-subtitles.png";
import coOpGameImg from "@/assets/skills/co-op-game-intro.png";
import paperCollageImg from "@/assets/skills/paper-collage-explainer.png";
import handdrawnFusionImg from "@/assets/skills/handdrawn-live-action-fusion.png";
import { MODE_TILES } from "@/views/modeTiles";

const STEPS = ["Nombre", "Formato", "Duración", "Descripción", "Skill"] as const;

const DURATION_PRESETS = [5, 10, 15, 30];

const ASPECTS: Array<{ value: Brief["aspectRatio"]; label: string; hint: string }> = [
  { value: "9:16", label: "Vertical", hint: "Reels · TikTok · Shorts" },
  { value: "16:9", label: "Horizontal", hint: "YouTube · presentaciones" },
  { value: "1:1", label: "Cuadrado", hint: "Feed · posters" },
];

interface SkillCard {
  id: H3StyleSkillId | "general";
  label: string;
  description: string;
  image: string;
  skill?: H3SkillDefinition;
}

const SKILL_IMAGES: Record<H3StyleSkillId, string> = {
  "minimalist-product-ad": minimalistProductAdImg,
  "3d-animation-short": threeDAnimationShortImg,
  "papercraft-stop-motion-explainer": papercraftStopMotionImg,
  "brand-promo-video": brandPromoImg,
  "music-video-subtitles": musicVideoImg,
  "co-op-game-intro": coOpGameImg,
  "paper-collage-explainer": paperCollageImg,
  "handdrawn-live-action-fusion": handdrawnFusionImg,
};

const SKILL_CARDS: SkillCard[] = [
  {
    id: "general",
    label: "General",
    description: "Estructura base h3-prompt-writing, sin estilo predefinido.",
    image: generalImg,
  },
  ...H3_STYLE_SKILLS.map(
    (skill): SkillCard => ({
      id: skill.id,
      label: skill.label,
      description: skill.description,
      image: SKILL_IMAGES[skill.id],
      skill,
    }),
  ),
];

const CARD_W = 168;
const CARD_GAP = 16;

const stepVariants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 40 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir * -40 }),
};

/**
 * Creation wizard as a modal over the launcher: collects name, format,
 * duration, description and the H3 skill before any project exists. Nothing
 * is persisted until "Crear proyecto".
 */
export function WizardModal() {
  const pendingMode = useApp((s) => s.pendingMode);
  const clearWizard = useApp((s) => s.clearWizard);
  const finishWizard = useApp((s) => s.finishWizard);

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [aspectRatio, setAspectRatio] = useState<Brief["aspectRatio"]>("9:16");
  const [durationSec, setDurationSec] = useState(10);
  const [idea, setIdea] = useState("");
  const [styleId, setStyleId] = useState<H3StyleSkillId | null>(null);

  const tile = MODE_TILES.find((t) => t.mode === pendingMode);

  const go = (next: number) => {
    setDirection(next > step ? 1 : -1);
    setStep(Math.max(0, Math.min(STEPS.length - 1, next)));
  };

  const finish = async () => {
    if (!pendingMode || creating) return;
    setCreating(true);
    try {
      await useProject.getState().create(name.trim() || "Proyecto sin título", pendingMode);
      const project = useProject.getState();
      project.patchBrief({ idea: idea.trim(), durationSec, aspectRatio });
      project.patchH3Skill({ styleId });
      finishWizard();
      toast.success(`Proyecto creado en ${tile?.label ?? pendingMode}`);
    } finally {
      setCreating(false);
    }
  };

  const advance = () => {
    if (step < STEPS.length - 1) go(step + 1);
    else void finish();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !creating) {
        event.preventDefault();
        clearWizard();
        return;
      }
      if (event.key === "Enter") {
        if (event.target instanceof HTMLTextAreaElement && !event.ctrlKey) return;
        event.preventDefault();
        advance();
        return;
      }
      if (step === STEPS.length - 1 && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        event.preventDefault();
        setStyleId((current) => {
          const index = SKILL_CARDS.findIndex((card) => card.id === (current ?? "general"));
          const next = Math.max(0, Math.min(SKILL_CARDS.length - 1, index + (event.key === "ArrowRight" ? 1 : -1)));
          const card = SKILL_CARDS[next]!;
          return card.id === "general" ? null : (card.id as H3StyleSkillId);
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!pendingMode || !tile) return null;

  const activeIndex = SKILL_CARDS.findIndex((card) => card.id === (styleId ?? "general"));
  const activeCard = SKILL_CARDS[activeIndex]!;
  const suggestion =
    activeCard.skill?.recommendedDurationSec && activeCard.skill.recommendedAspectRatio
      ? { durationSec: activeCard.skill.recommendedDurationSec, aspectRatio: activeCard.skill.recommendedAspectRatio }
      : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
        className="border-border relative flex max-h-[min(760px,92vh)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border bg-base shadow-2xl"
      >
        {/* Header */}
        <header className="border-line/60 flex shrink-0 items-center justify-between gap-3 border-b px-5 py-3.5">
          <div className="flex items-center gap-3">
            <img src={logoImg} alt="" draggable={false} className="size-8 rounded-lg object-contain" />
            <div>
              <p className="text-sm font-semibold leading-tight">Nuevo proyecto</p>
              <p className="text-muted-foreground text-[11px] leading-tight">
                Paso {step + 1} de {STEPS.length} · {STEPS[step]}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="border-border bg-panel flex items-center gap-2 rounded-xl py-1.5 pr-3 pl-1.5">
              <img src={tile.image} alt="" draggable={false} className="h-7 w-12 rounded-md object-cover" />
              <div className="leading-tight">
                <p className="text-primary font-mono text-[10px] font-semibold">{tile.code}</p>
                <p className="text-[11px] font-medium">{tile.label}</p>
              </div>
            </div>
            <button
              onClick={clearWizard}
              disabled={creating}
              title="Cancelar"
              className="text-muted-foreground hover:border-primary/40 hover:text-foreground flex size-8 items-center justify-center rounded-lg border border-transparent transition-colors disabled:opacity-40"
            >
              <X className="size-4" />
            </button>
          </div>
        </header>

        {/* Progress */}
        <div className="bg-panel flex shrink-0 gap-1.5 px-5 pt-3">
          {STEPS.map((label, index) => (
            <button key={label} onClick={() => go(index)} className="group flex-1 text-left" title={label}>
              <div className="bg-border/60 h-1 overflow-hidden rounded-full">
                <motion.div
                  initial={false}
                  animate={{ scaleX: index <= step ? 1 : 0 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  style={{ originX: 0 }}
                  className={`h-full rounded-full ${index === step ? "bg-primary" : "bg-primary/45"}`}
                />
              </div>
              <p className={`mt-1 text-[10px] transition-colors ${index === step ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                {label}
              </p>
            </button>
          ))}
        </div>

        {/* Step body */}
        <main className="min-h-0 flex-1 overflow-y-auto">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="px-6 py-6"
            >
              {step === 0 && (
                <div className="flex flex-col items-center pt-6 text-center">
                  <h2 className="text-lg font-semibold tracking-tight">¿Cómo se llama el proyecto?</h2>
                  <p className="text-muted-foreground mt-1 text-xs">Podés cambiarlo cuando quieras.</p>
                  <input
                    autoFocus
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Proyecto sin título"
                    maxLength={120}
                    className="border-line bg-panel focus:border-primary/60 focus:ring-primary/25 mt-6 h-11 w-full max-w-md rounded-xl border px-4 text-center text-base font-medium text-white transition-all outline-none placeholder:text-white/30 focus:ring-2"
                  />
                </div>
              )}

              {step === 1 && (
                <div className="flex flex-col items-center text-center">
                  <h2 className="text-lg font-semibold tracking-tight">Formato del video</h2>
                  <p className="text-muted-foreground mt-1 text-xs">Define la composición de cada shot (§43–§44).</p>
                  <div className="mt-6 flex items-end justify-center gap-4">
                    {ASPECTS.map((aspect) => {
                      const active = aspectRatio === aspect.value;
                      return (
                        <motion.button
                          key={aspect.value}
                          onClick={() => setAspectRatio(aspect.value)}
                          whileHover={{ y: -3 }}
                          whileTap={{ scale: 0.97 }}
                          className={`flex flex-col items-center gap-3 rounded-xl border p-4 transition-colors ${
                            active
                              ? "border-primary/60 bg-primary/10 shadow-[0_0_24px_-8px] shadow-primary/60"
                              : "border-border bg-panel hover:border-border/80"
                          }`}
                        >
                          <span
                            className={`rounded-md border ${active ? "border-primary/70 bg-primary/25" : "border-border bg-base"} ${
                              aspect.value === "9:16" ? "h-20 w-[45px]" : aspect.value === "16:9" ? "h-[45px] w-20" : "h-[62px] w-[62px]"
                            }`}
                          />
                          <span className="leading-tight">
                            <span className="block font-mono text-xs font-semibold">{aspect.value}</span>
                            <span className={`block text-[10.5px] ${active ? "text-foreground" : "text-muted-foreground"}`}>{aspect.label}</span>
                            <span className="text-muted-foreground block text-[10px]">{aspect.hint}</span>
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="flex flex-col items-center text-center">
                  <h2 className="text-lg font-semibold tracking-tight">Duración</h2>
                  <p className="text-muted-foreground mt-1 text-xs">La guía sugiere entre 5 y 15s por generación (§6).</p>
                  <div className="mt-6 flex gap-3">
                    {DURATION_PRESETS.map((preset) => {
                      const active = durationSec === preset;
                      return (
                        <motion.button
                          key={preset}
                          onClick={() => setDurationSec(preset)}
                          whileHover={{ y: -3 }}
                          whileTap={{ scale: 0.95 }}
                          className={`tnum rounded-xl border px-5 py-3.5 text-lg font-semibold transition-colors ${
                            active
                              ? "border-primary/60 bg-primary/10 shadow-[0_0_24px_-8px] shadow-primary/60"
                              : "border-border bg-panel hover:border-border/80"
                          }`}
                        >
                          {preset}
                          <span className="text-muted-foreground ml-1 text-xs font-normal">s</span>
                        </motion.button>
                      );
                    })}
                  </div>
                  <div className="border-border bg-panel mt-4 flex items-center gap-2 rounded-xl border px-3 py-2">
                    <span className="text-muted-foreground text-[11px]">Otro valor:</span>
                    <Input
                      type="number"
                      min={1}
                      max={120}
                      value={durationSec}
                      onChange={(event) => setDurationSec(Math.max(1, Math.min(120, Number(event.target.value) || 1)))}
                      className="tnum w-16 text-center"
                    />
                    <span className="text-muted-foreground text-[11px]">segundos</span>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="flex flex-col text-center">
                  <h2 className="text-lg font-semibold tracking-tight">Descripción</h2>
                  <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-xs">
                    Contá qué querés que pase. Es la idea con la que arranca el Brief; después la refinás en el Taller.
                  </p>
                  <Textarea
                    autoFocus
                    value={idea}
                    onChange={(event) => setIdea(event.target.value)}
                    rows={6}
                    placeholder="p. ej. Laura entra al local, mira el catálogo en su celular y sonríe a cámara mientras aparece el logo."
                    className="border-line bg-panel focus:border-primary/60 mt-5 min-h-[150px] rounded-xl p-4 text-sm leading-relaxed"
                  />
                  <p className="text-muted-foreground mt-2 text-[10.5px]">Ctrl+Enter para continuar</p>
                </div>
              )}

              {step === 4 && (
                <div>
                  <div className="text-center">
                    <h2 className="text-lg font-semibold tracking-tight">Skill MiniMax H3</h2>
                    <p className="text-muted-foreground mt-1 text-xs">
                      Estilo opcional que guía la dirección visual. Los campos se completan en el Brief.
                    </p>
                  </div>

                  {/* Carousel */}
                  <div className="relative mt-5 overflow-hidden py-2">
                    <motion.div
                      className="flex items-center"
                      style={{ gap: CARD_GAP, paddingLeft: `calc(50% - ${CARD_W / 2}px)` }}
                      animate={{ x: -(activeIndex * (CARD_W + CARD_GAP)) }}
                      transition={{ type: "spring", stiffness: 300, damping: 32 }}
                    >
                      {SKILL_CARDS.map((card, index) => {
                        const active = index === activeIndex;
                        const dist = Math.abs(index - activeIndex);
                        return (
                          <motion.button
                            key={card.id}
                            onClick={() => {
                              if (creating) return;
                              setStyleId(card.id === "general" ? null : (card.id as H3StyleSkillId));
                            }}
                            animate={{
                              scale: active ? 1 : 0.84,
                              opacity: dist === 0 ? 1 : dist === 1 ? 0.6 : dist === 2 ? 0.25 : 0,
                            }}
                            transition={{ duration: 0.25, ease: "easeOut" }}
                            style={{ width: CARD_W, zIndex: active ? 10 : 1 }}
                            className={`group relative aspect-[9/16] shrink-0 overflow-hidden rounded-xl border ${
                              active ? "border-primary/70 shadow-[0_0_28px_-6px] shadow-primary/70 ring-2 ring-primary/40" : "border-border"
                            }`}
                          >
                            <img
                              src={card.image}
                              alt=""
                              draggable={false}
                              className="absolute inset-0 size-full object-cover"
                            />
                            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-2 pt-10 pb-2 text-left">
                              <span className="block truncate text-[11.5px] font-semibold text-white">{card.label}</span>
                            </span>
                            {active && (
                              <span className="bg-primary text-primary-foreground absolute top-2 right-2 flex size-5 items-center justify-center rounded-full">
                                <Check className="size-3" />
                              </span>
                            )}
                          </motion.button>
                        );
                      })}
                    </motion.div>

                    <button
                      onClick={() => activeIndex > 0 && setStyleId(SKILL_CARDS[activeIndex - 1]!.id === "general" ? null : (SKILL_CARDS[activeIndex - 1]!.id as H3StyleSkillId))}
                      disabled={activeIndex === 0}
                      title="Anterior"
                      className="border-border bg-panel/80 hover:border-primary/40 absolute top-1/2 left-3 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border backdrop-blur transition-colors disabled:opacity-0"
                    >
                      <ArrowLeft className="size-4" />
                    </button>
                    <button
                      onClick={() => {
                        const next = SKILL_CARDS[activeIndex + 1];
                        if (next) setStyleId(next.id === "general" ? null : (next.id as H3StyleSkillId));
                      }}
                      disabled={activeIndex === SKILL_CARDS.length - 1}
                      title="Siguiente"
                      className="border-border bg-panel/80 hover:border-primary/40 absolute top-1/2 right-3 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border backdrop-blur transition-colors disabled:opacity-0"
                    >
                      <ArrowRight className="size-4" />
                    </button>
                  </div>

                  <p className="text-muted-foreground mt-1 text-center text-[10.5px]">
                    {activeIndex + 1} de {SKILL_CARDS.length} · ← → para navegar
                  </p>

                  <div className="mt-2 min-h-[34px] px-4 text-center">
                    <p className="text-[12px] font-medium">{activeCard.label}</p>
                    <p className="text-muted-foreground line-clamp-1 text-[11px]">{activeCard.description}</p>
                  </div>

                  {suggestion && styleId && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-2 flex justify-center"
                    >
                      <div className="border-border bg-panel flex items-center gap-3 rounded-xl border px-4 py-2">
                        <Sparkles className="text-primary size-3.5 shrink-0" />
                        <p className="text-[11px]">
                          Sugerencia: <span className="tnum font-medium">{suggestion.durationSec}s</span> ·{" "}
                          <span className="font-mono font-medium">{suggestion.aspectRatio}</span>
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setDurationSec(suggestion.durationSec);
                            setAspectRatio(suggestion.aspectRatio);
                            toast.success("Formato y duración actualizados");
                          }}
                        >
                          Aplicar
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Footer */}
        <footer className="border-line/60 bg-panel/60 flex shrink-0 items-center justify-between gap-3 border-t px-5 py-3.5">
          <Button variant="ghost" size="md" onClick={() => go(step - 1)} disabled={step === 0}>
            <ArrowLeft />Atrás
          </Button>
          <div className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
            <span className="bg-primary/60 size-1.5 animate-pulse rounded-full" />
            {creating ? "Creando proyecto…" : STEPS[step]}
          </div>
          {step < STEPS.length - 1 ? (
            <Button size="md" onClick={advance}>
              Continuar<ArrowRight />
            </Button>
          ) : (
            <Button size="md" onClick={() => void finish()} disabled={creating}>
              {creating ? <Loader2 className="animate-spin" /> : <Check />}
              Crear proyecto
            </Button>
          )}
        </footer>
      </motion.div>
    </div>
  );
}
