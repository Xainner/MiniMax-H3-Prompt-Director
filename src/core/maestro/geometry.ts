import type { MaestroModelCapabilities, MaestroWindowGeometry } from "./types";

export function quantizeFrames(value: number, minimum: number, step: number): number {
  const safeStep = Math.max(1, Math.round(step));
  const safeMin = Math.max(1, Math.round(minimum));
  const requested = Math.max(safeMin, Math.round(value));
  return safeMin + Math.round((requested - safeMin) / safeStep) * safeStep;
}

export function normalizeOverlap(value: number, windowFrames: number, caps: MaestroModelCapabilities): number {
  const minimum = Math.max(0, caps.overlapMinimum);
  const maximum = Math.min(windowFrames - 1, Math.max(minimum, caps.overlapMaximum));
  const step = Math.max(1, caps.overlapStep);
  const clamped = Math.min(maximum, Math.max(minimum, Math.round(value)));
  return Math.min(maximum, minimum + Math.round((clamped - minimum) / step) * step);
}

export function computeMaestroGeometry(
  durationSeconds: number,
  caps: MaestroModelCapabilities,
  requestedWindowFrames?: number,
  requestedOverlap?: number,
  continuity = true,
): { totalFrames: number; windowFrames: number; overlapFrames: number; windows: MaestroWindowGeometry[] } {
  const fps = Math.max(1, caps.fps || 24);
  const totalFrames = Math.max(1, Math.round(Math.max(0.1, durationSeconds) * fps));
  const windowFrames = Math.min(
    caps.framesMaximum,
    Math.max(caps.framesMinimum, quantizeFrames(requestedWindowFrames ?? caps.framesMaximum, caps.framesMinimum, caps.framesStep)),
  );
  const overlapFrames = continuity
    ? normalizeOverlap(requestedOverlap ?? caps.overlapDefault, windowFrames, caps)
    : 0;
  const stride = Math.max(1, windowFrames - overlapFrames);
  const count = totalFrames <= windowFrames ? 1 : 1 + Math.ceil((totalFrames - windowFrames) / stride);
  const windows: MaestroWindowGeometry[] = [];
  let committedStart = 0;
  for (let index = 0; index < count; index += 1) {
    const committedLength = index === 0 ? windowFrames : stride;
    const committedEnd = Math.min(totalFrames, committedStart + committedLength);
    windows.push({
      index: index + 1,
      startFrame: committedStart,
      endFrame: committedEnd,
      startSeconds: Number((committedStart / fps).toFixed(3)),
      endSeconds: Number((committedEnd / fps).toFixed(3)),
      frames: Math.max(1, committedEnd - committedStart),
    });
    committedStart = committedEnd;
  }
  return { totalFrames, windowFrames, overlapFrames, windows };
}

