# Real-Time Air Quality Forecast Web App

An experimental dashboard that brings together satellite (TEMPO), ground station (OpenAQ) and weather (Open-Meteo) data to present current air quality, local forecasts and simple visualizations.

This repository contains a Flask backend (data fetching, processing, lightweight forecasting) and a static frontend (Leaflet map, charts, and controls).

---

## Highlights
- Reads TEMPO netCDF files (local ./data/ folder) and extracts NO2 summaries.
- Fetches ground measurements from OpenAQ and computes per-location AQI.
- Fetches weather from Open-Meteo and surfaces current conditions.
- Basic 24-hour AQI forecast endpoint (placeholder / demo model).
- Interactive frontend: map, current readings, forecasts, favourites, and weather panel.

---

## Quick start (Windows / PowerShell)

1. Create a Python virtual environment and activate it (recommended):

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

2. Install backend dependencies:

```powershell
pip install -r backend/requirements.txt
```

3. (Optional) If you plan to download TEMPO data from NASA Earthdata, set these environment variables before running the app (do NOT commit credentials):

```powershell
$env:EARTHDATA_USERNAME = 'your_username'
$env:EARTHDATA_PASSWORD = 'your_password'
```

4. Run the backend server (Flask):

```powershell
python backend/app.py
```

The server starts on http://127.0.0.1:5001 by default (see console output).

5. Open the frontend in your browser at http://127.0.0.1:5001

---

## Project structure (important files)

- backend/
  - app.py                 - Flask server, API endpoints and data merging
  - tempo_fetch.py         - Loads TEMPO netCDF files and extracts summaries
  - openaq_fetch.py        - Fetches OpenAQ measurements
  - weather_fetch.py       - Fetches weather from Open-Meteo (current + hourly)
  - forecast.py            - Forecasting helper (simple/demo model)
  - aqi_utils.py           - AQI calculation and breakpoints
  - requirements.txt       - Python dependencies for the backend
- frontend/
  - index.html             - Single-page UI (Leaflet map, cards)
  - script.js              - Frontend logic: fetch APIs, render map and UI
  - style.css              - Extra styling
- data/                    - (local) TEMPO netCDF files go here

---

## Available API endpoints (backend)

- GET `/` — serves `index.html` (frontend)
- GET `/api/tempo` — returns TEMPO summary (mean/max/min and coords) or 404
- GET `/api/openaq` — raw OpenAQ fetch (list of measurements)
- GET `/api/merged` — merged payload: tempo + processed OpenAQ + overall AQI + debug raw_openaq
- GET `/api/weather?lat={lat}&lon={lon}` — returns current weather (and humidity/pressure when available)
- GET `/api/forecast?city={city}&location={location}` — returns 24h AQI forecast for the selected location (demo model)

Use these endpoints in the frontend (see `frontend/script.js`) or call them directly for debugging.

---

## Frontend features

- Interactive Leaflet map showing OpenAQ stations (markers colored by AQI).
- Station list grouped by city with per-location AQI and the latest pollutant/value.
- Weather card (shows which location is being displayed) and current meteorological conditions.
- 24-hour AQI forecast chart for a selected location.
- Favourites panel: add stations from the list or marker popups for quick access (session-only).

---

## Notes on data and limitations

- TEMPO: this project currently reads TEMPO `.nc` files from `./data/` (downloaded separately). Some TEMPO products require NASA Earthdata authentication; the code expects files already present. If no file is available, the app falls back to dummy/empty TEMPO payloads.
- OpenAQ: the project uses the OpenAQ API to obtain ground station measurements. OpenAQ enforces rate limits; you may see messages like `Rate limit exceeded` in logs. If you get repeated failures, slow down polling or use stored sample data.
- Weather: Open-Meteo is used for current weather; we attempt to extract humidity and surface pressure from hourly arrays if not present in the current payload.
- Forecasting: currently a simple placeholder model (linear or demo). Replace `backend/forecast.py` with a trained model or time-series method (Prophet, ARIMA, ML) for production-quality forecasts.

Known edge-cases and troubleshooting tips
- "Rate limit exceeded" from OpenAQ: this is an API-side limit. Reduce polling frequency in `app.py` scheduler or add retry/backoff. For development, use cached data in `data/`.
- "Measurement object has no attribute 'date'" or similar parsing errors: OpenAQ payload shape may differ from earlier versions of the client. Inspect the raw `/api/openaq` response and adjust parsing in `backend/openaq_fetch.py` or the frontend parsing code in `frontend/script.js`.
- TEMPO netCDF reading errors: ensure `xarray` and `netCDF4` (or `h5netcdf`) are installed and that files in `./data/` are valid TEMPO products.

---

## Development notes

- To change the refresh interval: edit the scheduler in `backend/app.py` (currently scheduled every 60 seconds in dev; adjust to 10 or 15 minutes for production workloads).
- To add a TEMPO downloader (Earthdata): implement authenticated requests that store files to `./data/` and capture provenance metadata (file name, acquisition time). Do NOT store credentials in the repo — use env vars.
- Adding persistence for favourites: the frontend stores favourites in-memory; add `localStorage` or backend user accounts to persist across sessions.

Testing and debugging
- Backend logs: run the app from a console to see informative prints (fetching steps, errors). Example: `python backend/app.py`.
- Frontend debugging: open browser DevTools → Network to inspect `/api/*` responses and Console to view UI warnings.

---

## Contributing

Contributions and improvements are welcome — please open a PR or issue. Areas that would add value:

- Implement robust TEMPO auto-download with Earthdata auth and provenance.
- Replace the demo forecast with a validated forecasting model that consumes satellite + ground + weather features.
- Add user accounts and persist favourites per user.
- Implement server-side tiling or raster streaming for TEMPO overlays.

---

## License

This project is released under the MIT License. See the `LICENSE` file for details.

---

If you'd like, I can also add a quick "developer quickstart" script that creates a venv, installs dependencies, and runs the server for you.
