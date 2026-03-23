const PHASE_COLORS = {
  "Building":   { bg: "#4ADE80", text: "#14532D" },  // green  — growing volume
  "Peak":       { bg: "#F59E0B", text: "#78350F" },  // amber  — highest load
  "Base":       { bg: "#818CF8", text: "#312E81" },  // indigo — stable moderate
  "Recovery":   { bg: "#93C5FD", text: "#1E3A5F" },  // sky    — low volume
  "Sharpening": { bg: "#2DD4BF", text: "#134E4A" },  // teal   — tapering
};

export function phaseColor(phaseName) {
  return PHASE_COLORS[phaseName]?.bg ?? "#B0B7C3";
}

export function phaseTextColor(phaseName) {
  return PHASE_COLORS[phaseName]?.text ?? "#374151";
}

// Fixed ordered scale for legend rendering
export const PHASE_SCALE = [
  { name: "Base",       label: "Base",       ...PHASE_COLORS["Base"]       },
  { name: "Building",   label: "Building",   ...PHASE_COLORS["Building"]   },
  { name: "Peak",       label: "Peak",       ...PHASE_COLORS["Peak"]       },
  { name: "Sharpening", label: "Sharpening", ...PHASE_COLORS["Sharpening"] },
  { name: "Recovery",   label: "Recovery",   ...PHASE_COLORS["Recovery"]   },
];

export function inactiveColor()     { return "#B0B7C3"; }
export function inactiveTextColor() { return "#6B7280"; }
