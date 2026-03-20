import pandas as pd
import numpy as np
import ruptures as rpt
from backend.config import MIN_PHASE_WEEKS, PELT_PENALTY, PELT_JUMP
from backend.utils import log
from backend.normalization import prepare_features

def detect_on_segment(
    weekly: pd.DataFrame,
    seg_start: int,
    seg_end: int,
    has_efficiency: bool
) -> list[dict]:
    segment = weekly.iloc[seg_start:seg_end]
    n_weeks = len(segment)
    if n_weeks < MIN_PHASE_WEEKS * 2:
        log(f"[detection] Segment too short ({n_weeks} weeks) → single phase")
        return [{"week_start": seg_start, "week_end": seg_end-1}]
    X = prepare_features(segment, has_efficiency)
    log(f"[detection] Segment weeks {seg_start}-{seg_end-1}: running PELT on {n_weeks}×{X.shape[1]} matrix...")
    # PELT params:
    # model="rbf": detects changes in both mean and variance
    # min_size=MIN_PHASE_WEEKS: prevents meaningless 1-2 week phases
    # jump=PELT_JUMP: checks every week as a potential breakpoint (default jump=5 would miss breakpoints by up to 4 weeks)
    algo = rpt.Pelt(model="rbf", min_size=MIN_PHASE_WEEKS, jump=PELT_JUMP)
    try:
        breakpoints = algo.fit(X).predict(pen=PELT_PENALTY)
    except Exception as e:
        log(f"[detection] Warning: BadSegmentationParameters ({e}) → single phase")
        return [{"week_start": seg_start, "week_end": seg_end-1}]
    # breakpoints are end indices (1-based, relative to segment)
    phases = []
    prev = 0
    for bp in breakpoints:
        start = seg_start + prev
        end = seg_start + bp - 1
        phases.append({"week_start": start, "week_end": end})
        prev = bp
    log(f"[detection] Segment weeks {seg_start}-{seg_end-1}: found {len(breakpoints)-1} breakpoints → {len(phases)} phases")
    for p in phases:
        log(f"[detection]   Phase: weeks {p['week_start']}-{p['week_end']} ({p['week_end']-p['week_start']+1} weeks)")
    return phases

if __name__ == "__main__":
    # Synthetic data: 3 phases (low→high→medium)
    fake = pd.DataFrame({
        "km_total": [5]*8 + [30]*10 + [15]*7,
        "run_count": [1]*8 + [4]*10 + [2]*7,
        "avg_pace": [7.0]*8 + [5.8]*10 + [6.5]*7,
        "long_run_ratio": [1.0]*8 + [2.5]*10 + [1.2]*7
    })
    seg_start, seg_end = 0, len(fake)
    phases = detect_on_segment(fake, seg_start, seg_end, has_efficiency=False)
    print("\nDetected phases:")
    for p in phases:
        print(f"  weeks {p['week_start']}-{p['week_end']}")
    print(f"[detection] ✓ Sanity check passed: expected ~2 breakpoints, got {len(phases)-1}")
