import os
import json
import shutil
import sys
import pandas as pd
import numpy as np
from backend.utils import log, log_section, clean_nan
from backend.features import build_weekly_features, fill_calendar
from backend.gaps import find_inactive_gaps, gaps_to_week_indices
from backend.segments import split_into_segments
from backend.detection import detect_on_segment
from backend.labels import label_phase, get_color, compute_stats
from backend.config import INACTIVE_GAP_DAYS, MIN_PHASE_WEEKS, PELT_PENALTY, OUTPUT_PATH, FRONTEND_DATA_PATH, MIN_MERGE_WEEKS

def _week_to_date(week_val, start: bool = True) -> str:
    """Extract start or end date from a week Period or string like '2024-07-08/2024-07-14'."""
    parts = str(week_val).split("/")
    return parts[0] if start else (parts[1] if len(parts) > 1 else parts[0])


def _compute_trend(phase_data: pd.DataFrame) -> tuple:
    """Return (trend_label, slope) based on km/week trajectory over active weeks."""
    active = phase_data[phase_data["km_total"] > 0]
    if len(active) < 3:
        return "stable", 0.0
    y = active["km_total"].values.astype(float)
    x = np.arange(len(y), dtype=float)
    slope, _ = np.polyfit(x, y, 1)
    mean_km   = float(y.mean())
    norm      = slope / mean_km if mean_km > 0 else 0.0
    if norm > 0.05:
        return "building",  round(float(slope), 2)
    if norm < -0.05:
        return "tapering",  round(float(slope), 2)
    return "stable", round(float(slope), 2)


def _compute_narrative(changes: dict) -> str:
    """Single-word summary of what changed most at a phase transition."""
    km   = changes.get("km_per_week")   or 0
    runs = changes.get("runs_per_week") or 0
    pace = changes.get("avg_pace")      or 0
    if km   <= -30:  return "volume_drop"
    if km   >=  30:  return "volume_surge"
    if pace <= -5 and abs(km) < 20: return "fitness_gain"
    if runs <= -40:  return "frequency_drop"
    if runs >=  40:  return "frequency_surge"
    return "pattern_shift"


def _merge_short_active_phases(active_phases: list, weekly, all_active, min_weeks: int) -> list:
    """
    Merge Active phases shorter than min_weeks into adjacent phases that belong to
    the same segment (= are calendar-contiguous, no inactive gap between them).
    After merging, re-labels and re-computes stats for affected phases.
    Phase ids are NOT updated here — they are reassigned later in the assembly step.
    """
    if len(active_phases) <= 1:
        return active_phases

    phases = [dict(p) for p in active_phases]  # shallow copy — avoid mutating originals

    changed = True
    while changed:
        changed = False
        i = 0
        while i < len(phases):
            n_weeks = phases[i]["week_end"] - phases[i]["week_start"] + 1
            if n_weeks >= min_weeks:
                i += 1
                continue

            # Check contiguity with previous / next (same-segment only)
            has_prev = i > 0 and phases[i - 1]["week_end"] + 1 == phases[i]["week_start"]
            has_next = i + 1 < len(phases) and phases[i]["week_end"] + 1 == phases[i + 1]["week_start"]

            if has_prev:
                # Extend previous phase to absorb this one
                phases[i - 1] = dict(phases[i - 1])
                phases[i - 1]["week_end"] = phases[i]["week_end"]
                phases.pop(i)
                changed = True
                # Re-check previous (it may now qualify or still need merging)
                i = max(0, i - 1)
            elif has_next:
                # Extend next phase to absorb this one
                phases[i + 1] = dict(phases[i + 1])
                phases[i + 1]["week_start"] = phases[i]["week_start"]
                phases.pop(i)
                changed = True
                # i stays — next phase shifted into position i
            else:
                # Isolated short segment — cannot merge, leave as-is
                i += 1

    # Re-label and re-compute stats for every phase (merges change boundaries)
    for phase in phases:
        phase_data = weekly.iloc[phase["week_start"]:phase["week_end"] + 1]
        phase["name"] = label_phase(phase_data, all_active)
        phase["color"] = get_color(phase["name"])
        phase["stats"] = compute_stats(phase_data)

    return phases


def build_breakpoint(prev: dict, curr: dict) -> dict:
    def pct_change(a, b, bigger=True):
        if a is None or b is None or a == 0:
            return None
        d = (b - a) / abs(a) * 100
        return round(d if bigger else -d, 1)
    changes_dict = {
        "km_per_week":   pct_change(prev["stats"]["km_per_week"],   curr["stats"]["km_per_week"]),
        "runs_per_week": pct_change(prev["stats"]["runs_per_week"], curr["stats"]["runs_per_week"]),
        "avg_pace":      pct_change(prev["stats"]["avg_pace"],      curr["stats"]["avg_pace"], bigger=False),
        "avg_run_km":    pct_change(prev["stats"].get("avg_run_km"), curr["stats"].get("avg_run_km")),
        "efficiency":    pct_change(prev["stats"].get("efficiency"), curr["stats"].get("efficiency")),
    }
    return {
        "from_id":    prev["id"],
        "to_id":      curr["id"],
        "week_index": curr["week_start"],
        "date":       curr.get("date_start", ""),
        "narrative":  _compute_narrative(changes_dict),
        "changes":    changes_dict,
    }

