"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { EASE } from "@/lib/motion";

/** Every route change fades and lifts the new page in (opacity + transform only: no filter). */
export default function Template({ children }: { children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.42, ease: EASE }}>
      {children}
    </motion.div>
  );
}
