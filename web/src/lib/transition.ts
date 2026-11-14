/**
 * Shared flag between <RouteTransition/> and app/template.tsx: while the
 * curtain covers the screen, the new page mounts without its own fade (the
 * curtain lift is the transition), so the two never double-animate.
 */
let covering = false;
export const isCovering = () => covering;
export const setCovering = (v: boolean) => { covering = v; };
