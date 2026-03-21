import numpy as np
import pandas as pd
from backend.config import PHASE_COLORS
from backend.utils import log


def label_phase(phase_data: pd.DataFrame, all_active_weekly: pd.DataFrame) -> str:
    active = phase_data[phase_data["km_total"] > 0]
    if len(active) == 0:
        active = phase_data

    km   = active["km_total"].mean()
    pace = active["avg_pace"].mean()

    ref      = all_active_weekly[all_active_weekly["km_total"] > 0]
    med_km   = ref["km_total"].median()
    med_pace = ref["avg_pace"].median()

    km_ratio   = km   / med_km   if med_km   else 1.0
    pace_ratio = pace / med_pace if med_pace else 1.0

    # Compute km/week slope directly from phase weeks
    n = len(active)
    if n >= 2:
        x     = np.arange(n)
        slope = float(np.polyfit(x, active["km_total"].values, 1)[0])
    else:
        slope = 0.0

    # Peak: high volume that is no longer growing
    if km_ratio >= 1.35 and slope <= 1.0:
        return "Peak"

    # Building: volume is clearly increasing week over week
    if slope > 2.0:
        return "Building"

    # Sharpening: volume dropping AND pace improving (classic tapering)
    if slope < -1.0 and pace_ratio < 0.97:
        return "Sharpening"

    # Recovery: significantly below typical volume
    if km_ratio < 0.60:
        return "Recovery"

    # Base: stable moderate volume — most common phase
    return "Base"


def get_color(name: str) -> str:
    return PHASE_COLORS.get(name, "#D1D5DB")


def compute_stats(phase_data: pd.DataFrame) -> dict:
    active = phase_data[phase_data["km_total"] > 0]
    if len(active) == 0:
        active = phase_data

    d = {
        "km_per_week":   round(float(active["km_total"].mean()), 2),
        "runs_per_week": round(float(active["run_count"].mean()), 2),
        "avg_pace":      round(float(active["avg_pace"].mean()), 2),
        "avg_run_km":    round(float(active["avg_run_km"].mean()), 2)
                         if "avg_run_km" in active.columns and active["avg_run_km"].notna().any()
                         else None,
        "efficiency":    None,
    }
    if "efficiency" in active.columns and not active["efficiency"].isna().all():
        d["efficiency"] = round(float(active["efficiency"].mean()), 4)
    return d
