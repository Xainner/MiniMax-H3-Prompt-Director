import * as LabelPrimitive from "@radix-ui/react-label";
import type * as React from "react";
import { cn } from "@/lib/utils";

const fieldBase =
  "w-full rounded-md border border-line bg-base text-ink placeholder:text-ink-faint transition-colors duration-150 focus:border-amber/60 focus:outline-none focus:ring-1 focus:ring-amber/40 disabled:opacity-50";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldBase, "h-7 px-2 text-xs", className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(fieldBase, "min-h-[64px] resize-y px-2 py-1.5 text-xs leading-relaxed", className)}
      {...props}
    />
  );
}

export function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn("text-[11px] font-medium text-ink-muted select-none", className)}
      {...props}
    />
  );
}

interface FieldProps {
  label: string;
  hint?: string;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
  /** Rendered at the right of the label row. */
  aside?: React.ReactNode;
}

export function Field({ label, hint, htmlFor, className, children, aside }: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={htmlFor}>{label}</Label>
        {aside}
      </div>
      {children}
      {hint ? <p className="text-[10.5px] leading-snug text-ink-faint">{hint}</p> : null}
    </div>
  );
}
