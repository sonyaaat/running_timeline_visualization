const PHASE_COLORS = {
  "Inactive":                      "#F87171",
  "Sparse":                        "#F87171",
  "Low Volume":                    "#C0DD97",
  "Low Volume / Long Runs":        "#97C459",
  "Moderate Volume":               "#B5D4F4",
  "Moderate Volume / Long Runs":   "#85B7EB",
  "Moderate Volume / Fast Weeks":  "#5DCAA5",
  "Moderate Volume / Frequent":    "#85B7EB",
  "Steady Volume":                 "#7F77DD",
  "Steady Volume / Long Runs":     "#AFA9EC",
  "Steady Volume / Fast Weeks":    "#5DCAA5",
  "Steady Volume / Consistent":    "#85B7EB",
  "Steady Volume / Frequent":      "#7F77DD",
  "High Volume":                   "#EF9F27",
  "High Volume / Long Runs":       "#BA7517",
  "High Volume / Fast Weeks":      "#E24B4A",
  "High Volume / Frequent":        "#EF9F27",
  "Peak Volume":                   "#D85A30",
  "Peak Volume / Fast Weeks":      "#A32D2D",
  "Peak Volume / Long Runs":       "#BA7517",
};

const PHASE_TEXT_COLORS = {
  "Inactive":                      "#6B7280",
  "Sparse":                        "#3B6D11",
  "Low Volume":                    "#3B6D11",
  "Low Volume / Long Runs":        "#3B6D11",
  "Moderate Volume":               "#185FA5",
  "Moderate Volume / Long Runs":   "#185FA5",
  "Moderate Volume / Fast Weeks":  "#0F6E56",
  "Moderate Volume / Frequent":    "#185FA5",
  "Steady Volume":                 "#3C3489",
  "Steady Volume / Long Runs":     "#3C3489",
  "Steady Volume / Fast Weeks":    "#0F6E56",
  "Steady Volume / Consistent":    "#185FA5",
  "Steady Volume / Frequent":      "#3C3489",
  "High Volume":                   "#854F0B",
  "High Volume / Long Runs":       "#854F0B",
  "High Volume / Fast Weeks":      "#A32D2D",
  "High Volume / Frequent":        "#854F0B",
  "Peak Volume":                   "#7B2D00",
  "Peak Volume / Fast Weeks":      "#7B0000",
  "Peak Volume / Long Runs":       "#7B2D00",
};

export function phaseColor(phaseName) {
  return PHASE_COLORS[phaseName] ?? "#D1D5DB";
}

export function phaseTextColor(phaseName) {
  return PHASE_TEXT_COLORS[phaseName] ?? "#374151";
}

export function inactiveColor() { return "#F87171"; }
export function inactiveTextColor() { return "#7F1D1D"; }
