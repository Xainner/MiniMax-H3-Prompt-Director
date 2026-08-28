import { motion } from "motion/react";

export function Deploy({
  index,
  children,
}: {
  index: number;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 26, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        type: "spring",
        stiffness: 260,
        damping: 24,
        delay: 0.08 + index * 0.07,
      }}
    >
      {children}
    </motion.div>
  );
}
