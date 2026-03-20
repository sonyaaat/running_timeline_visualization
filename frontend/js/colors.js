export function phaseColor(phaseName) {
  // Returns hex color for a phase name
  // Use the same PHASE_COLORS map from backend config
  const COLORS = {
    "Inactive":                    "#D1D5DB",
    "Sparse":                      "#D1D5DB",
    "Low Volume":                  "#C0DD97",
    "Low Volume / Long Runs":      "#97C459",
    "Moderate Volume":             "#5CB6E6",
    "Moderate Volume / Long Runs": "#4B8BBE",
    "Moderate Volume / Fast Weeks":"#0F6E56",
    "Moderate Volume / Frequent":  "#185FA5",
    "Steady Volume":               "#3C3489",
    "Steady Volume / Long Runs":   "#3C3489",
    "Steady Volume / Fast Weeks":  "#0F6E56",
    "Steady Volume / Consistent":  "#185FA5",
    "Steady Volume / Frequent":    "#3C3489",
    "High Volume":                 "#854F0B",
    "High Volume / Long Runs":     "#854F0B",
    "High Volume / Fast Weeks":    "#A32D2D",
    "High Volume / Frequent":      "#854F0B",
    "Peak Volume":                 "#A32D2D"
  };
  return COLORS[phaseName] ?? "#D1D5DB";
}

export function phaseTextColor(phaseName) {
  // Returns dark text color for each phase (for labels on colored backgrounds)
  const TEXT = {
    "Inactive":                    "#6B7280",
    "Sparse":                      "#3B6D11",
    "Low Volume":                  "#3B6D11",
    "Low Volume / Long Runs":      "#3B6D11",
    "Moderate Volume":             "#185FA5",
    "Moderate Volume / Long Runs": "#185FA5",
    "Moderate Volume / Fast Weeks":"#0F6E56",
    "Moderate Volume / Frequent":  "#185FA5",
    "Steady Volume":               "#3C3489",
    "Steady Volume / Long Runs":   "#3C3489",
    "Steady Volume / Fast Weeks":  "#0F6E56",
    "Steady Volume / Consistent":  "#185FA5",
    "Steady Volume / Frequent":    "#3C3489",
    "High Volume":                 "#854F0B",
    "High Volume / Long Runs":     "#854F0B",
    "High Volume / Fast Weeks":    "#A32D2D",
    "High Volume / Frequent":      "#854F0B",
    "Peak Volume":                 "#A32D2D"
  };
  return TEXT[phaseName] ?? "#222";
}
