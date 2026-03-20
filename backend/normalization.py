import numpy as np
import pandas as pd
from backend.utils import log

FEATURES_BASE    = ["km_total", "run_count", "avg_pace", "avg_run_km", "km_4w_slope"]
FEATURES_WITH_HR = FEATURES_BASE + ["efficiency"]

def robust_scale(X: np.ndarray) -> np.ndarray:
    X_scaled = np.zeros_like(X, dtype=float)
    for i in range(X.shape[1]):
        col = X[:, i]
        median = np.median(col)
        q75 = np.percentile(col, 75)
        q25 = np.percentile(col, 25)
        iqr = q75 - q25
        if iqr < 1e-8:
            X_scaled[:, i] = 0.0
            log(f"[normalization] Column {i} has near-zero IQR → zeroed out")
        else:
            X_scaled[:, i] = (col - median) / iqr
    return X_scaled

def prepare_features(weekly_segment: pd.DataFrame, has_efficiency: bool) -> np.ndarray:
    features = FEATURES_WITH_HR if has_efficiency else FEATURES_BASE
    X = weekly_segment[features].fillna(0).to_numpy()
    X_scaled = robust_scale(X)
    log(f"[normalization] Prepared {X.shape[0]}x{X.shape[1]} feature matrix (efficiency: {has_efficiency})")
    return X_scaled

if __name__ == "__main__":
    fake = pd.DataFrame({
        "km_total": [5,10,30,35,8,6],
        "run_count": [1,2,4,4,1,1],
        "avg_pace": [7.0,6.5,5.8,5.9,6.8,7.1],
        "long_run_ratio": [1.0,1.2,2.5,2.3,1.1,1.0]
    })
    print("Raw values:")
    print(fake)
    X_scaled = prepare_features(fake, has_efficiency=False)
    print("\nScaled values:")
    print(np.round(X_scaled, 3))
