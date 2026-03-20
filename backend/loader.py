import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import json
from backend.utils import log

def validate_activity(a: dict) -> bool:
    """
    Returns True if activity has all required non-None fields for pipeline.
    Required: start_date, distance (> 0), average_speed (> 0)
    Optional: average_heartrate, total_elevation_gain
    """
    if not a.get("start_date"):
        return False
    if not (a.get("distance") and a["distance"] > 0):
        return False
    if not (a.get("average_speed") and a["average_speed"] > 0):
        return False
    return True


def load_activities(raw_path: str = None) -> list[dict]:
    """
    Loads activities from data/raw_activities.json created by strava_activities.py.
    If file does not exist, raises FileNotFoundError with a helpful message.
    """
    if raw_path is None:
        raw_path = os.path.join(os.path.dirname(__file__), "..", "data", "raw_activities.json")
    if not os.path.exists(raw_path):
        raise FileNotFoundError(
            f"Raw activities not found at {raw_path}. "
            f"Please run strava_activities.py first to fetch and save your Strava data."
        )
    with open(raw_path, encoding="utf8") as f:
        data = json.load(f)
    # Defensive: filter only type == "Run"
    runs = [a for a in data if a.get("type") == "Run"]
    cleaned = []
    skipped = 0
    for a in runs:
        if validate_activity(a):
            cleaned.append(a)
        else:
            log(f"[loader] Warning: skipped activity with missing fields: {a.get('start_date', 'N/A')}")
            skipped += 1
    n = len(cleaned)
    log(f"[loader] Loaded {n} Run activities from {raw_path}")
    if n:
        dates = [a["start_date"][:10] for a in cleaned]
        log(f"[loader] Date range: {min(dates)} → {max(dates)}")
        n_hr = sum(1 for a in cleaned if a.get("average_heartrate") is not None)
        n_elev = sum(1 for a in cleaned if a.get("total_elevation_gain") is not None)
        log(f"[loader] Activities with heartrate: {n_hr}/{n} ({n_hr/n*100:.1f}%)")
        log(f"[loader] Activities with elevation: {n_elev}/{n} ({n_elev/n*100:.1f}%)")
    return cleaned

def _format_activity(a: dict) -> str:
    # Example: "  2021-03-15 | 8.34 km | pace 6:12 | HR: 148 | elev: 42m"
    date = a["start_date"][:10]
    km = a["distance"] / 1000 if a.get("distance") else 0
    pace = (1000 / a["average_speed"]) / 60 if a.get("average_speed") else 0
    pace_min = int(pace)
    pace_sec = int(round((pace - pace_min) * 60))
    hr = f"{int(a['average_heartrate'])}" if a.get("average_heartrate") is not None else "--"
    elev = f"{int(a['total_elevation_gain'])}m" if a.get("total_elevation_gain") is not None else "--"
    return f"  {date} | {km:.2f} km | pace {pace_min}:{pace_sec:02d} | HR: {hr} | elev: {elev}"

if __name__ == "__main__":
    try:
        acts = load_activities()
    except FileNotFoundError as e:
        log(str(e))
        exit(1)
    if acts:
        for a in acts[:3]:
            print(_format_activity(a))
        if len(acts) > 6:
            print("  ...")
        for a in acts[-3:]:
            print(_format_activity(a))
    log("[loader] ✓ Loader ready — activities_cache.json is valid")
