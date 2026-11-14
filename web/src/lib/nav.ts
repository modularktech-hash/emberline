export interface NavItem { href: string; label: string; blurb: string }
export interface NavGroup { label: string; items: NavItem[] }

export const NAV: NavGroup[] = [
  { label: "Explore", items: [
    { href: "/explorer", label: "Calendar explorer", blurb: "Month × year burning calendar for any area, raw or harmonized" },
    { href: "/globe", label: "Live globe", blurb: "Every fire seen from orbit in the last 24 hours, and the satellites that saw them" },
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
