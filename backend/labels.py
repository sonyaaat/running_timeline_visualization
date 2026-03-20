import pandas as pd
from backend.config import PHASE_COLORS
from backend.utils import log

def volume_label(km_ratio: float) -> str:
    if km_ratio < 0.40:
        return "Low Volume"
    if km_ratio < 0.75:
        return "Moderate Volume"
    if km_ratio < 1.35:
        return "Steady Volume"
    if km_ratio < 1.80:
        return "High Volume"
    return "Peak Volume"

def character_label(runs_ratio: float, long_run_ratio: float, pace_ratio: float) -> str:
    if runs_ratio < 0.45:
        return "Sparse"
    if long_run_ratio >= 2.0 and runs_ratio >= 0.8:
        return "Long Runs"
    if pace_ratio < 0.90:
        return "Fast Weeks"
    if runs_ratio >= 1.30:
        return "Frequent"
    if long_run_ratio < 1.25 and runs_ratio >= 0.75:
        return "Consistent"
    return "Moderate"

def label_phase(phase_data: pd.DataFrame, all_active_weekly: pd.DataFrame) -> str:
    km = phase_data["km_total"].mean()
    runs = phase_data["run_count"].mean()
    pace = phase_data["avg_pace"].mean()
    long_run = phase_data["long_run_ratio"].mean()
    active = all_active_weekly[all_active_weekly["km_total"] > 0]
    med_km = active["km_total"].median()
    med_runs = active["run_count"].median()
    med_pace = active["avg_pace"].median()
    km_ratio = km / med_km if med_km else 0
    runs_ratio = runs / med_runs if med_runs else 0
    pace_ratio = pace / med_pace if med_pace else 0
    vol = volume_label(km_ratio)
    char = character_label(runs_ratio, long_run, pace_ratio)
    if char == "Moderate":
        return vol
    if vol == "Low Volume" and char == "Sparse":
        return "Sparse"
    return f"{vol} / {char}"

def get_color(name: str) -> str:
    return PHASE_COLORS.get(name, "#D1D5DB")

def compute_stats(phase_data: pd.DataFrame) -> dict:
    d = {
        "km_per_week": round(phase_data["km_total"].mean(), 2),
        "runs_per_week": round(phase_data["run_count"].mean(), 2),
        "avg_pace": round(phase_data["avg_pace"].mean(), 2),
        "long_run_ratio": round(phase_data["long_run_ratio"].mean(), 2),
        "efficiency": None
    }
    if "efficiency" in phase_data and not phase_data["efficiency"].isna().all():
        d["efficiency"] = round(phase_data["efficiency"].mean(), 2)
    return d

if __name__ == "__main__":
    test_cases = [
        (0.30, 0.40, 1.1, 1.05),  # Sparse
        (1.50, 1.10, 2.4, 0.98),  # High Volume / Long Runs
        (0.80, 1.35, 1.1, 1.01),  # Steady Volume / Frequent
        (1.10, 0.90, 1.0, 0.88),  # Steady Volume / Fast Weeks
        (0.60, 0.80, 1.3, 1.00),  # Moderate Volume / Long Runs
        (1.60, 0.75, 1.1, 1.05),  # High Volume
        (0.50, 0.80, 1.1, 1.05),  # Moderate Volume
        (1.10, 0.80, 1.0, 1.05),  # Steady Volume
    ]
    print("km_ratio, runs_ratio, lr, pace_ratio → label")
    for kmr, rr, lr, pr in test_cases:
        label = label_phase(
            pd.DataFrame({
                "km_total": [kmr],
                "run_count": [rr],
                "avg_pace": [pr],
                "long_run_ratio": [lr]
            }),
            pd.DataFrame({
                "km_total": [1.0],
                "run_count": [1.0],
                "avg_pace": [1.0],
                "long_run_ratio": [1.0]
            })
        )
        print(f"km_ratio={kmr:.2f}, runs_ratio={rr:.2f}, lr={lr:.2f}, pace={pr:.2f} → {label}")
