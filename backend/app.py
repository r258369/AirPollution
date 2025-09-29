from flask import Flask, jsonify, send_from_directory, request
from tempo_fetch import fetch_tempo_file
from openaq_fetch import fetch_openaq_data
from weather_fetch import fetch_weather
from forecast import forecast_aqi
from aqi_utils import calc_aqi, PM25_BREAKPOINTS, NO2_BREAKPOINTS, CO_BREAKPOINTS, PM10_BREAKPOINTS, O3_BREAKPOINTS
import pandas as pd
from datetime import datetime, timedelta
import os
from collections import defaultdict
import re # Import the regex module

# static_folder path points to frontend directory relative to backend
app = Flask(__name__, static_folder=os.path.join(os.path.dirname(__file__), '../frontend'), static_url_path='')

# Serve index and static files
@app.route('/')
def index():
    print("🔹 [Frontend] Serving index.html")
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory(app.static_folder, path)

# API endpoints with verbose debug prints
@app.route('/api/tempo')
def api_tempo():
    print("🔹 [API] /api/tempo called")
    data = fetch_tempo_file()
    print("🔹 [API] TEMPO data:", data)
    if not data:
        return jsonify({"error":"No TEMPO data"}), 404
    return jsonify(data)

@app.route('/api/openaq')
def api_openaq():
    print("🔹 [API] /api/openaq called")
    data = fetch_openaq_data()
    print(f"🔹 [API] OpenAQ returned {len(data)} records")
    return jsonify(data)

def convert_concentration_to_aqi_units(value, param_name, unit):
    """Convert concentration values to the units expected by AQI breakpoints"""
    if param_name == 'co':
        # CO breakpoints are in ppm, but data often comes in µg/m³
        # Conversion: 1 ppm CO = 1.15 mg/m³ = 1150 µg/m³ (at STP)
        if unit.lower() in ['µg/m³', 'ug/m3', 'micrograms per cubic meter']:
            return value / 1150.0  # Convert µg/m³ to ppm
        elif unit.lower() in ['mg/m³', 'mg/m3', 'milligrams per cubic meter']:
            return value / 1.15  # Convert mg/m³ to ppm
        else:
            return value  # Assume already in ppm
    elif param_name == 'o3':
        # O3 breakpoints are in ppm, but data often comes in µg/m³
        # Conversion: 1 ppm O3 = 1.96 mg/m³ = 1960 µg/m³ (at STP)
        if unit.lower() in ['µg/m³', 'ug/m3', 'micrograms per cubic meter']:
            return value / 1960.0  # Convert µg/m³ to ppm
        elif unit.lower() in ['mg/m³', 'mg/m3', 'milligrams per cubic meter']:
            return value / 1.96  # Convert mg/m³ to ppm
        else:
            return value  # Assume already in ppm
    else:
        # PM2.5, PM10, NO2 breakpoints are already in µg/m³
        return value

