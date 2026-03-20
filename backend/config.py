INACTIVE_GAP_DAYS = 10      # min days between runs to mark as Inactive phase
MIN_PHASE_WEEKS   = 7       # minimum weeks for a valid phase
PELT_PENALTY      = 10      # changepoint sensitivity (higher = fewer phases)
PELT_JUMP         = 5       # must be 1 for weekly data — do not change
HR_MIN_COVERAGE   = 0.40    # min fraction of runs with HR to include efficiency

PHASE_COLORS = {
    "Inactive":                      "#D1D5DB",
    "Sparse":                        "#D1D5DB",
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
}

print("[config] Loaded")
