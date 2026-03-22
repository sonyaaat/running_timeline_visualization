OUTPUT_PATH = "output/phases.json"
FRONTEND_DATA_PATH = "frontend/data/phases.json"

INACTIVE_GAP_DAYS = 10      # min days between runs to mark as Inactive phase
MIN_PHASE_WEEKS   = 4       # minimum weeks for a valid phase
PELT_PENALTY      = 5      # changepoint sensitivity (higher = fewer phases)
PELT_JUMP         = 1       # must be 1 for weekly data — do not change
HR_MIN_COVERAGE   = 0.40    # min fraction of runs with HR to include efficiency
MIN_MERGE_WEEKS   = 3       # active phases shorter than this are merged into adjacent neighbors

PHASE_COLORS = {
    "Inactive":   "#B0B7C3",
    "Building":   "#4ADE80",  # green   — volume growing
    "Peak":       "#F59E0B",  # amber   — highest load
    "Base":       "#818CF8",  # indigo  — stable moderate
    "Recovery":   "#93C5FD",  # sky     — low volume, rest
    "Sharpening": "#2DD4BF",  # teal    — tapering, quality
}

print("[config] Loaded")
