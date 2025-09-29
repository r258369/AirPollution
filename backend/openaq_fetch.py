from openaq import OpenAQ
import pandas as pd
import time
import re
from datetime import datetime

API_KEY = "fcab9595267fdcfb9bb3f1cdfac8cbc6d23a96fddc87bf44debd264125c4afd8"

CITIES_COORDS = {
    "New York": [40.7128, -74.0060],
    "Los Angeles": [34.0522, -118.2437],
    "London": [51.5074, -0.1278]
}

RADIUS = 25000  # max allowed by OpenAQ (meters)
REQUEST_PAUSE = 2.0
MAX_RETRIES = 5

def _safe_attr(obj, name, default=None):
    try:
        if hasattr(obj, name):
            return getattr(obj, name)
        if isinstance(obj, dict):
            return obj.get(name, default)
    except Exception:
        pass
    return default

def _parse_rate_limit_message(msg):
    if not msg:
        return None
    m = re.search(r"(\d+)\s*second", msg)
    if m:
        try:
            return int(m.group(1))
        except:
            return None
    return None

def fetch_openaq_data():
    print("🔹 [OpenAQ] Fetching ground station data...")
    all_data = []
    try:
        client = OpenAQ(api_key=API_KEY)

        for city, coords in CITIES_COORDS.items():
            print(f"🔹 [OpenAQ] Fetching city: {city} coords={coords}")
            retries = 0
            while retries < MAX_RETRIES:
                try:
                    res = client.locations.list(coordinates=coords, radius=RADIUS, limit=5)
                    locations = getattr(res, 'results', []) or []
                    print(f"🔹 [OpenAQ] {city}: {len(locations)} locations found")

                    for loc in locations:
                        loc_id = _safe_attr(loc, 'id')
                        loc_name = _safe_attr(loc, 'name', '')
                        coords_obj = _safe_attr(loc, 'coordinates', None) or {}
                        lat = coords_obj.get('latitude') if isinstance(coords_obj, dict) else _safe_attr(coords_obj, 'latitude', None)
                        lon = coords_obj.get('longitude') if isinstance(coords_obj, dict) else _safe_attr(coords_obj, 'longitude', None)

                        # Fetch measurements with fallback for client versions
                        measurements = []
                        try:
                            # Try newer client (sensors_id fallback)
                            try:
                                meas_res = client.measurements.list(location_id=loc_id, limit=10)
                                measurements = getattr(meas_res, 'results', []) or []
                            except TypeError:
                                meas_res = client.measurements.list(sensors_id=loc_id, limit=10)
                                measurements = getattr(meas_res, 'results', []) or []
                        except Exception as e:
                            print(f"❌ [OpenAQ] Error fetching measurements for {loc_name}: {repr(e)}")
                            measurements = []

                        time.sleep(REQUEST_PAUSE)

                        for m in measurements:
                            # Parameter extraction
                            param_obj = _safe_attr(m, 'parameter', None)
                            param_name = ''
                            param_unit = ''
                            if param_obj and hasattr(param_obj, 'name'):
                                param_name = str(param_obj.name)
                                param_unit = str(_safe_attr(param_obj, 'units', ''))
                            elif isinstance(param_obj, str):
                                param_name = param_obj
                            param_unit = param_unit or _safe_attr(m, 'unit', '')

                            # Value extraction
                            value = _safe_attr(m, 'value', None)

                            # Date extraction with multiple fallbacks
                            date_utc = None
                            try:
                                # 1️⃣ direct attribute
                                date_utc = _safe_attr(m, 'date_utc')
                                # 2️⃣ m.date.utc
                                if not date_utc and hasattr(m, 'date') and m.date:
                                    date_utc = _safe_attr(m.date, 'utc')
                                # 3️⃣ dict-like
                                if not date_utc and isinstance(m, dict) and 'date' in m:
                                    dfield = m['date']
                                    if isinstance(dfield, dict) and 'utc' in dfield:
                                        date_utc = dfield['utc']
                                # 4️⃣ fallback to string conversion
                                if not date_utc:
                                    date_utc = str(_safe_attr(m, 'date', datetime.utcnow().isoformat()))
                            except Exception:
                                date_utc = datetime.utcnow().isoformat()

                            # Append if value and param_name are valid
                            if value is not None and param_name:
                                all_data.append({
                                    "city": city,
                                    "location": loc_name,
                                    "parameter": {'name': param_name, 'units': param_unit},
                                    "value": value,
                                    "unit": param_unit,
                                    "lat": float(lat) if lat is not None else None,
                                    "lon": float(lon) if lon is not None else None,
                                    "date_utc": date_utc
                                })
                                print(f"🔎 [OpenAQ Debug] Parameter: {param_name}, Value: {value}, Date: {date_utc}")
                            else:
                                print(f"⚠️ [OpenAQ] Skipping malformed measurement: value={value}, parameter={param_name}")

                    break  # city success
                except Exception as e:
                    msg = repr(e)
                    wait = _parse_rate_limit_message(str(e))
                    print(f"❌ [OpenAQ] Error fetching city {city}: {msg}")
                    if wait:
                        print(f"🔁 [OpenAQ] Rate limit detected; sleeping for {wait+1} seconds")
                        time.sleep(wait + 1)
                    else:
                        retries += 1
                        print(f"🔁 [OpenAQ] Retry {retries}/{MAX_RETRIES} after short pause")
                        time.sleep(1 + retries)
                        continue

            time.sleep(REQUEST_PAUSE)

        print(f"🔹 [OpenAQ] Total measurements fetched: {len(all_data)}")
        return pd.DataFrame(all_data).to_dict(orient='records')

    except Exception as e:
        print("❌ [OpenAQ] Fatal error:", repr(e))
        return []
