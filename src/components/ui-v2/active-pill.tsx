import { motion } from "motion/react";

export function ActivePill({ layoutId }: { layoutId: string }) {
  return (
    <motion.span
      layoutId={layoutId}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="from-primary/25 border-primary/35 absolute inset-0 rounded-lg border bg-gradient-to-r via-transparent to-transparent shadow-[inset_0_1px_0_0_oklch(1_0_0/6%)]"
    />
  );
}
