from datetime import datetime

def log(message: str):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")

def log_section(title: str):
    print(f"\n{'═' * 50}")
    print(f"  {title}")
    print(f"{'═' * 50}")

def clean_nan(obj):
    """Recursively replace float NaN with None for JSON serialization."""
    import math
    import numpy as np
    if isinstance(obj, float) and math.isnan(obj):
        return None
    if isinstance(obj, np.bool_):
        return bool(obj)
    if isinstance(obj, dict):
        return {k: clean_nan(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [clean_nan(i) for i in obj]
    return obj
