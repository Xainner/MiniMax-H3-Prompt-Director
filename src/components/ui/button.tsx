import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-[background-color,border-color,color,opacity] duration-150 ease-[var(--ease-out-quick)] disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 select-none",
  {
    variants: {
      variant: {
        primary:
          "bg-amber text-[#17120a] hover:bg-[#ffb739] active:bg-amber-dim font-semibold",
        default:
          "bg-raised text-ink border border-line-strong hover:bg-[#232833] hover:border-[#3d434e]",
        outline: "border border-line-strong text-ink hover:bg-elevated hover:border-[#3d434e]",
        ghost: "text-ink-muted hover:bg-elevated hover:text-ink",
        danger: "bg-danger/12 text-danger border border-danger/35 hover:bg-danger/20",
        link: "text-amber underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-6 px-2 text-[11px] [&_svg]:size-3",
        md: "h-7 px-2.5 text-xs [&_svg]:size-3.5",
        lg: "h-9 px-4 text-[13px] [&_svg]:size-4",
        icon: "size-7 [&_svg]:size-3.5",
        "icon-sm": "size-6 [&_svg]:size-3",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
