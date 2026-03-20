import json
import os
from stravalib import Client

def fetch_and_cache_activities():
    with open("strava.json", encoding="utf8") as f:
        strava_data = json.load(f)
    client_id = strava_data["client_id"]
    client_secret = strava_data["client_secret"]
    refresh_token = strava_data["refresh_token"]
    activity_type = strava_data.get("activity_type")

    client = Client()
    response = client.refresh_access_token(
        client_id=client_id,
        client_secret=client_secret,
        refresh_token=refresh_token
    )
    client.access_token = response["access_token"]

    activities = list(client.get_activities())
    # Зберігаємо тільки потрібні поля для кешу згідно з вимогами
    activities_data = []
    for a in activities:
        RUN_TYPES = {"Run", "TrailRun", "VirtualRun", "Treadmill"}
        if a.type not in RUN_TYPES:
            continue
        activities_data.append({
            "start_date": a.start_date.isoformat() if hasattr(a, "start_date") and a.start_date else None,
            "distance": float(a.distance) if hasattr(a, "distance") and a.distance else None,
            "moving_time": int(a.moving_time.total_seconds()) if hasattr(a, "moving_time") and a.moving_time else None,
            "average_speed": float(a.average_speed) if hasattr(a, "average_speed") and a.average_speed else None,
            "average_heartrate": float(a.average_heartrate) if hasattr(a, "average_heartrate") and a.average_heartrate else None,
            "total_elevation_gain": float(a.total_elevation_gain) if hasattr(a, "total_elevation_gain") and a.total_elevation_gain else None,
            "type": a.type
        })
    raw_dir = os.path.join(os.path.dirname(__file__), "data")
    os.makedirs(raw_dir, exist_ok=True)
    raw_path = os.path.join(raw_dir, "raw_activities.json")
    with open(raw_path, "w", encoding="utf8") as f:
        json.dump(activities_data, f, ensure_ascii=False, indent=2)
    return activities_data


def load_activities():
    raw_dir = os.path.join(os.path.dirname(__file__), "data")
    raw_path = os.path.join(raw_dir, "raw_activities.json")
    if os.path.exists(raw_path):
        with open(raw_path, encoding="utf8") as f:
            return json.load(f)
    else:
        return fetch_and_cache_activities()

activities = load_activities()

print(f"Завантажено активностей: {len(activities)}")
if activities:
    last = activities[0]
    print("Остання активність:")
    print(f"Дата: {last.get('start_date', 'N/A')}")
    dist = last.get('distance')
    print(f"Дистанція: {dist/1000:.4f} км" if dist is not None else "Дистанція: N/A")
    moving_time = last.get('moving_time')
    print(f"Час у русі: {moving_time} сек" if moving_time is not None else "Час у русі: N/A")
    avg_speed = last.get('average_speed')
    print(f"Середня швидкість: {avg_speed} м/с" if avg_speed is not None else "Середня швидкість: N/A")
    if avg_speed:
        pace = 1000/avg_speed/60
        print(f"Темп: {pace:.2f} хв/км")
    avg_hr = last.get('average_heartrate')
    print(f"Середній пульс: {avg_hr} bpm" if avg_hr is not None else "Середній пульс: N/A")
    elev = last.get('total_elevation_gain')
    print(f"Набір висоти: {elev} м" if elev is not None else "Набір висоти: N/A")
    print(f"Тип: {last.get('type', 'N/A')}")
else:
    print("Активностей не знайдено.")
