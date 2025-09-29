import requests

def fetch_weather(lat, lon):
    print(f"🔹 [Weather] Fetching weather for ({lat},{lon})")
    try:
        url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current_weather=true"
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        content = resp.json()
        current = content.get("current_weather", {})
        print("🔹 [Weather] Weather data fetched")
        return {
            "temperature": current.get("temperature"),
            "windspeed": current.get("windspeed"),
            "winddirection": current.get("winddirection"),
            "time": current.get("time"),
            "raw": current
        }
    except Exception as e:
        print("❌ [Weather] Error:", repr(e))
        return {}
