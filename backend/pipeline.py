import os
import json
import sys
import pandas as pd
from backend.utils import log, log_section, clean_nan
from backend.features import build_weekly_features, fill_calendar
from backend.gaps import find_inactive_gaps, gaps_to_week_indices
from backend.segments import split_into_segments
from backend.detection import detect_on_segment
from backend.labels import label_phase, get_color, compute_stats
from backend.config import INACTIVE_GAP_DAYS, MIN_PHASE_WEEKS, PELT_PENALTY

def build_breakpoint(prev: dict, curr: dict) -> dict:
    def pct_change(a, b, bigger=True):
        if a is None or b is None or a == 0:
            return None
        d = (b - a) / abs(a) * 100
        return round(d if bigger else -d, 1)
    return {
        "from_id": prev["id"],
        "to_id": curr["id"],
        "week_index": curr["week_start"],
        "changes": {
            "km_per_week": pct_change(prev["stats"]["km_per_week"], curr["stats"]["km_per_week"]),
            "runs_per_week": pct_change(prev["stats"]["runs_per_week"], curr["stats"]["runs_per_week"]),
            "avg_pace": pct_change(prev["stats"]["avg_pace"], curr["stats"]["avg_pace"], bigger=False),
            "long_run_ratio": pct_change(prev["stats"]["long_run_ratio"], curr["stats"]["long_run_ratio"]),
            "efficiency": pct_change(prev["stats"].get("efficiency"), curr["stats"].get("efficiency"))
        }
    }

def run_pipeline(access_token: str = None) -> dict:
    # 1. STRAVA FETCH
    log_section("STRAVA FETCH")
    raw_path = os.path.join(os.path.dirname(__file__), "..", "data", "raw_activities.json")
    if os.path.exists(raw_path):
        with open(raw_path, encoding="utf8") as f:
            activities = json.load(f)
    else:
        raise FileNotFoundError("raw_activities.json not found. Please run strava_activities.py first.")
    # 2. WEEKLY FEATURES
    log_section("WEEKLY FEATURES")
    weekly = build_weekly_features(activities)
    weekly = fill_calendar(weekly)
    has_efficiency = weekly["efficiency"].notna().sum() > len(weekly) * 0.3
    log(f"[pipeline] HR data available: {has_efficiency}")
    # 3. GAP DETECTION
    log_section("GAP DETECTION")
    inactive_phases, segments = split_into_segments(weekly, activities)
    log(f"[pipeline] {len(inactive_phases)} inactive phases, {len(segments)} active segments")
    # 4. PHASE DETECTION
    log_section("PHASE DETECTION")
    all_active = weekly[weekly["km_total"] > 0]
    active_phases = []
    phase_id = 1
    for seg_idx, (start, end) in enumerate(segments):
        seg_weekly = weekly.iloc[start:end+1]
        phases = detect_on_segment(weekly, start, end+1, has_efficiency)
        for p in phases:
            phase_data = weekly.iloc[p["week_start"]:p["week_end"]+1]
            label = label_phase(phase_data, all_active)
            color = get_color(label)
            stats = compute_stats(phase_data)
            active_phases.append({
                "id": phase_id,
                "type": "Active",
                "name": label,
                "color": color,
                "week_start": p["week_start"],
                "week_end": p["week_end"],
                "stats": stats
            })
            phase_id += 1
    # 5. ASSEMBLING RESULTS
    log_section("ASSEMBLING RESULTS")
    all_phases = []
    # Додаємо всі активні фази
    for phase in active_phases:
        all_phases.append(phase)
    # Додаємо лише ті неактивні фази, які не перекриваються з активними
    for inact in inactive_phases:
        overlap = False
        for act in active_phases:
            # Якщо є перекриття тижнів
            if not (inact["week_end"] < act["week_start"] or inact["week_start"] > act["week_end"]):
                overlap = True
                break
        if not overlap:
            all_phases.append({
                "id": phase_id,
                "type": "Inactive",
                "name": "Inactive",
                "color": get_color("Inactive"),
                "week_start": inact["week_start"],
                "week_end": inact["week_end"],
                "stats": {"km_per_week": 0, "runs_per_week": 0, "avg_pace": None, "long_run_ratio": None, "efficiency": None},
                "days": inact["days"]
            })
            phase_id += 1
    all_phases = sorted(all_phases, key=lambda p: p["week_start"])
    for idx, phase in enumerate(all_phases):
        phase["id"] = idx + 1
    # Breakpoints
    breakpoints = []
    prev = None
    for phase in all_phases:
        if phase["type"] == "Active":
            if prev is not None:
                breakpoints.append(build_breakpoint(prev, phase))
            prev = phase
    # Assign phase_id to weekly
    weekly = weekly.copy()
    weekly["phase_id"] = None
    for phase in all_phases:
        weekly.loc[(weekly.index >= phase["week_start"]) & (weekly.index <= phase["week_end"]), "phase_id"] = phase["id"]
    # Convert week to str for JSON serialization
    weekly["week"] = weekly["week"].astype(str)
    weekly = weekly.infer_objects(copy=False)
    # Output dict
    output = {
        "phases": all_phases,
        "weekly": weekly.fillna(value=pd.NA).to_dict(orient="records"),
        "breakpoints": breakpoints,
        "total_weeks": len(weekly),
        "meta": {
            "date_start": str(weekly["week"].min()),
            "date_end": str(weekly["week"].max()),
            "has_hr": has_efficiency,
            "total_runs": sum(a.get("type") == "Run" for a in activities),
            "config": {
                "inactive_gap_days": INACTIVE_GAP_DAYS,
                "min_phase_weeks": MIN_PHASE_WEEKS,
                "pelt_penalty": PELT_PENALTY
            }
        }
    }
    output = clean_nan(output)
    out_path = os.path.join(os.path.dirname(__file__), "..", "output", "phases.json")
    with open(out_path, "w", encoding="utf8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    # Final summary
    log("[pipeline] ══════════════════════════════")
    log(f"[pipeline] ✓ {len(weekly)} weeks analyzed")
    log(f"[pipeline] ✓ {len(all_phases)} phases detected:")
    for phase in all_phases:
        if phase["type"] == "Inactive":
            log(f"[pipeline]   ○ Inactive {phase['week_end']-phase['week_start']+1}w  ({phase.get('days','')} days)")
        else:
            log(f"[pipeline]   ● {phase['name']:<25} {phase['week_end']-phase['week_start']+1}w")
    log(f"[pipeline] ✓ Saved to output/phases.json")
    return output

if __name__ == "__main__":
    token = sys.argv[1] if len(sys.argv) > 1 else None
    run_pipeline(token)
