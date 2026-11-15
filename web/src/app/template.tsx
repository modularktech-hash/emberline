import type { ReactNode } from "react";
import { PageIn } from "@/components/PageIn";

/**
 * Every route change fades and lifts the new page in (opacity + transform only: no filter),
 * except when the named curtain (components/RouteTransition) is covering the screen: then the
 * page mounts in place and the curtain lift is the transition.
 */
export default function Template({ children }: { children: ReactNode }) {
  return <PageIn>{children}</PageIn>;
}
