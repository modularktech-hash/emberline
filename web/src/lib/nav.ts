export interface NavItem { href: string; label: string; blurb: string }
export interface NavGroup { label: string; items: NavItem[] }

/** The site, grouped the way the story runs: the story, your area, live, the proof, the data. */
export const NAV: NavGroup[] = [
  { label: "Explore", items: [
    { href: "/report", label: "Fire report", blurb: "One area, one month: how unusual it was, how far to trust it, as a downloadable report" },
    { href: "/explorer", label: "Calendar explorer", blurb: "Month × year burning calendar for every fitted country or a drawn box, raw or harmonized" },
    { href: "/seasons", label: "Seasonal anomalies", blurb: "Is this year normal? Each month against its history" },
    { href: "/trends", label: "Season shift", blurb: "Is the fire season starting earlier, or is that the sensor?" },
    { href: "/compare", label: "Compare", blurb: "Two regions side by side, same unit, same scale" },
  ]},
  { label: "Live", items: [
    { href: "/globe", label: "Live globe", blurb: "Recent satellite fire detections (last 24 h, raw) and the satellites that made them" },
    { href: "/satellites", label: "Satellites", blurb: "The five fire satellites, their orbits, and the drift" },
  ]},
  { label: "Proof", items: [
    { href: "/method", label: "Method & validation", blurb: "How the correction works and how we know it holds" },
  ]},
  { label: "Data", items: [
    { href: "/data", label: "Data", blurb: "Every table, every download, query it yourself" },
    { href: "/lab", label: "Lab", blurb: "Calculators for detection probability, conversion, drift" },
  ]},
];

export const ALL = NAV.flatMap((g) => g.items);

/** Dot-matrix name of a route, shown on the page curtain. */
export const ROUTE_NAME: Record<string, string> = {
  "/": "STORY", "/explorer": "EXPLORER", "/report": "REPORT", "/seasons": "SEASONS", "/trends": "SEASON SHIFT", "/compare": "COMPARE",
  "/globe": "LIVE GLOBE", "/satellites": "SATELLITES", "/method": "PROOF", "/data": "DATA", "/lab": "LAB", "/about": "ABOUT",
};