def process_openaq_data(raw_data):
    """Process raw OpenAQ data and calculate AQI for each location - FIXED VERSION"""
    processed_locations = {}
    
    for record in raw_data:
        # Extract parameter name from object or string
        param_obj = record.get('parameter', {})
        param_name = ''

        # If param_obj is a dict (from openaq_fetch.py direct processing)
        if isinstance(param_obj, dict):
            param_name = str(param_obj.get('name', '')).lower()
        # If param_obj is a ParameterBase object string (from raw OpenAQ API response)
        elif isinstance(param_obj, str):
            match = re.search(r"name='([a-zA-Z0-9.]+)'", param_obj)
            if match:
                param_name = match.group(1).lower()
            else:
                pass

        # Only process supported parameters
        if param_name not in ['pm25', 'no2', 'co', 'pm10', 'o3']:
            continue
            
        # Create location key - FIXED: Use simpler key to avoid over-grouping
        location_key = f"{record.get('city', 'Unknown')}_{record.get('location', 'Unknown')}"
        
        if location_key not in processed_locations:
            processed_locations[location_key] = {
                'city': record.get('city', 'Unknown'),
                'location': record.get('location', 'Unknown'),
                'lat': float(record.get('lat')) if record.get('lat') is not None else None,
                'lon': float(record.get('lon')) if record.get('lon') is not None else None,
                'measurements': [],
                'aqi': None,
                'dominant_pollutant': None,
                'raw_values': {}  # Store raw values for debugging
            }
        
        # Add measurement
        value = record.get('value')
        if value is not None and isinstance(value, (int, float)):
            unit = param_obj.get('units', '') if isinstance(param_obj, dict) else record.get('unit', '')
            processed_locations[location_key]['measurements'].append({
                'parameter': param_name,
                'value': float(value),
                'unit': unit,
                'date_utc': record.get('date_utc', '')
            })
            # Store raw values for debugging
            processed_locations[location_key]['raw_values'][param_name] = float(value)
    
    # Calculate AQI for each location - FIXED: Include all locations, not just those with valid AQI
    result = []
    for location_data in processed_locations.values():
        if not location_data['measurements']:
            continue
            
        aqi_values_with_time = [] # Store (aqi, param, date_utc) tuples
        for measurement in location_data['measurements']:
            param = measurement['parameter']
            value = measurement['value']
            unit = measurement['unit']
            date_utc = measurement['date_utc']
            
            # Convert concentration to AQI units
            converted_value = convert_concentration_to_aqi_units(value, param, unit)
            
            # Calculate AQI for all supported parameters
            if param == 'pm25':
                aqi = calc_aqi(converted_value, PM25_BREAKPOINTS)
            elif param == 'no2':
                aqi = calc_aqi(converted_value, NO2_BREAKPOINTS)
            elif param == 'co':
                aqi = calc_aqi(converted_value, CO_BREAKPOINTS)
            elif param == 'pm10':
                aqi = calc_aqi(converted_value, PM10_BREAKPOINTS)
            elif param == 'o3':
                aqi = calc_aqi(converted_value, O3_BREAKPOINTS)
            else:
                continue
                
            if aqi is not None:
                aqi_values_with_time.append((aqi, param, date_utc))
                print(f"🔹 [AQI] {param}: {value} {unit} -> {converted_value} -> AQI {aqi}")
        
        # FIXED: Include all locations, even if they don't have valid AQI calculations
        if aqi_values_with_time:
            # Sort by date_utc (latest first), then by AQI (highest first) for tie-breaking
            aqi_values_with_time.sort(key=lambda x: (x[2], x[0]), reverse=True)
            
            # The latest (and if tied, highest AQI) measurement determines the overall AQI
            latest_aqi, latest_dominant_pollutant, _ = aqi_values_with_time[0]
            location_data['aqi'] = latest_aqi
            location_data['dominant_pollutant'] = latest_dominant_pollutant
        else:
            # Still include location even if no valid AQI calculation
            location_data['aqi'] = None
            location_data['dominant_pollutant'] = None
            
        result.append(location_data)
    
    return result

@app.route('/api/merged')
def api_merged():
    print("🔹 [API] /api/merged called")
    tempo = fetch_tempo_file() or {"no2_mean":0,"no2_max":0,"no2_min":0,"lat":[],"lon":[]}
    raw_openaq = fetch_openaq_data() or []
    
    # Process OpenAQ data and calculate AQI
    processed_openaq = process_openaq_data(raw_openaq)
    
    # Calculate overall AQI
    overall_aqi = 0
    if processed_openaq:
        aqi_values = [loc['aqi'] for loc in processed_openaq if loc['aqi'] is not None]
        if aqi_values:
            overall_aqi = max(aqi_values)
    
    merged = {
        "tempo": tempo, 
        "openaq": processed_openaq,
        "overall_aqi": overall_aqi,
        "raw_openaq": raw_openaq  # Keep raw data for debugging
    }
    
    print(f"🔹 [API] Merged data ready (tempo: {'present' if tempo else 'none'}, processed locations: {len(processed_openaq)}, overall AQI: {overall_aqi})")
    return jsonify(merged)

