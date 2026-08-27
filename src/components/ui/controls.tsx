import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import * as SeparatorPrimitive from "@radix-ui/react-separator";
import * as SliderPrimitive from "@radix-ui/react-slider";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

// ---- switch ------------------------------------------------------------------

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "peer inline-flex h-4 w-7 shrink-0 items-center rounded-full border border-line-strong bg-base transition-colors duration-150 data-[state=checked]:border-amber/50 data-[state=checked]:bg-amber/25 disabled:opacity-40",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-3 translate-x-0.5 rounded-full bg-ink-faint shadow transition-transform duration-150 ease-[var(--ease-out-quick)] data-[state=checked]:translate-x-[13px] data-[state=checked]:bg-amber" />
    </SwitchPrimitive.Root>
  );
}

// ---- separator ---------------------------------------------------------------

export function Separator({
  className,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      className={cn(
        "shrink-0 bg-line data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px",
        className,
      )}
      {...props}
    />
  );
}

// ---- scroll area -------------------------------------------------------------

export function ScrollArea({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root>) {
  return (
    <ScrollAreaPrimitive.Root className={cn("relative overflow-hidden", className)} {...props}>
      <ScrollAreaPrimitive.Viewport className="size-full [&>div]:!block">
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollAreaPrimitive.Scrollbar
        orientation="vertical"
        className="flex w-2 touch-none select-none p-0.5"
      >
        <ScrollAreaPrimitive.Thumb className="flex-1 rounded-full bg-line-strong" />
      </ScrollAreaPrimitive.Scrollbar>
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

// ---- tabs --------------------------------------------------------------------

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn("flex items-center gap-0.5 border-b border-line px-1", className)}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "relative -mb-px border-b-2 border-transparent px-2.5 py-1.5 text-[11px] font-medium text-ink-faint transition-colors hover:text-ink-muted data-[state=active]:border-amber data-[state=active]:text-ink",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("outline-none", className)} {...props} />;
}

// ---- toggle group ------------------------------------------------------------

export const ToggleGroup = ToggleGroupPrimitive.Root;

export function ToggleGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      className={cn(
        "h-6 flex-1 rounded border border-transparent px-2 text-[11px] font-medium text-ink-faint transition-colors hover:text-ink data-[state=on]:border-amber/40 data-[state=on]:bg-amber/12 data-[state=on]:text-amber",
        className,
      )}
      {...props}
    />
  );
}

// ---- slider ------------------------------------------------------------------

export function Slider({ className, ...props }: React.ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      className={cn("relative flex h-4 w-full touch-none select-none items-center", className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-line">
        <SliderPrimitive.Range className="absolute h-full bg-amber/70" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block size-3 rounded-full border border-amber bg-raised transition-transform hover:scale-110 focus-visible:outline-none" />
    </SliderPrimitive.Root>
  );
}

// ---- badge -------------------------------------------------------------------

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded border px-1.5 py-px font-mono text-[10px] leading-4 tracking-tight",
  {
    variants: {
      tone: {
        subject: "border-amber/35 bg-amber/12 text-amber",
        picture: "border-cyan/35 bg-cyan/12 text-cyan",
        video: "border-[#a78bfa]/35 bg-[#a78bfa]/12 text-[#c4b5fd]",
        audio: "border-ok/35 bg-ok/12 text-ok",
        neutral: "border-line-strong bg-raised text-ink-muted",
        danger: "border-danger/40 bg-danger/12 text-danger",
        warn: "border-warn/40 bg-warn/12 text-warn",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/** Colour-codes a reference tag by its kind so the rail reads at a glance. */
export function toneForTag(tag: string): "subject" | "picture" | "video" | "audio" | "neutral" {
  if (tag.startsWith("<Subject")) return "subject";
  if (tag.startsWith("<Picture")) return "picture";
  if (tag.startsWith("<Video")) return "video";
  if (tag.startsWith("<Audio")) return "audio";
  return "neutral";
}
