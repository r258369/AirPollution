import requests

def fetch_weather(lat, lon):
    print(f"🔹 [Weather] Fetching weather for ({lat},{lon})")
    try:
        # Request hourly humidity and surface pressure in addition to current weather
        url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current_weather=true&hourly=relativehumidity_2m,surface_pressure&timezone=UTC"
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        content = resp.json()
        current = content.get("current_weather", {})
        hourly = content.get("hourly", {})

        # Try to find humidity and pressure at the current time in hourly arrays
        humidity = None
        pressure = None
        current_time = current.get('time')
        if hourly and 'time' in hourly:
            times = hourly.get('time', [])
            try:
                idx = times.index(current_time) if current_time in times else len(times) - 1
            except Exception:
                idx = len(times) - 1 if times else None

            if idx is not None and idx >= 0:
                rh = hourly.get('relativehumidity_2m')
                sp = hourly.get('surface_pressure')
                if isinstance(rh, (list, tuple)) and idx < len(rh):
                    humidity = rh[idx]
                if isinstance(sp, (list, tuple)) and idx < len(sp):
                    pressure = sp[idx]

        print("🔹 [Weather] Weather data fetched")
        return {
            "temperature": current.get("temperature"),
            "windspeed": current.get("windspeed"),
            "winddirection": current.get("winddirection"),
            "time": current.get("time"),
            "humidity": humidity,
            "pressure": pressure,
            "raw": {
                "current": current,
                "hourly": hourly
            }
        }
    except Exception as e:
        print("❌ [Weather] Error:", repr(e))
        return {}
