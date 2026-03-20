import pandas as pd
from backend.utils import log
from backend.gaps import find_inactive_gaps, gaps_to_week_indices

def split_into_segments(weekly: pd.DataFrame, activities: list[dict]) -> tuple[list[dict], list[tuple[int, int]]]:
    n_weeks = len(weekly)
    log(f"[segments] Splitting {n_weeks} weeks into segments...")
    gaps = find_inactive_gaps(activities)
    week_gaps = gaps_to_week_indices(gaps, weekly)
    cut_points = [0]
    inactive_phases = []
    for gap in week_gaps:
        # Неактивна фаза: тижні gap['week_start']+1 до gap['week_end'] включно
        cut_points.append(gap["week_start"] + 1)
        cut_points.append(gap["week_end"] + 1)
        inactive_phases.append({
            "type": "Inactive",
            "name": "Inactive",
            "week_start": gap["week_start"] + 1,
            "week_end": gap["week_end"],
            "days": gap["days"]
        })
        log(f"[segments] Inactive: weeks {gap['week_start']+1}-{gap['week_end']} ({gap['days']} days)")
    cut_points.append(n_weeks)
    cut_points = sorted(set(cut_points))
    segments = []
    seg_num = 1
    for i in range(len(cut_points) - 1):
        start, end = cut_points[i], cut_points[i+1] - 1
        if end - start + 1 >= 2:
            segments.append((start, end))
            log(f"[segments] Segment {seg_num}: weeks {start}-{end} ({end-start+1} weeks)")
            seg_num += 1
    log(f"[segments] Found {len(inactive_phases)} inactive gaps → {len(segments)} active segments")
    return inactive_phases, segments

if __name__ == "__main__":
    import json
    import os
    raw_path = os.path.join(os.path.dirname(__file__), "..", "data", "raw_activities.json")
    weekly_path = os.path.join(os.path.dirname(__file__), "..", "data", "weekly_features.csv")
    with open(raw_path, encoding="utf8") as f:
        activities = json.load(f)
    weekly = pd.read_csv(weekly_path)
    inactive_phases, segments = split_into_segments(weekly, activities)
    print("\nActive segments:")
    for i, (start, end) in enumerate(segments, 1):
        print(f"  Segment {i}: weeks {start}-{end} ({end-start+1} weeks)")
    print("\nInactive phases:")
    for phase in inactive_phases:
        print(f"  Inactive: weeks {phase['week_start']}-{phase['week_end']} ({phase['days']} days)")
    total = sum(end-start+1 for start, end in segments) + sum(phase['week_end']-phase['week_start']+1 for phase in inactive_phases)
    n_weeks = len(weekly)
    print(f"[segments] ✓ Total accounted: {total}/{n_weeks} weeks")
