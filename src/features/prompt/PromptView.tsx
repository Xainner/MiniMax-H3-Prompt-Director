import { Fragment, useMemo, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Purpose-built highlighter for the H3 prompt dialect. Rendering React nodes
 * (never `dangerouslySetInnerHTML`) keeps model output inert by construction.
 */
const TOKENS: { name: string; pattern: string; className: string }[] = [
  { name: "section", pattern: "^[a-z_]+:$", className: "text-ink font-semibold" },
  { name: "shot", pattern: "\\[Shot \\d+\\]", className: "text-amber font-semibold" },
  { name: "time", pattern: "At \\d{2}:\\d{2}\\.\\d{3}", className: "text-amber-dim tnum" },
  { name: "subject", pattern: "<Subject \\d+>", className: "text-amber" },
  { name: "picture", pattern: "<Picture \\d+>", className: "text-cyan" },
  { name: "video", pattern: "<Video \\d+>", className: "text-[#c4b5fd]" },
  { name: "audio", pattern: "<Audio \\d+>", className: "text-ok" },
  { name: "speaker", pattern: "\\(S\\d+(?:,\\s*S\\d+)*\\)", className: "text-ok" },
  { name: "dtag", pattern: "</?d>", className: "text-danger" },
  { name: "lang", pattern: "\\[[A-Z][a-zA-Z-]+\\]", className: "text-danger/80" },
  { name: "control", pattern: "<scenetrans>|<cutoff>", className: "text-warn" },
  { name: "retention", pattern: "\\b(?:fully_preserved|partially_preserved|attribute_transfer|weak_reference|fully_copy|partially_copy|reference)\\b(?=\\s*-)", className: "text-cyan-dim" },
  { name: "task", pattern: "\\[(?:keyframe completion|reference generation|video editing|video continuation|audio reuse|audio reference)(?: \\+ (?:keyframe completion|reference generation|video editing|video continuation|audio reuse|audio reference))*\\]", className: "text-cyan" },
  { name: "quoted", pattern: '"[^"\\n]{1,120}"', className: "text-warn" },
  { name: "caps", pattern: "^[A-Z][A-Z ]{4,} — HIGHEST PRIORITY:$", className: "text-warn font-semibold" },
];

const HIGHLIGHT_RE = new RegExp(TOKENS.map((t) => `(${t.pattern})`).join("|"), "gm");

export function PromptView({
  text,
  className,
  highlightRange,
}: {
  text: string;
  className?: string;
  highlightRange?: { offset: number; length: number } | null;
}) {
  const nodes = useMemo(() => highlight(text, highlightRange), [text, highlightRange]);

  return (
    <pre
      className={cn(
        "selectable whitespace-pre-wrap break-words font-mono text-[12px] leading-[1.65] text-ink-muted",
        className,
      )}
    >
      {nodes}
    </pre>
  );
}

function highlight(
  text: string,
  range?: { offset: number; length: number } | null,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  const emit = (slice: string, className?: string) => {
    if (!slice) return;
    nodes.push(
      className ? (
        <span key={key++} className={className}>
          {slice}
        </span>
      ) : (
        <Fragment key={key++}>{slice}</Fragment>
      ),
    );
  };

  HIGHLIGHT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HIGHLIGHT_RE.exec(text)) !== null) {
    if (match.index > cursor) emit(text.slice(cursor, match.index));
    const groupIndex = match.slice(1).findIndex((g) => g !== undefined);
    emit(match[0], TOKENS[groupIndex]?.className);
    cursor = match.index + match[0].length;
    // Zero-length matches would spin forever.
    if (match[0].length === 0) HIGHLIGHT_RE.lastIndex += 1;
  }
  emit(text.slice(cursor));

  if (!range) return nodes;

  // Wrap the flagged span in a marker without re-tokenising the whole document.
  return [
    <span key="pre">{highlight(text.slice(0, range.offset))}</span>,
    <mark
      key="mark"
      id="finding-anchor"
      className="rounded bg-danger/25 text-ink outline outline-1 outline-danger/60"
    >
      {highlight(text.slice(range.offset, range.offset + range.length))}
    </mark>,
    <span key="post">{highlight(text.slice(range.offset + range.length))}</span>,
  ];
}
