import os
import sys
import json
import uuid
import threading
import tempfile
import requests

from flask import Flask, jsonify, send_from_directory, redirect, request, session

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.pipeline import run_pipeline

app = Flask(
    __name__,
    static_folder="../frontend",
    static_url_path=""
)

app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-change-in-prod")

STRAVA_CLIENT_ID     = os.environ.get("STRAVA_CLIENT_ID")
STRAVA_CLIENT_SECRET = os.environ.get("STRAVA_CLIENT_SECRET")
STRAVA_REDIRECT_URI  = os.environ.get("STRAVA_REDIRECT_URI", "http://localhost:5000/auth/callback")
# Temporary: hardcoded refresh token from env (bypasses real OAuth login)
STRAVA_REFRESH_TOKEN = os.environ.get("STRAVA_REFRESH_TOKEN")

# Per-user pipeline status keyed by session_id
_user_status = {}
_status_lock = threading.Lock()

SESSIONS_DIR = os.path.join(tempfile.gettempdir(), "rpe_sessions")
os.makedirs(SESSIONS_DIR, exist_ok=True)


# ─── helpers ──────────────────────────────────────────────────────────────────

def _session_id():
    if "sid" not in session:
        session["sid"] = str(uuid.uuid4())
    return session["sid"]


def _user_dir():
    d = os.path.join(SESSIONS_DIR, _session_id())
    os.makedirs(d, exist_ok=True)
    return d


def _refresh_access_token():
    """Exchange refresh_token for a fresh access_token. Updates session."""
    resp = requests.post("https://www.strava.com/oauth/token", data={
        "client_id":     STRAVA_CLIENT_ID,
        "client_secret": STRAVA_CLIENT_SECRET,
        "refresh_token": session["refresh_token"],
        "grant_type":    "refresh_token",
    })
    if not resp.ok:
        return None
    data = resp.json()
    session["refresh_token"] = data.get("refresh_token", session["refresh_token"])
    return data.get("access_token")


def _fetch_all_activities(access_token):
    """Fetch all run-type activities via Strava REST API."""
    RUN_TYPES = {"Run", "TrailRun", "VirtualRun", "Treadmill"}
    activities = []
    page = 1
    while True:
        resp = requests.get(
            "https://www.strava.com/api/v3/athlete/activities",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"per_page": 200, "page": page},
        )
        if not resp.ok:
            break
        batch = resp.json()
        if not batch:
            break
        for a in batch:
            if a.get("type") not in RUN_TYPES:
                continue
            activities.append({
                "id":                   a.get("id"),
                "name":                 a.get("name"),
                "start_date":           a.get("start_date"),
                "distance":             a.get("distance"),
                "moving_time":          a.get("moving_time"),
                "average_speed":        a.get("average_speed"),
                "average_heartrate":    a.get("average_heartrate"),
                "total_elevation_gain": a.get("total_elevation_gain"),
                "type":                 a.get("type"),
            })
        page += 1
    return activities


def _is_authenticated():
    return "refresh_token" in session


# ─── auth routes ──────────────────────────────────────────────────────────────

@app.route("/login")
def login_page():
    return send_from_directory("../frontend", "login.html")


@app.route("/auth/strava")
def auth_strava():
    # TEMPORARY: skip real OAuth, use refresh token from env directly
    session["refresh_token"] = STRAVA_REFRESH_TOKEN
    session["athlete_name"]  = "Athlete"
    _session_id()  # ensure sid is set
    return redirect("/")

    # --- Real Strava OAuth (commented out temporarily) ---
    # url = (
    #     "https://www.strava.com/oauth/authorize"
    #     f"?client_id={STRAVA_CLIENT_ID}"
    #     f"&redirect_uri={STRAVA_REDIRECT_URI}"
    #     f"&response_type=code"
    #     f"&approval_prompt=auto"
    #     f"&scope=activity:read_all"
    # )
    # return redirect(url)


# --- Real OAuth callback (commented out temporarily) ---
# @app.route("/auth/callback")
# def auth_callback():
#     if request.args.get("error"):
#         return redirect("/login?error=access_denied")
#
#     code = request.args.get("code")
#     if not code:
#         return redirect("/login?error=no_code")
#
#     resp = requests.post("https://www.strava.com/oauth/token", data={
#         "client_id":     STRAVA_CLIENT_ID,
#         "client_secret": STRAVA_CLIENT_SECRET,
#         "code":          code,
#         "grant_type":    "authorization_code",
#     })
#     if not resp.ok:
#         return redirect("/login?error=token_exchange_failed")
#
#     data = resp.json()
#     session["refresh_token"] = data["refresh_token"]
#     session["athlete_name"]  = data.get("athlete", {}).get("firstname", "Athlete")
#     _session_id()  # ensure sid is set
#
#     return redirect("/")


@app.route("/auth/logout")
def auth_logout():
    session.clear()
    return redirect("/login")


# ─── main app ─────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    if not _is_authenticated():
        return redirect("/login")
    return send_from_directory("../frontend", "index.html")


@app.route("/api/me")
def api_me():
    if not _is_authenticated():
        return jsonify({"authenticated": False}), 401
    return jsonify({
        "authenticated": True,
        "name": session.get("athlete_name", "Athlete"),
    })


