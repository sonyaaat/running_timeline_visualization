from backend.utils import log
from backend.config import INACTIVE_GAP_DAYS
from datetime import datetime
import pandas as pd
import json
import os

def find_inactive_gaps(activities: list[dict]) -> list[dict]:
    dates = [datetime.fromisoformat(a["start_date"][:10]) for a in activities if a.get("start_date")]
    dates = sorted(dates)
    gaps = []
    for prev, curr in zip(dates, dates[1:]):
        gap_days = (curr - prev).days
        if gap_days >= INACTIVE_GAP_DAYS:
            gap = {
                "date_start": prev.date().isoformat(),
                "date_end": curr.date().isoformat(),
                "days": gap_days
            }
            gaps.append(gap)
            log(f"[gaps] Inactive period: {gap['date_start']} → {gap['date_end']} ({gap_days} days)")
    log(f"[gaps] Found {len(gaps)} inactive periods (>= {INACTIVE_GAP_DAYS} days)")
    if gaps:
        longest = max(gaps, key=lambda g: g["days"])
        log(f"[gaps] Longest gap: {longest['days']} days ({longest['date_start']} → {longest['date_end']})")
    return gaps

def gaps_to_week_indices(gaps: list[dict], weekly: pd.DataFrame) -> list[dict]:
    week_starts = weekly["week"].astype(str).tolist()
    week_indices = {w: i for i, w in enumerate(week_starts)}
    result = []
    for idx, gap in enumerate(gaps, 1):
        # Find last week index before gap start
        week_start = None
        for i, w in enumerate(week_starts):
            if w >= gap["date_start"]:
                week_start = i - 1 if i > 0 else 0
                break
        if week_start is None:
            week_start = len(week_starts) - 1
        # Find first week index on or after gap end
        week_end = None
        for i, w in enumerate(week_starts):
            if w >= gap["date_end"]:
                week_end = i
                break
        if week_end is None:
            week_end = len(week_starts) - 1
        result.append({
            "week_start": week_start,
            "week_end": week_end,
            "days": gap["days"],
            "type": "Inactive"
        })
        log(f"[gaps] Gap {idx}: weeks {week_start}→{week_end} ({week_end - week_start} weeks)")
    return result

if __name__ == "__main__":
    raw_path = os.path.join(os.path.dirname(__file__), "..", "data", "raw_activities.json")
    weekly_path = os.path.join(os.path.dirname(__file__), "..", "data", "weekly_features.csv")
    with open(raw_path, encoding="utf8") as f:
        activities = json.load(f)
    weekly = pd.read_csv(weekly_path)
    gaps = find_inactive_gaps(activities)
    week_gaps = gaps_to_week_indices(gaps, weekly)
    print("\nAll gaps:")
    for gap, week_gap in zip(gaps, week_gaps):
        print(f"{gap['date_start']} → {gap['date_end']} ({gap['days']} days) | weeks {week_gap['week_start']}→{week_gap['week_end']}")
