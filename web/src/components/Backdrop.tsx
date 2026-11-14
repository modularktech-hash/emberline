"use client";

import { usePathname } from "next/navigation";

/**
 * A fixed, full-viewport photo + gradient backdrop so the glass surfaces have
 * real colour and detail to blur and refract. One photo per route; reading
 * pages get a heavily blurred ember gradient instead.
 */
const PHOTOS: Array<[prefix: string, src: string, blur: number]> = [
  ["/globe", "/img/earth-night.webp", 5],
  ["/satellites", "/img/satellite.webp", 5],
  ["/seasons", "/img/burned-forest.webp", 6],
  ["/trends", "/img/smoke-plume.webp", 6],
  ["/explorer", "/img/smoke-orbit.webp", 6],
  ["/compare", "/img/fires-night.webp", 6],
  ["/method", "/img/fire-dusk.webp", 16],
  ["/lab", "/img/fire-dusk.webp", 16],
  ["/data", "/img/smoke-orbit.webp", 16],
  ["/about", "/img/fire-dusk.webp", 16],
];

export function Backdrop() {
  const path = usePathname();
  const [, src, blur] = path === "/" ? ["/", "/img/fire-dusk.webp", 5] : PHOTOS.find(([p]) => path.startsWith(p)) ?? ["", "/img/fire-dusk.webp", 16];
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#1c120e]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img key={src} src={src} alt="" decoding="async" className="absolute inset-0 h-full w-full scale-110 object-cover"
        style={{ filter: `blur(${blur}px) saturate(1.7) contrast(1.12) brightness(1.05)` }} />
      <div className="backdrop-blobs absolute inset-0" />
      <div className="backdrop-scrim absolute inset-0" />
    </div>
  );
}
