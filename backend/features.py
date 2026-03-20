import pandas as pd
import numpy as np
from backend.config import HR_MIN_COVERAGE
from backend.utils import log

def build_weekly_features(activities: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame(activities)
    df["start_date"] = pd.to_datetime(df["start_date"]).dt.tz_localize(None)
    df["week"] = df["start_date"].dt.to_period("W")
    df["km"] = df["distance"] / 1000
    df["pace"] = 1000 / df["average_speed"] / 60
    df["speed_ms"] = df["average_speed"]

    # Weekly aggregation
    weekly = df.groupby("week").agg(
        km_total=("km", "sum"),
        run_count=("km", "count"),
        avg_pace=("pace", "mean"),
        max_run_km=("km", "max")
    )
    weekly["avg_run_km"] = weekly["km_total"] / weekly["run_count"]
    weekly["long_run_ratio"] = weekly["max_run_km"] / weekly["avg_run_km"]
    weekly.loc[weekly["run_count"] == 0, "long_run_ratio"] = 1.0
    weekly["long_run_ratio"] = weekly["long_run_ratio"].fillna(1.0)

    # Efficiency calculation
    hr_mask = df["average_heartrate"].notna()
    hr_coverage = hr_mask.sum() / len(df) if len(df) else 0
    if hr_coverage >= HR_MIN_COVERAGE:
        hr_weekly = df[hr_mask].groupby("week").agg(
            avg_speed_ms=("speed_ms", "mean"),
            avg_heartrate=("average_heartrate", "mean")
        )
        hr_weekly["efficiency"] = hr_weekly["avg_speed_ms"] / hr_weekly["avg_heartrate"]
        weekly = weekly.join(hr_weekly["efficiency"], how="left")
        log(f"[features] HR coverage: {hr_coverage*100:.1f}% of runs have heartrate → efficiency enabled")
    else:
        weekly["efficiency"] = np.nan
        log(f"[features] HR coverage: {hr_coverage*100:.1f}% of runs have heartrate → efficiency disabled")

    weekly = weekly.reset_index()
    log(f"[features] Weeks with data: {len(weekly)}")
    if len(weekly):
        log(f"[features] Date range: {weekly['week'].min()} to {weekly['week'].max()}")
    return weekly

def _km_rolling_slope(km_values: np.ndarray, window: int = 4) -> np.ndarray:
    """Linear slope of km_total over the last `window` active weeks, per calendar week."""
    result = np.full(len(km_values), 0.0)
    active_idx = np.where(km_values > 0)[0]
    for j, cal_i in enumerate(active_idx):
        idxs = active_idx[max(0, j - window + 1): j + 1]
        if len(idxs) < 2:
            result[cal_i] = 0.0
            continue
        y = km_values[idxs].astype(float)
        x = np.arange(len(idxs), dtype=float)
        slope, _ = np.polyfit(x, y, 1)
        result[cal_i] = float(slope)
    return result


def fill_calendar(weekly: pd.DataFrame) -> pd.DataFrame:
    all_weeks = pd.period_range(weekly["week"].min(), weekly["week"].max(), freq="W")
    calendar = pd.DataFrame({"week": all_weeks})
    merged = calendar.merge(weekly, on="week", how="left")
    # Fill missing with 0 for km_total, run_count
    merged["km_total"] = merged["km_total"].fillna(0)
    merged["run_count"] = merged["run_count"].fillna(0)
    # Forward-fill for avg_pace, long_run_ratio, avg_run_km, efficiency
    for col in ["avg_pace", "long_run_ratio", "avg_run_km", "efficiency"]:
        merged[col] = merged[col].ffill()
    merged["long_run_ratio"] = merged["long_run_ratio"].fillna(1.0)
    merged["km_4w_slope"] = _km_rolling_slope(merged["km_total"].values)
    n_empty = (merged["run_count"] == 0).sum()
    n_active = len(merged) - n_empty
    log(f"[features] Calendar filled: {len(merged)} total weeks ({n_active} active, {n_empty} empty)")
    return merged

if __name__ == "__main__":
    import json
    import os
    raw_path = os.path.join(os.path.dirname(__file__), "..", "data", "raw_activities.json")
    out_path = os.path.join(os.path.dirname(__file__), "..", "data", "weekly_features.csv")
    with open(raw_path, encoding="utf8") as f:
        activities = json.load(f)
    weekly = build_weekly_features(activities)
    calendar = fill_calendar(weekly)
    print(calendar[["week", "km_total", "run_count", "avg_pace", "long_run_ratio", "efficiency"]].head())
    calendar.to_csv(out_path, index=False)
