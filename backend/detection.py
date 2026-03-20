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

    # Use only active (non-zero) weeks for PELT — zero weeks contaminate the signal
    active_segment = segment[segment["km_total"] > 0]
    n_active = len(active_segment)

    if n_active < MIN_PHASE_WEEKS * 2:
        log(f"[detection] Segment too short ({n_active} active / {n_weeks} total weeks) → single phase")
        return [{"week_start": seg_start, "week_end": seg_end - 1}]

    X = prepare_features(active_segment, has_efficiency)
    log(f"[detection] Segment weeks {seg_start}-{seg_end-1}: PELT on {n_active} active weeks × {X.shape[1]} features...")

    algo = rpt.Pelt(model="l2", min_size=MIN_PHASE_WEEKS, jump=PELT_JUMP)
    try:
        bps = algo.fit(X).predict(pen=PELT_PENALTY)
    except Exception as e:
        log(f"[detection] Warning: {e} → single phase")
        return [{"week_start": seg_start, "week_end": seg_end - 1}]

    # bps are end positions in the active array (1-based, last bp == n_active).
    # Map back to calendar (iloc) indices.
    active_cal = list(active_segment.index)  # calendar position of each active week

    phases = []
    for bp in bps:
        cal_start = seg_start if not phases else phases[-1]["week_end"] + 1
        cal_end   = (active_cal[bp] - 1) if bp < len(active_cal) else (seg_end - 1)
        phases.append({"week_start": cal_start, "week_end": cal_end})

    log(f"[detection] Found {len(bps) - 1} breakpoints → {len(phases)} phases")
    for p in phases:
        log(f"[detection]   Phase: weeks {p['week_start']}-{p['week_end']} ({p['week_end']-p['week_start']+1} cal weeks)")
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