@app.route('/api/weather')
def api_weather():
    print("🔹 [API] /api/weather called")
    data = fetch_weather(40.7128, -74.0060)
    print("🔹 [API] Weather data:", data)
    return jsonify(data)

@app.route('/api/forecast')
def api_forecast():
    print("🔹 [API] /api/forecast called")
    openaq = fetch_openaq_data() or []
    
    # Get city and location from query parameters
    city_param = request.args.get('city')
    location_param = request.args.get('location')

    # Helper function to extract parameter name
    def get_param_name(param_obj):
        if isinstance(param_obj, dict):
            return str(param_obj.get('name', '')).lower()
        elif isinstance(param_obj, str):
            match = re.search(r"name='([a-zA-Z0-9.]+)'", param_obj)
            if match:
                return match.group(1).lower()
        return ''

    # Debug: Print raw OpenAQ data for the selected city/location
    print("🔎 [Forecast Debug] Raw OpenAQ data (sample for selected location):")
    for item in openaq:
        if (not city_param or item.get('city') == city_param) and \
           (not location_param or item.get('location') == location_param):
            print(f"  Parameter: {get_param_name(item.get('parameter'))}, Value: {item.get('value')}, Date: {item.get('date_utc')}")

    # Use all available data with a valid parameter name and value
    filtered_openaq_data = [d for d in openaq if get_param_name(d.get('parameter', '')) != '' and d.get('value') is not None and d.get('date_utc') is not None]
    
    # Filter by city and location if parameters are provided
    if city_param:
        filtered_openaq_data = [d for d in filtered_openaq_data if d.get('city') == city_param]
    if location_param:
        filtered_openaq_data = [d for d in filtered_openaq_data if d.get('location') == location_param]

    # Further filter to ensure 'value', 'date_utc', and 'parameter' are present for forecasting
    # Also ensure parameter has a name, and value is not None
    filtered_openaq_data = [d for d in filtered_openaq_data if 
                            d.get('value') is not None and 
                            d.get('date_utc') is not None and 
                            d.get('parameter') is not None and 
                            get_param_name(d.get('parameter')) != ''
                           ]

    # Debug: Print filtered OpenAQ data for the selected city/location
    print("🔎 [Forecast Debug] Filtered OpenAQ data (sample for selected location):")
    for item in filtered_openaq_data:
        print(f"  Parameter: {get_param_name(item.get('parameter'))}, Value: {item.get('value')}, Date: {item.get('date_utc')}")

    if not filtered_openaq_data:
        print("⚠️ [Forecast] No OpenAQ data with valid parameter, value, and date_utc found for specified location - returning demo forecast")
        demo = [{"ds": (datetime.utcnow()+timedelta(hours=i)).isoformat(), "yhat": 50 + i} for i in range(24)]
        return jsonify(demo)
    
    # Process data to get overall AQI for selected location
    # processed_selected_data = process_openaq_data(filtered_openaq_data) # Removed

    # if not processed_selected_data:
    #     print("⚠️ [Forecast] No processed OpenAQ data for specified location - returning demo forecast")
    #     demo = [{"ds": (datetime.utcnow()+timedelta(hours=i)).isoformat(), "yhat": 50 + i} for i in range(24)]
    #     return jsonify(demo)
    
    # We will now create a DataFrame that represents the AQI trend
    # For simplicity, we'll take the overall AQI for the selected city/location.
    # Since the frontend doesn't use 'ds', we will create dummy 'ds' values for the backend processing.
    # trend_data = [] # Removed
    # for i, loc_data in enumerate(processed_selected_data): # Removed
    #     if loc_data['aqi'] is not None: # Removed
    #         # Use the overall AQI for the location # Removed
    #         trend_data.append({'ds': (datetime.utcnow() + timedelta(hours=i)).isoformat(), 'y': float(loc_data['aqi'])}) # Removed

    # if not trend_data: # Removed
    #     print("⚠️ [Forecast] No valid AQI trend data generated - returning demo forecast") # Removed
    #     demo = [{"ds": (datetime.utcnow()+timedelta(hours=i)).isoformat(), "yhat": 50 + i} for i in range(24)] # Removed
    #     return jsonify(demo) # Removed
    
    # Create a DataFrame from the filtered_openaq_data and calculate AQI for each measurement
    df = pd.DataFrame(filtered_openaq_data)
    
    # Ensure the 'parameter_name' column exists for filtering
    df['parameter_name'] = df['parameter'].apply(lambda x: get_param_name(x))
    
    # Convert concentrations to AQI
    def convert_to_aqi(value, param_name, unit=''):
        """Convert concentration value to AQI based on parameter type"""
        # Convert to AQI units first
        converted_value = convert_concentration_to_aqi_units(value, param_name, unit)
        
        if param_name == 'pm25':
            return calc_aqi(converted_value, PM25_BREAKPOINTS)
        elif param_name == 'no2':
            return calc_aqi(converted_value, NO2_BREAKPOINTS)
        elif param_name == 'co':
            return calc_aqi(converted_value, CO_BREAKPOINTS)
        elif param_name == 'pm10':
            return calc_aqi(converted_value, PM10_BREAKPOINTS)
        elif param_name == 'o3':
            return calc_aqi(converted_value, O3_BREAKPOINTS)
        return None
    
    # Get unit information for each row
    df['unit'] = df['parameter'].apply(lambda x: x.get('units', '') if isinstance(x, dict) else '')
    
    # Convert all values to AQI
    df['aqi_value'] = df.apply(lambda row: convert_to_aqi(row['value'], row['parameter_name'], row['unit']), axis=1)
    
    # Debug: Print all parameter names and their calculated AQI values
    print("🔎 [Forecast Debug] All calculated AQI values for trend:")
    print(df[['date_utc', 'parameter_name', 'aqi_value']].to_string())

    # Filter out rows where AQI conversion failed
    df = df.dropna(subset=['aqi_value'])

    if df.empty:
        print("⚠️ [Forecast] No valid AQI conversions found - returning demo forecast")
        demo = [{"ds": (datetime.utcnow()+timedelta(hours=i)).isoformat(), "yhat": 50 + i} for i in range(24)]
        return jsonify(demo)
    
    # For the trend, we need all individual AQI values. No specific pollutant selection is needed.
    # We'll simply take the 'aqi_value' as 'y' for the forecast_aqi function.
    forecast_df = df[['date_utc', 'aqi_value', 'parameter_name']].dropna()
    forecast_df = forecast_df.rename(columns={'date_utc': 'ds', 'aqi_value': 'y'})

    # Ensure 'ds' is datetime and sort by time
    forecast_df['ds'] = pd.to_datetime(forecast_df['ds'], errors='coerce')
    forecast_df = forecast_df.dropna(subset=['ds'])
    forecast_df = forecast_df.sort_values('ds')

    print(f"🔹 [Forecast] Using {len(forecast_df)} data points for forecasting")
    
    if forecast_df.empty or len(forecast_df) < 1: # Only need 1 data point now to get a 'base' value
        print("⚠️ [Forecast] Insufficient data points for forecasting - returning demo forecast")
        demo = [{"ds": (datetime.utcnow()+timedelta(hours=i)).isoformat(), "yhat": 50 + i} for i in range(24)]
        return jsonify(demo)

    forecast_data = forecast_aqi(forecast_df)
    print("🔹 [API] Forecast ready with {} points".format(len(forecast_data)))
    return jsonify(forecast_data)

if __name__ == '__main__':
    print("🚀 Starting Flask server at http://127.0.0.1:5000")
    app.run(debug=True)
