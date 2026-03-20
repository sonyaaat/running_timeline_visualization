import json
import os
import re

def print_fail(msg):
    print(f"\033[91m✗ {msg}\033[0m")

def print_pass(msg):
    print(f"\033[92m✓ {msg}\033[0m")

def main():
    path = os.path.join(os.path.dirname(__file__), "..", "..", "output", "phases.json")
    with open(path, encoding="utf8") as f:
        data = json.load(f)
    fail_count = 0
    # 1. TOP-LEVEL KEYS
    required_keys = {"phases", "weekly", "breakpoints", "meta"}
    missing = required_keys - set(data.keys())
    if missing:
        print_fail(f"Missing keys: {sorted(missing)}")
        fail_count += 1
    else:
        print_pass("Top-level keys present")
    # 2. PHASES CHRONOLOGY
    phases = data["phases"]
    total_weeks = data.get("total_weeks", 0)
    ok = True
    for i in range(len(phases)-1):
        if phases[i]["week_end"] != phases[i+1]["week_start"]:
            print_fail(f"Gap between phases {phases[i]['id']} and {phases[i+1]['id']}")
            ok = False
    covered = set()
    for p in phases:
        covered.update(range(p["week_start"], p["week_end"]+1))
    if sorted(covered) != list(range(total_weeks)):
        print_fail("Phases do not cover all weeks 0..N-1")
        ok = False
    if ok:
        print_pass(f"Phases cover all {total_weeks} weeks with no gaps")
    else:
        fail_count += 1
    # 3. PHASE FIELDS
    hex_re = re.compile(r"^#[0-9A-Fa-f]{6}$")
    ok = True
    for p in phases:
        for k in ["id", "type", "name", "color", "week_start", "week_end", "stats"]:
            if k not in p:
                print_fail(f"Phase {p.get('id','?')} missing field: {k}")
                ok = False
        if not hex_re.match(p["color"]):
            print_fail(f"Phase {p['id']} color not valid hex: {p['color']}")
            ok = False
        weeks = p["week_end"] - p["week_start"]
        if p.get("weeks") is not None and p["weeks"] != weeks:
            print_fail(f"Phase {p['id']} weeks mismatch: {p['weeks']} vs {weeks}")
            ok = False
        if p["type"] == "Active":
            if not isinstance(p["stats"], dict):
                print_fail(f"Phase {p['id']} active stats not dict")
                ok = False
        if p["type"] == "Inactive":
            if p["stats"] is not None and p["stats"] != {"km_per_week": 0, "runs_per_week": 0, "avg_pace": None, "long_run_ratio": None, "efficiency": None}:
                print_fail(f"Phase {p['id']} inactive stats not None/zeroed")
                ok = False
    if ok:
        print_pass("All phase fields valid")
    else:
        fail_count += 1
    # 4. WEEKLY DATA
    weekly = data["weekly"]
    ok = True
    if len(weekly) != total_weeks:
        print_fail(f"Weekly data has {len(weekly)} records, expected {total_weeks}")
        ok = False
    phase_ids = {p["id"] for p in phases}
    for w in weekly:
        if w.get("phase_id") not in phase_ids:
            print_fail(f"Week {w.get('week')} has invalid phase_id {w.get('phase_id')}")
            ok = False
        if w.get("phase_id") is None:
            print_fail(f"Week {w.get('week')} has phase_id None")
            ok = False
        if w.get("km_total", 0) < 0:
            print_fail(f"Week {w.get('week')} has negative km_total")
            ok = False
        for col in ["week", "km_total", "run_count", "avg_pace", "long_run_ratio", "efficiency", "phase_id"]:
            if col not in w:
                print_fail(f"Week {w.get('week')} missing column {col}")
                ok = False
    if ok:
        print_pass(f"Weekly data: {len(weekly)} weeks, all have phase_id")
        n_eff = sum(1 for w in weekly if w.get("efficiency") is not None)
        print(f"  HR data present: {n_eff/len(weekly)*100:.1f}% of weeks have non-null efficiency")
    else:
        fail_count += 1
    # 5. BREAKPOINTS
    breakpoints = data["breakpoints"]
    ok = True
    for b in breakpoints:
        for k in ["from_id", "to_id", "week_index", "changes"]:
            if k not in b:
                print_fail(f"Breakpoint missing field: {k}")
                ok = False
        if b.get("from_id") not in phase_ids or b.get("to_id") not in phase_ids:
            print_fail(f"Breakpoint from_id/to_id not in phases: {b}")
            ok = False
        for ck in ["km_per_week", "runs_per_week", "avg_pace", "long_run_ratio"]:
            if ck not in b["changes"]:
                print_fail(f"Breakpoint {b} missing change {ck}")
                ok = False
    if ok:
        print_pass(f"{len(breakpoints)} breakpoints valid")
    else:
        fail_count += 1
    # 6. STATS SANITY
    print("\nPhase summary:")
    for p in phases:
        if p["type"] == "Active":
            s = p["stats"]
            print(f"  Phase {p['id']} | {p['name']:<25} | {p['week_end']-p['week_start']+1}w | {s['km_per_week']:.1f}km/w | {s['runs_per_week']:.1f} runs | pace {s['avg_pace'] if s['avg_pace'] is not None else '--'}")
    # 7. FINAL STATUS
    print("══════════════════════════════")
    if fail_count == 0:
        print_pass("ALL CHECKS PASSED — phases.json is ready for D3 visualization")
    else:
        print_fail(f"{fail_count} CHECKS FAILED — fix issues before proceeding to frontend")

if __name__ == "__main__":
    main()
