import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { X } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

// ---- dialog ------------------------------------------------------------------

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  title,
  description,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  title: string;
  description?: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fade-in fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px]" />
      <DialogPrimitive.Content
        className={cn(
          "pop-in fixed left-1/2 top-1/2 z-50 flex max-h-[86vh] w-[min(720px,92vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-line-strong bg-panel shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]",
          className,
        )}
        {...props}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-4 py-3">
          <div className="flex flex-col gap-0.5">
            <DialogPrimitive.Title className="text-sm font-semibold tracking-tight text-ink">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="text-[11px] text-ink-muted">
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </div>
          <DialogPrimitive.Close className="rounded p-1 text-ink-faint transition-colors hover:bg-elevated hover:text-ink">
            <X className="size-3.5" />
          </DialogPrimitive.Close>
        </header>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <footer
      className={cn(
        "flex items-center justify-end gap-2 border-t border-line bg-base/40 px-4 py-2.5",
        className,
      )}
      {...props}
    />
  );
}

// ---- popover -----------------------------------------------------------------

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export function PopoverContent({
  className,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        sideOffset={6}
        className={cn(
          "pop-in z-50 rounded-lg border border-line-strong bg-elevated p-3 shadow-[0_20px_50px_-16px_rgba(0,0,0,0.85)]",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

// ---- dropdown ----------------------------------------------------------------

export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownMenuTrigger = DropdownPrimitive.Trigger;

export function DropdownMenuContent({
  className,
  ...props
}: React.ComponentProps<typeof DropdownPrimitive.Content>) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        sideOffset={4}
        className={cn(
          "pop-in z-50 min-w-[180px] overflow-hidden rounded-md border border-line-strong bg-elevated p-1 shadow-[0_20px_50px_-16px_rgba(0,0,0,0.85)]",
          className,
        )}
        {...props}
      />
    </DropdownPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  ...props
}: React.ComponentProps<typeof DropdownPrimitive.Item>) {
  return (
    <DropdownPrimitive.Item
      className={cn(
        "flex cursor-default select-none items-center gap-2 rounded px-2 py-1.5 text-xs text-ink outline-none transition-colors data-[highlighted]:bg-raised data-[disabled]:opacity-40 [&_svg]:size-3.5 [&_svg]:text-ink-faint",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownPrimitive.Separator>) {
  return <DropdownPrimitive.Separator className={cn("my-1 h-px bg-line", className)} {...props} />;
}

export function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof DropdownPrimitive.Label>) {
  return (
    <DropdownPrimitive.Label
      className={cn("px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink-faint", className)}
      {...props}
    />
  );
}

// ---- tooltip -----------------------------------------------------------------

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({
  content,
  children,
  side = "bottom",
  shortcut,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  shortcut?: string;
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="fade-in z-50 flex max-w-[260px] items-center gap-2 rounded-md border border-line-strong bg-elevated px-2 py-1 text-[11px] text-ink shadow-lg"
        >
          <span className="text-ink-muted">{content}</span>
          {shortcut ? (
            <kbd className="rounded border border-line-strong bg-base px-1 font-mono text-[10px] text-ink-faint">
              {shortcut}
            </kbd>
          ) : null}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