@app.route("/api/status")
def api_status():
    if not _is_authenticated():
        return jsonify({"error": "not authenticated"}), 401
    sid = _session_id()
    with _status_lock:
        status = _user_status.get(sid, {
            "running": False, "done": False, "error": None, "message": ""
        })
    return jsonify(status)


@app.route("/api/run-pipeline", methods=["POST"])
def trigger_pipeline():
    if not _is_authenticated():
        return jsonify({"started": False, "reason": "Not authenticated"}), 401

    sid = _session_id()

    with _status_lock:
        current = _user_status.get(sid, {})
        if current.get("running"):
            return jsonify({"started": False, "reason": "Already running"})
        _user_status[sid] = {
            "running": True, "done": False, "error": None,
            "message": "Fetching activities from Strava..."
        }

    user_dir = _user_dir()
    # Capture session values now (thread can't access Flask session)
    refresh_token = session["refresh_token"]

    def run():
        with _status_lock:
            _user_status[sid]["message"] = "Fetching activities from Strava..."

        try:
            # 1. Refresh token
            token_resp = requests.post("https://www.strava.com/oauth/token", data={
                "client_id":     STRAVA_CLIENT_ID,
                "client_secret": STRAVA_CLIENT_SECRET,
                "refresh_token": refresh_token,
                "grant_type":    "refresh_token",
            })
            if not token_resp.ok:
                raise RuntimeError(f"Failed to refresh Strava token: {token_resp.status_code} {token_resp.text}")
            access_token = token_resp.json()["access_token"]

            # 2. Fetch activities
            activities = _fetch_all_activities(access_token)
            if not activities:
                raise RuntimeError("No run activities found on your Strava account")

            with _status_lock:
                _user_status[sid]["message"] = f"Fetched {len(activities)} runs. Analyzing..."

            # 3. Run pipeline
            result = run_pipeline(activities=activities, data_dir=user_dir)

            with _status_lock:
                _user_status[sid] = {
                    "running": False,
                    "done":    True,
                    "error":   None,
                    "message": f"Done. {result['total_weeks']} weeks, {len(result['phases'])} phases detected.",
                }
            print(f"[app] Pipeline done for session {sid[:8]}")

        except Exception as e:
            with _status_lock:
                _user_status[sid] = {
                    "running": False,
                    "done":    False,
                    "error":   str(e),
                    "message": f"Error: {e}",
                }
            print(f"[app] Pipeline error for session {sid[:8]}: {e}")

    threading.Thread(target=run, daemon=True).start()
    return jsonify({"started": True})


@app.route("/api/data")
def api_data():
    """Serve phases + weekly + breakpoints for the current user."""
    if not _is_authenticated():
        return jsonify({"error": "not authenticated"}), 401
    path = os.path.join(_user_dir(), "phases.json")
    if not os.path.exists(path):
        return jsonify({"error": "no data yet"}), 404
    with open(path, encoding="utf8") as f:
        return jsonify(json.load(f))


@app.route("/api/activities")
def get_activities():
    """Serve raw activities for the current user."""
    if not _is_authenticated():
        return jsonify({"error": "not authenticated"}), 401
    path = os.path.join(_user_dir(), "raw_activities.json")
    if not os.path.exists(path):
        return jsonify([])
    with open(path, encoding="utf8") as f:
        return jsonify(json.load(f))


@app.route("/api/activities/<string:activity_id>/streams")
def get_streams(activity_id):
    if not _is_authenticated():
        return jsonify({"error": "not authenticated"}), 401

    access_token = _refresh_access_token()
    if not access_token:
        return jsonify({"error": "token refresh failed"}), 500

    resp = requests.get(
        f"https://www.strava.com/api/v3/activities/{activity_id}/streams",
        headers={"Authorization": f"Bearer {access_token}"},
        params={"keys": "time,heartrate,velocity_smooth", "key_by_type": "true"},
    )
    if not resp.ok:
        return jsonify({"error": "streams fetch failed"}), 500

    data = resp.json()
    time_s = data.get("time",             {}).get("data", [])
    hr_s   = data.get("heartrate",        {}).get("data", [])
    vel_s  = data.get("velocity_smooth",  {}).get("data", [])

    return jsonify([
        {"t": t, "hr": hr_s[i] if i < len(hr_s) else None,
                 "vel": vel_s[i] if i < len(vel_s) else None}
        for i, t in enumerate(time_s)
    ])


@app.route("/api/activities/<string:activity_id>/laps")
def get_laps(activity_id):
    if not _is_authenticated():
        return jsonify({"error": "not authenticated"}), 401

    access_token = _refresh_access_token()
    if not access_token:
        return jsonify({"error": "token refresh failed"}), 500

    resp = requests.get(
        f"https://www.strava.com/api/v3/activities/{activity_id}",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    if not resp.ok:
        return jsonify({"error": "activity fetch failed"}), 500

    result = []
    for i, s in enumerate(resp.json().get("splits_metric", [])):
        speed = s.get("average_speed", 0)
        result.append({
            "index":    i + 1,
            "distance": s.get("distance", 0),
            "pace":     (1000 / speed / 60) if speed > 0 else None,
            "hr":       s.get("average_heartrate"),
            "elev":     s.get("elevation_difference"),
        })
    return jsonify(result)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8080)
    args = parser.parse_args()
    print(f"[app] Starting Running Phase Explorer server...")
    print(f"[app] Open http://localhost:{args.port}")
    app.run(debug=False, port=args.port)
