/**
 * Plain-language explanations, one place for the whole site. The "i" on a tile, chart or stat
 * (components/ui InfoDot) and the search palette both read from here, so a term is always
 * explained in the same words.
 */
export interface InfoEntry { title: string; text: string }

export const INFO = {
  frp: { title: "FRP", text: "Fire radiative power: how much heat a fire gives off, in megawatts. Big fires are bright in the infrared; small ones are faint." },
  modis: { title: "MODIS", text: "The older NASA fire sensor, on the Terra and Aqua satellites. It sees the ground in squares about 1 km across, so it misses many small fires." },
  viirs: { title: "VIIRS", text: "The newer fire sensor, on Suomi-NPP, NOAA-20 and NOAA-21. Its squares are 375 m across, so it sees many more small fires than MODIS." },
  harmonized: { title: "Harmonized", text: "VIIRS counts converted to an estimate of what Aqua MODIS would have reported, so years before and after 2012 can be compared in one unit. From 2012 it is an estimate, not an actual MODIS observation." },
  raw: { title: "Raw", text: "Detections exactly as the satellites reported them, with no correction. Across 2012 the raw record mixes two different sensors." },
  aquaEquivalent: { title: "Aqua-MODIS-equivalent", text: "Our unit. Each VIIRS detection is weighted by how likely Aqua MODIS was to see a fire of that strength, then scaled per country." },
  r2: { title: "R²", text: "How closely our corrected counts follow what Aqua actually saw, in years the model never trained on. 1 is perfect; 0 is no better than guessing the average; below 0 is worse than that." },
  kappa: { title: "κ (kappa)", text: "A per-country scale factor. After weighting each fire by its detection chance, κ lines the total up with Aqua's total in the training years." },
  nrt: { title: "NRT", text: "Near-real-time: detections published within hours of the satellite pass. Quick, provisional and not corrected." },
  heldOut: { title: "Held-out years", text: "2019–2021. The model was fitted on 2012–2018 only, then scored on these three years it had never seen." },
  drift: { title: "Orbit drift", text: "Since 2022 Terra and Aqua have been slipping to later overpass times. Our fit stops at 2021 so that slip is not mistaken for a change in fire." },
  pooled: { title: "Borrowed curve", text: "Some countries have too few fires to fit their own detection curve. They borrow one shared (pooled) curve averaged from countries that do, and are marked as such. Pooled countries have larger held-out errors than own-fit ones (see What the correction cannot do on the Method page)." },
  uncorrected: { title: "Uncorrected", text: "No fit exists for this country, so only raw counts are shown. They are never presented as corrected." },
  step: { title: "The 2012 step", text: "Yearly detections in 2012–14 divided by 2009–11. When the MODIS and VIIRS records are naively joined, this jumps because the sensor changed, not because fire did. Each NASA record on its own has no such jump." },
  stepCollapse: { title: "Step collapse", text: "Each dot is a country. If our record moves across 2012 the way an unchanged sensor did, the dot sits on the diagonal." },
  falseRecord: { title: "False-Record Counter", text: "How often a month in 2012–2021 beats the 2003–2011 maximum of the same calendar month (9 baseline years). If a later year is like those 9 (no trend, no ties), its chance of being the largest of the 10 is 1 in 10, so about 10% is the no-change reference. Naively joining MODIS and VIIRS makes most months look like records; a consistent record should not." },
  typicalError: { title: "Typical held-out error", text: "The median monthly miss: how far the harmonized monthly total for this country was from what Aqua MODIS actually recorded, in the held-out years 2019–2021 that the fit never saw (median of |predicted − observed| ÷ observed). 1 month in 5 missed by more than the second figure shown. Not a confidence interval, and no guarantee that a given month falls within it." },
  unusualMonth: { title: "Most unusual month", text: "The month that ranks highest among the same calendar month in every year 2003–2025 of the harmonized record; ties are broken by how far it sits above that month's median. The median and range shown are the other years of that calendar month, the month itself excluded. Historical context, not a forecast." },
  seam: { title: "Find the Seam", text: "A blind test. Without being told the year, find each country's biggest jump. If the repair worked, 2012 should win no more often than any other year." },
  benchmark: { title: "Benchmark", text: "Our model against simpler corrections, scored on the same held-out years. We report where it wins and where it does not." },
  calendar: { title: "Burning calendar", text: "Months across, years down. A darker cell means more fire detections in that month." },
  percentile: { title: "Percentile", text: "Where this value sits among the same month in other years. The 90th percentile means higher than nine years in ten." },
  monthToDate: { title: "This month so far", text: "Provisional raw counts for the current month from the live feeds. Not harmonized, and a different satellite from the long record." },
  live: { title: "Live layer", text: "The last 24 hours and 7 days from NOAA-20, NOAA-21 and MODIS. Raw, and a different platform from the historical Suomi-NPP record." },
  eonet: { title: "EONET", text: "NASA's curated list of natural events. Wildfire events here are named by people, a separate source from the satellite detections." },
  gibs: { title: "GIBS", text: "NASA's satellite imagery service. The Explorer can show its true-colour view as an optional map layer." },
  tle: { title: "TLE", text: "Two-line element set: the published orbit of a satellite, used here to draw where each one is." },
  localSolarTime: { title: "Local solar time", text: "Clock time by the sun at the fire's own longitude (UTC + longitude ÷ 15). Used for every time-of-day figure." },
  threshold: { title: "Detection threshold", text: "MODIS thresholds of FRP detection are about 9–11 MW (Roberts & Wooster 2008; Schroeder et al. 2010). Fires fainter than that are easily missed." },
  h3: { title: "Grid cell", text: "The map is divided into hexagons. A drawn area sums every hexagon it touches, so some activity just outside the box is included." },
  interval: { title: "Interval", text: "A range from re-fitting the detection curve many times. It covers the curve only, not every source of uncertainty." },
  seasonShift: { title: "Season shift", text: "Whether the fire season starts earlier or later over the years, in days per decade. Descriptive, with wide uncertainty." },
  firmsArchive: { title: "FIRMS archive", text: "NASA's full historical record of fire detections: MODIS Collection 6.1 and VIIRS 375 m." },
  pipeline: { title: "Data journey", text: "The path from NASA's archive files to the small tables this site reads, with the real number at each stage." },
} satisfies Record<string, InfoEntry>;

export type InfoKey = keyof typeof INFO;