def run_pipeline(force_refresh: bool = False) -> dict:
    """
    force_refresh=True  → delete cache and re-fetch from Strava
    force_refresh=False → use existing raw_activities.json if it exists
    """
    # 1. STRAVA FETCH
    log_section("STRAVA FETCH")
    raw_path = os.path.join(os.path.dirname(__file__), "..", "data", "raw_activities.json")
    if force_refresh and os.path.exists(raw_path):
        os.remove(raw_path)
        print("[pipeline] Cache cleared — will re-fetch from Strava")
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
    # 4b. MERGE SHORT PHASES
    log_section("MERGE SHORT PHASES")
    before = len(active_phases)
    active_phases = _merge_short_active_phases(active_phases, weekly, all_active, MIN_MERGE_WEEKS)
    log(f"[pipeline] Merged {before - len(active_phases)} short phase(s) (<{MIN_MERGE_WEEKS}w) → {len(active_phases)} active phases remain")
    # 4c. ENRICH phases with trend, dates, duration
    log_section("ENRICH PHASES")
    for phase in active_phases:
        phase_data = weekly.iloc[phase["week_start"]:phase["week_end"] + 1]
        trend, trend_slope = _compute_trend(phase_data)
        phase["trend"]          = trend
        phase["trend_slope"]    = trend_slope
        phase["date_start"]     = _week_to_date(weekly.iloc[phase["week_start"]]["week"], True)
        phase["date_end"]       = _week_to_date(weekly.iloc[phase["week_end"]]["week"],   False)
        phase["duration_weeks"] = phase["week_end"] - phase["week_start"] + 1

    # 5. ASSEMBLING RESULTS
    log_section("ASSEMBLING RESULTS")
    inactive_phase_dicts = [
        {
            "type": "Inactive",
            "name": "Inactive",
            "color": "#D1D5DB",
            "week_start": inact["week_start"],
            "week_end": inact["week_end"],
            "weeks": inact["week_end"] - inact["week_start"] + 1,
            "date_start":     _week_to_date(weekly.iloc[inact["week_start"]]["week"], True),
            "date_end":       _week_to_date(weekly.iloc[inact["week_end"]]["week"],   False),
            "duration_weeks": inact["week_end"] - inact["week_start"] + 1,
            "stats": None,
        }
        for inact in inactive_phases
    ]
    all_phases = active_phases + inactive_phase_dicts
    all_phases.sort(key=lambda p: p["week_start"])
    for i, p in enumerate(all_phases):
        p["id"] = i + 1
    # Breakpoints
    breakpoints = []
    prev = None
    for phase in all_phases:
        if phase["type"] == "Active":
            if prev is not None:
                breakpoints.append(build_breakpoint(prev, phase))
            prev = phase
    # Assign phase_id to weekly (iloc uses positional indexing — safe regardless of index type)
    weekly = weekly.copy()
    weekly["phase_id"] = None
    for p in all_phases:
        weekly.iloc[
            p["week_start"]:p["week_end"] + 1,
            weekly.columns.get_loc("phase_id")
        ] = p["id"]
    # Verification print before saving
    print("\n[pipeline] Final phase list:")
    for p in all_phases:
        marker = "●" if p["type"] == "Active" else "○"
        print(f"  {marker} {p['name']:<25} w{p['week_start']}-{p['week_end']}  id={p['id']}")
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
    root = os.path.join(os.path.dirname(__file__), "..")
    out_path = os.path.join(root, OUTPUT_PATH)
    with open(out_path, "w", encoding="utf8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    frontend_path = os.path.join(root, FRONTEND_DATA_PATH)
    os.makedirs(os.path.dirname(frontend_path), exist_ok=True)
    shutil.copy(out_path, frontend_path)
    # Also copy raw activities to frontend/data for static serving
    activities_src = os.path.join(root, "data", "raw_activities.json")
    activities_dst = os.path.join(root, "frontend", "data", "activities.json")
    if os.path.exists(activities_src):
        shutil.copy(activities_src, activities_dst)
    # Final summary
    log("[pipeline] ══════════════════════════════")
    log(f"[pipeline] ✓ {len(weekly)} weeks analyzed")
    log(f"[pipeline] ✓ {len(all_phases)} phases detected:")
    for phase in all_phases:
        if phase["type"] == "Inactive":
            log(f"[pipeline]   ○ Inactive {phase['week_end']-phase['week_start']+1}w  ({phase.get('days','')} days)")
        else:
            log(f"[pipeline]   ● {phase['name']:<25} {phase['week_end']-phase['week_start']+1}w")
    log(f"[pipeline] ✓ Saved to {OUTPUT_PATH} and copied to {FRONTEND_DATA_PATH}")
    return output

if __name__ == "__main__":
    force = "--force" in sys.argv
    run_pipeline(force_refresh=force)
