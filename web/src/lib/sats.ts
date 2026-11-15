/** Satellite colours, shared by the globe, the fleet cards and the drift clocks (kept out of FireGlobe so pages don't pull in three.js to read them). */
export const SAT_COLORS: Record<string, string> = {
  // Okabe–Ito based, plus a dark ochre for NOAA-20: every pair stays apart under deuteranopia,
  // protanopia and tritanopia, and each is at least 3:1 against white (scripts/check_color_access.py).
  Terra: "#cc79a7", Aqua: "#0072b2", "Suomi-NPP": "#d55e00", "NOAA-20": "#6b5300", "NOAA-21": "#009e73",
};
