import xarray as xr
import numpy as np
import os

LOCAL_DIR = "./data"

def fetch_tempo_file():
    print("🔹 [TEMPO] Fetching latest TEMPO file...")
    files = [f for f in os.listdir(LOCAL_DIR) if f.endswith(".nc")]
    if not files:
        print("⚠️ [TEMPO] No TEMPO files found in", LOCAL_DIR)
        return None
    latest_file = sorted(files)[-1]
    print("🔹 [TEMPO] Latest file:", latest_file)
    try:
        ds = xr.open_dataset(os.path.join(LOCAL_DIR, latest_file))
        # Many TEMPO files don't have variable named 'NO2'; fallback to 'weight' if present
        if 'NO2' in ds:
            arr = ds['NO2'].values
        elif 'weight' in ds:
            arr = ds['weight'].values
        else:
            print("⚠️ [TEMPO] No NO2/weight variable found — using zeros fallback.")
            arr = np.zeros((len(ds['latitude']), len(ds['longitude'])))

        lat = ds['latitude'].values
        lon = ds['longitude'].values
        ds.close()

        data = {
            "no2_mean": float(np.nanmean(arr)),
            "no2_max": float(np.nanmax(arr)),
            "no2_min": float(np.nanmin(arr)),
            "lat": list(map(float, lat.tolist())),
            "lon": list(map(float, lon.tolist()))
        }
        print("🔹 [TEMPO] Data extracted successfully")
        return data
    except Exception as e:
        print("❌ [TEMPO] Error reading file:", repr(e))
        return None
