# Placeholder forecasting - kept simple and robust
from datetime import datetime, timedelta
import pandas as pd

def forecast_aqi(df):
    """
    Very simple deterministic forecast:
    - if df has rows, use last value and create small trend
    - otherwise return an increasing demo series
    Expects df with 'ds' and 'y' columns (pandas), but also supports 'AQI'.
    """
    results = []
    try:
        if df is None or df.empty:
            now = datetime.utcnow()
            for i in range(24):
                results.append({
                    "ds": (now + timedelta(hours=i)).isoformat(),
                    "yhat": 50 + i
                })
            return results

        # 🔎 Debug: print available columns - keeping for general debugging, but ds isn't critical now
        print("🔎 [Forecast] DataFrame columns:", df.columns.tolist())
        print("🔎 [Forecast] Sample head:\n", df.head())

        # Detect the correct column for AQI values
        if "y" in df.columns:
            # Now 'values' will be a list of lists: [[y_val, param_name, ds_val], ...]
            # Make sure 'ds' is included here from the input df
            values = df[["y", "parameter_name", "ds"]].dropna().values.tolist()
        elif "AQI" in df.columns:
            values = df[["AQI", "parameter_name", "ds"]].dropna().values.tolist()
        elif "value" in df.columns:
            values = df[["value", "parameter_name", "ds"]].dropna().values.tolist()
        else:
            raise KeyError("No valid AQI column found (expected 'y', 'AQI', or 'value').")
        
        print("🔎 [Forecast Debug] Extracted values for forecasting:", values)

        # Get base value
        if len(values) == 0:
            base = 50.0
        else:
            # Base should be from the y value of the last item
            base = float(values[-1][0])

        now = datetime.utcnow()
        
        # Use existing values directly, generating a ds for each
        for i, val_param_ds_pair in enumerate(values):
            results.append({
                "ds": val_param_ds_pair[2].isoformat(), # Use the actual ds from the input DataFrame
                "yhat": val_param_ds_pair[0], # y value
                "parameter_name": val_param_ds_pair[1] # parameter name
            })
        
        return results

    except Exception as e:
        print("❌ [Forecast] Error:", repr(e))
        now = datetime.utcnow()
        return [{
            "ds": (now + timedelta(hours=i)).isoformat(),
            "yhat": 50 + i
        } for i in range(24)]
