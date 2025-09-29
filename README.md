# Real-Time Air Quality Forecast Web App

## Overview
This web app fetches real-time air quality data from TEMPO (NASA), OpenAQ, and Open-Meteo APIs, processes it, and displays it on a dashboard with maps, charts, and alerts. The backend uses Flask and updates data every 15 minutes. Forecasting uses simple linear regression on recent PM2.5 data.

## Setup
1. Create a NASA Earthdata account at https://urs.earthdata.nasa.gov and set environment variables:
   - export EARTHDATA_USERNAME=your_username
   - export EARTHDATA_PASSWORD=your_password

2. Install dependencies:
   pip install -r backend/requirements.txt

3. Run the app:
   python backend/app.py

4. Open http://127.0.0.1:5000 in your browser.

## Notes
- TEMPO data requires authentication; fallback to dummy data if it fails.
- The app auto-refreshes every 10 minutes on the frontend.
- Forecasting is basic (linear trend); improve with more data/features if needed.
- Data files from TEMPO are downloaded to ./data/.

 Rate limit exceeded
 [OpenAQ] Error fetching measurements for London: 'Measure
ment' object has no attribute 'date'