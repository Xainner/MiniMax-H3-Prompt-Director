import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;

export function SelectTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        "flex h-7 w-full items-center justify-between gap-2 rounded-md border border-line bg-base px-2 text-xs text-ink transition-colors hover:border-line-strong focus:border-amber/60 focus:outline-none focus:ring-1 focus:ring-amber/40 disabled:opacity-50 data-[placeholder]:text-ink-faint",
        className,
      )}
      {...props}
    >
      <span className="truncate text-left">{children}</span>
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="size-3 shrink-0 text-ink-faint" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export function SelectContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position="popper"
        sideOffset={4}
        className={cn(
          "pop-in z-50 max-h-[320px] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-line-strong bg-elevated shadow-[0_16px_40px_-12px_rgba(0,0,0,0.8)]",
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

export function SelectItem({
  className,
  children,
  hint,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item> & { hint?: string }) {
  return (
    <SelectPrimitive.Item
      className={cn(
        "relative flex cursor-default select-none flex-col gap-0.5 rounded px-2 py-1.5 pr-7 text-xs text-ink outline-none data-[highlighted]:bg-raised data-[state=checked]:text-amber",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      {hint ? <span className="text-[10px] leading-tight text-ink-faint">{hint}</span> : null}
      <SelectPrimitive.ItemIndicator className="absolute right-2 top-1.5">
        <Check className="size-3" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

export function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      className={cn("px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink-faint", className)}
      {...props}
    />
  );
}
