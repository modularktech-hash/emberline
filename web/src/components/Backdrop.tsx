"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { usePathname } from "next/navigation";

/**
 * Cream paper with soft ember glows everywhere; vivid photos only on the
 * feature pages. On the home page the photo lights the hero and fades back to
 * cream as you scroll into the story.
 */
const PHOTOS: Record<string, string> = {
  "/": "/img/fire-dusk.webp",
  "/globe": "/img/earth-night.webp",
  "/satellites": "/img/satellite.webp",
};

export function Backdrop() {
  const path = usePathname();
  const src = PHOTOS[path];
  const { scrollY } = useScroll();
  const fade = useTransform(scrollY, [0, 700], [1, path === "/" ? 0 : 1]);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="backdrop-cream absolute inset-0" />
      {src && (
        <motion.div style={{ opacity: fade }} className="absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={src} src={src} alt="" decoding="async" className="absolute inset-0 h-full w-full scale-110 object-cover"
            style={{ filter: "blur(5px) saturate(1.7) contrast(1.12) brightness(1.05)" }} />
          <div className="backdrop-blobs absolute inset-0" />
          <div className="backdrop-scrim absolute inset-0" />
        </motion.div>
      )}
    </div>
  );
}
