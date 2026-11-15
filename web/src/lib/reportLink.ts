import type { Bbox } from "@/lib/aoi";

/** The worked example: a box over New South Wales (proof.json worked_example.bbox), December 2019. */
export const NSW_BOX: Bbox = [141, -37.5, 153.7, -28.2];
export const NSW_REPORT = `/report?box=${NSW_BOX.join(",")}&y=2019&m=12&mode=harmonized`;
