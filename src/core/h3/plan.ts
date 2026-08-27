import type { ShotDef } from "./types";

/**
 * §12.3 gives anchors rather than a formula: 5 s → 1–2 shots, 10 s → 2–4,
 * 15 s → 3–5, and states plainly that it is not a rigid rule. This stays on the
 * conservative side of those anchors, because the guide's other warning — do
 * not cut when a camera move would do — is the easier mistake to make.
 */
export function recommendedShots(durationSec: number): { min: number; max: number } {
  const duration = Math.max(1, durationSec);
  const min = Math.max(1, Math.round(duration / 5));
  const max = Math.max(min + 1, Math.round(duration / 3));
  return { min, max };
}

export function suggestedShotCount(durationSec: number): number {
  const { min, max } = recommendedShots(durationSec);
  return Math.round((min + max) / 2);
}

/**
 * Evenly spaced cuts for `count` shots. Shot 1 never carries a timestamp
 * (§12.1), so only the boundaries after it get a time.
 */
export function evenCutTimes(durationSec: number, count: number): (number | null)[] {
  const total = Math.max(1, Math.round(durationSec * 1000));
  const shots = Math.max(1, count);
  return Array.from({ length: shots }, (_, i) => {
    if (i === 0) return null;
    // Keep the last cut clear of the final frame so the shot has room to play.
    return Math.min(Math.round((total / shots) * i), total - 500);
  });
}

/**
 * Re-plans the timeline to `count` shots, reusing existing shot ids so that
 * dialogue lines and frame anchors keep pointing at something real.
 */
export function replanShots(
  existing: ShotDef[],
  durationSec: number,
  count: number,
  createId: () => string,
): { shots: ShotDef[]; removedIds: string[]; fallbackId: string } {
  const target = Math.max(1, count);
  const cuts = evenCutTimes(durationSec, target);

  const shots: ShotDef[] = cuts.map((cutMs, i) => {
    const previous = existing[i];
    return {
      id: previous?.id ?? createId(),
      cutMs,
      beat: previous?.beat ?? "",
    };
  });

  const keptIds = new Set(shots.map((s) => s.id));
  const removedIds = existing.filter((s) => !keptIds.has(s.id)).map((s) => s.id);

  return { shots, removedIds, fallbackId: shots[shots.length - 1]!.id };
}
