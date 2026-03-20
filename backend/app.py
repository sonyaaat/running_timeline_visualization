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


if __name__ == "__main__":
    print("[app] Starting Running Phase Explorer server...")
    print("[app] Open http://localhost:5000")
    app.run(debug=False, port=5000)
