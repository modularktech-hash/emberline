export interface NavItem { href: string; label: string; blurb: string }
export interface NavGroup { label: string; items: NavItem[] }

export const NAV: NavGroup[] = [
  { label: "Explore", items: [
    { href: "/explorer", label: "Calendar explorer", blurb: "Month × year burning calendar for every fitted country or a drawn box, raw or harmonized" },
    { href: "/globe", label: "Live globe", blurb: "Recent satellite fire detections (last 24 h, raw) and the satellites that made them" },
    { href: "/compare", label: "Compare", blurb: "Two regions side by side, same unit, same scale" },
  ]},
  { label: "Insights", items: [
    { href: "/seasons", label: "Seasons", blurb: "Is this year normal? Each month against its history" },
    { href: "/trends", label: "Season shift", blurb: "Is the fire season starting earlier — or is that the sensor?" },
    { href: "/satellites", label: "Satellites", blurb: "The five fire satellites, their orbits, and the drift" },
  ]},
  { label: "Science", items: [
    { href: "/method", label: "Method & proof", blurb: "How the correction works and how we know it holds" },
    { href: "/lab", label: "Lab", blurb: "Calculators for detection probability, conversion, drift" },
    { href: "/data", label: "Data", blurb: "Every table, every download, query it yourself" },
  ]},
];

export const ALL = NAV.flatMap((g) => g.items);
