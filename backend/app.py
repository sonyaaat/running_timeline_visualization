import os
import sys
import threading
from flask import Flask, jsonify, send_from_directory

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.pipeline import run_pipeline

app = Flask(
    __name__,
    static_folder="../frontend",
    static_url_path=""
)

# Track pipeline status
pipeline_status = {
    "running": False,
    "done": False,
    "error": None,
    "message": ""
}


@app.route("/")
def index():
    return send_from_directory("../frontend", "index.html")


@app.route("/api/status")
def status():
    """Frontend polls this to check if pipeline is running."""
    return jsonify(pipeline_status)


@app.route("/api/run-pipeline", methods=["POST"])
def trigger_pipeline():
    """
    Triggers the full pipeline in a background thread.
    Returns immediately with {"started": true}.
    Frontend polls /api/status to track progress.
    """
    global pipeline_status

    if pipeline_status["running"]:
        return jsonify({"started": False, "reason": "Already running"})

    pipeline_status = {
        "running": True,
        "done": False,
        "error": None,
        "message": "Fetching activities from Strava..."
    }

    def run():
        global pipeline_status
        try:
            result = run_pipeline(force_refresh=False)
            pipeline_status = {
                "running": False,
                "done": True,
                "error": None,
                "message": f"Done. {result['total_weeks']} weeks, "
                           f"{len(result['phases'])} phases detected."
            }
            print("[app] Pipeline completed successfully")
        except Exception as e:
            pipeline_status = {
                "running": False,
                "done": False,
                "error": str(e),
                "message": f"Error: {str(e)}"
            }
            print(f"[app] Pipeline error: {e}")

    thread = threading.Thread(target=run, daemon=True)
    thread.start()

    return jsonify({"started": True})


@app.route("/api/activities/<string:activity_id>/streams")
def get_streams(activity_id):
    """Fetch HR + pace streams for a single activity from Strava API."""
    import json, requests
    strava_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "strava.json")
    try:
        with open(strava_path) as f:
            creds = json.load(f)
    except FileNotFoundError:
        return jsonify({"error": "strava.json not found"}), 404

    # Refresh access token
    token_resp = requests.post("https://www.strava.com/oauth/token", data={
        "client_id":     creds["client_id"],
        "client_secret": creds["client_secret"],
        "refresh_token": creds["refresh_token"],
        "grant_type":    "refresh_token"
    })
    if not token_resp.ok:
        return jsonify({"error": "token refresh failed"}), 500
    access_token = token_resp.json()["access_token"]

    # Fetch streams
    streams_resp = requests.get(
        f"https://www.strava.com/api/v3/activities/{activity_id}/streams",
        headers={"Authorization": f"Bearer {access_token}"},
        params={"keys": "time,heartrate,velocity_smooth", "key_by_type": "true"}
    )
    if not streams_resp.ok:
        return jsonify({"error": "streams fetch failed"}), 500

    data = streams_resp.json()
    time_series = data.get("time", {}).get("data", [])
    hr_series   = data.get("heartrate", {}).get("data", [])
    vel_series  = data.get("velocity_smooth", {}).get("data", [])

    result = []
    for i, t in enumerate(time_series):
        result.append({
            "t":   t,
            "hr":  hr_series[i]  if i < len(hr_series)  else None,
            "vel": vel_series[i] if i < len(vel_series) else None,
        })
    return jsonify(result)


@app.route("/api/activities/<string:activity_id>/laps")
def get_laps(activity_id):
    """Fetch per-km splits (splits_metric) for a single activity from Strava API."""
    import json, requests
    strava_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "strava.json")
    try:
        with open(strava_path) as f:
            creds = json.load(f)
    except FileNotFoundError:
        return jsonify({"error": "strava.json not found"}), 404

    token_resp = requests.post("https://www.strava.com/oauth/token", data={
        "client_id":     creds["client_id"],
        "client_secret": creds["client_secret"],
        "refresh_token": creds["refresh_token"],
        "grant_type":    "refresh_token"
    })
    if not token_resp.ok:
        return jsonify({"error": "token refresh failed"}), 500
    access_token = token_resp.json()["access_token"]

    act_resp = requests.get(
        f"https://www.strava.com/api/v3/activities/{activity_id}",
        headers={"Authorization": f"Bearer {access_token}"}
    )
    if not act_resp.ok:
        return jsonify({"error": "activity fetch failed"}), 500

    splits = act_resp.json().get("splits_metric", [])
    result = []
    for i, s in enumerate(splits):
        speed = s.get("average_speed", 0)
        result.append({
            "index":    i + 1,
            "distance": s.get("distance", 0),
            "pace":     (1000 / speed / 60) if speed > 0 else None,
            "hr":       s.get("average_heartrate"),
            "elev":     s.get("elevation_difference"),
        })
    return jsonify(result)


@app.route("/api/activities")
def get_activities():
    """Serve raw activities for week detail view."""
    import json
    data_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "raw_activities.json")
    try:
        with open(data_path) as f:
            return jsonify(json.load(f))
    except FileNotFoundError:
        return jsonify([])


if __name__ == "__main__":
    print("[app] Starting Running Phase Explorer server...")
    print("[app] Open http://localhost:5000")
    app.run(debug=False, port=5000)
