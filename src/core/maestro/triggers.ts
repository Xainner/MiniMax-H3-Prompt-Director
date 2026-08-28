import type { MaestroLora, MaestroLoraSelection, TriggerPlacement } from "./types";

const ACTION_HINT = /action|motion|fight|combat|punch|kick|dance|pose|cowgirl|thrust|running|walking|movement/i;

function meaningfulTokens(value: string): string[] {
  return value.toLowerCase().match(/[a-z0-9]{4,}/g) ?? [];
}

export function chooseTrigger(lora: MaestroLora, context: string): string | null {
  if (lora.trained_words.length === 0) return null;
  const lower = context.toLowerCase();
  return lora.trained_words.find((word) => lower.includes(word.toLowerCase())) ?? lora.trained_words[0] ?? null;
}

export function applyLoraTriggers(
  windows: string[],
  catalog: MaestroLora[],
  selections: MaestroLoraSelection[],
  context: string,
): { windows: string[]; placements: TriggerPlacement[] } {
  const output = windows.map((window) => window.replace(/\s*\n+\s*/g, " ").trim());
  const placements: TriggerPlacement[] = [];

  for (const selection of selections) {
    const lora = catalog.find((item) => item.filename === selection.filename);
    if (!lora) {
      placements.push({ filename: selection.filename, trigger: selection.trigger, windowIndexes: [], omitted: false, reason: "La LoRA no existe en esta instancia." });
      continue;
    }
    const trigger = selection.trigger ?? chooseTrigger(lora, context);
    if (!trigger || selection.omitTrigger) {
      placements.push({
        filename: selection.filename,
        trigger,
        windowIndexes: [],
        omitted: true,
        reason: selection.omitTrigger ? "Omitido manualmente." : "La LoRA no declara trained_words.",
      });
      continue;
    }

    const actionSource = `${lora.filename} ${lora.trained_words.join(" ")}`;
    const action = ACTION_HINT.test(actionSource);
    const tokens = meaningfulTokens(`${trigger} ${lora.filename.replace(/\.[^.]+$/, "")}`);
    const actionPattern = /combat|fight|prfight/i.test(actionSource)
      ? /fight|combat|punch|kick|strike|battle/i
      : /cowgirl|thrust/i.test(actionSource)
        ? /cowgirl|thrust|straddl|rid(?:e|ing)/i
        : /dance/i.test(actionSource)
          ? /dance|dancing|choreograph/i
          : null;
    let targets = output.map((_, index) => index).filter((index) =>
      !action || Boolean(actionPattern?.test(output[index]!)) || tokens.some((token) => output[index]!.toLowerCase().includes(token)),
    );
    if (action && targets.length === 0) {
      placements.push({ filename: selection.filename, trigger, windowIndexes: [], omitted: true, reason: "No hay una ventana cuya acción corresponda al trigger." });
      continue;
    }
    if (targets.length === 0) targets = output.map((_, index) => index);
    for (const index of targets) {
      if (!output[index]!.includes(trigger)) {
        const sentence = `The visual action naturally follows ${trigger}.`;
        const closing = " End this window with ";
        const closingAt = output[index]!.indexOf(closing);
        output[index] = (closingAt >= 0
          ? `${output[index]!.slice(0, closingAt)} ${sentence}${output[index]!.slice(closingAt)}`
          : `${output[index]} ${sentence}`
        ).replace(/\s+/g, " ").trim();
      }
    }
    placements.push({ filename: selection.filename, trigger, windowIndexes: targets.map((index) => index + 1), omitted: false });
  }
  return { windows: output, placements };
}

export function validateTriggerPlacements(
  windows: string[],
  catalog: MaestroLora[],
  selections: MaestroLoraSelection[],
): string[] {
  const errors: string[] = [];
  for (const selection of selections) {
    const lora = catalog.find((item) => item.filename === selection.filename);
    if (!lora) {
      errors.push(`La LoRA ${selection.filename} ya no existe en la instancia elegida.`);
      continue;
    }
    if (selection.omitTrigger || !selection.trigger) continue;
    if (!lora.trained_words.includes(selection.trigger)) errors.push(`El trigger de ${selection.filename} no coincide exactamente con trained_words.`);
    if (!windows.some((window) => window.includes(selection.trigger!))) errors.push(`Falta el trigger exacto «${selection.trigger}» de ${selection.filename}.`);
    for (let index = 0; index < windows.length; index += 1) {
      const occurrences = windows[index]!.split(selection.trigger).length - 1;
      if (occurrences > 1) errors.push(`El trigger «${selection.trigger}» está duplicado en Window ${index + 1}.`);
    }
  }
  return errors;
}
