// Volume level → sequential color scale (cool=low, warm=high)
const VOLUME_COLORS = {
  "Low":      { bg: "#BEE3B0", text: "#2D6A1F" },  // soft green
  "Moderate": { bg: "#93C5E8", text: "#1A4F78" },  // light blue
  "Steady":   { bg: "#7B8FD4", text: "#2A3580" },  // indigo
  "High":     { bg: "#F5A623", text: "#7A4800" },  // amber
  "Peak":     { bg: "#E05A3A", text: "#6B1500" },  // red-orange
};

// Character modifier → small label suffix only (no color change)
function volumeLevel(phaseName) {
  if (phaseName.startsWith("Low"))      return "Low";
  if (phaseName.startsWith("Moderate")) return "Moderate";
  if (phaseName.startsWith("Steady"))   return "Steady";
  if (phaseName.startsWith("High"))     return "High";
  if (phaseName.startsWith("Peak"))     return "Peak";
  return null;
}

export function phaseColor(phaseName) {
  const lvl = volumeLevel(phaseName);
  return lvl ? VOLUME_COLORS[lvl].bg : "#D1D5DB";
}

export function phaseTextColor(phaseName) {
  const lvl = volumeLevel(phaseName);
  return lvl ? VOLUME_COLORS[lvl].text : "#374151";
}

// Export for legend rendering
export const VOLUME_SCALE = [
  { level: "Low",      label: "Low",      ...VOLUME_COLORS["Low"]      },
  { level: "Moderate", label: "Moderate", ...VOLUME_COLORS["Moderate"] },
  { level: "Steady",   label: "Steady",   ...VOLUME_COLORS["Steady"]   },
  { level: "High",     label: "High",     ...VOLUME_COLORS["High"]     },
  { level: "Peak",     label: "Peak",     ...VOLUME_COLORS["Peak"]     },
];

export function inactiveColor() { return "#F87171"; }
export function inactiveTextColor() { return "#7F1D1D"; }
