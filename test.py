import os
import time
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, Optional

import requests


DEFAULT_RADIUS_METERS = int(os.getenv("OPENAQ_RADIUS_METERS", "25000"))
OPENAQ_BASE_URL_V2 = os.getenv("OPENAQ_BASE_URL_V2", "https://api.openaq.org/v3")
REQUEST_TIMEOUT_SECONDS = float(os.getenv("OPENAQ_TIMEOUT_SECONDS", "12"))
MAX_RETRIES = int(os.getenv("OPENAQ_MAX_RETRIES", "3"))


def _http_get_with_retries(url: str, params: Dict[str, Any]) -> Dict[str, Any]:
    last_exc: Optional[Exception] = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = requests.get(url, params=params, timeout=REQUEST_TIMEOUT_SECONDS)
            response.raise_for_status()
            return response.json()
        except Exception as exc:  # noqa: BLE001 - bubble up after retries
            last_exc = exc
            # brief backoff
            time.sleep(min(0.25 * attempt, 2.0))
    # If we exhausted retries, raise the last exception
    if last_exc:
        raise last_exc
    return {}


def get_openaq_data(
    latitude: float,
    longitude: float,
    historical: bool = False,
    parameters: Optional[List[str]] = None,
    radius_meters: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """
    Fetch OpenAQ measurements near a coordinate using the public v2 REST API.

    Parameters
    - latitude, longitude: coordinates to query
    - historical: when True, include a time range (past 14 days) and return date as {'utc': ...}
                  when False, return the latest measurements and set date to an ISO string for sorting
    - parameters: list of pollutants, defaults to ['pm25', 'no2']
    - radius_meters: search radius, defaults to 25km

    Returns a list of dicts with keys: parameter, value, unit, date
    - If historical is True: date is a dict with key 'utc' (to match app.py forecast usage)
    - If historical is False: date is an ISO string (so Pandas can sort by 'date' directly in merged view)
    """
    if parameters is None:
        parameters = ["pm25", "no2"]

    search_radius = int(radius_meters or DEFAULT_RADIUS_METERS)

    base_url = f"{OPENAQ_BASE_URL_V2}/measurements"

    # Build base params
    params: Dict[str, Any] = {
        "coordinates": f"{latitude},{longitude}",
        "radius": search_radius,
        # v2 accepts comma-separated parameters
        "parameter": ",".join(parameters),
        "order_by": "datetime",
        "sort": "desc",
        "limit": 100,
        "format": "json",
    }

    if historical:
        # Past 14 days window
        now_utc = datetime.now(timezone.utc)
        date_from = now_utc - timedelta(days=14)
        params.update(
            {
                "date_from": date_from.isoformat(timespec="seconds"),
                "date_to": now_utc.isoformat(timespec="seconds"),
            }
        )

    try:
        data = _http_get_with_retries(base_url, params)
    except Exception as e:  # noqa: BLE001 - return empty on failure to keep app resilient
        print(f"OpenAQ request failed: {e}")
        return []

    results = data.get("results", [])
    cleaned: List[Dict[str, Any]] = []

    for item in results:
        parameter = item.get("parameter")
        value = item.get("value")
        unit = item.get("unit")
        date_info = item.get("date") or {}
        date_utc = None
        if isinstance(date_info, dict):
            date_utc = date_info.get("utc") or date_info.get("utc_from") or date_info.get("utc_to")
        elif isinstance(date_info, str):
            date_utc = date_info

        if historical:
            # app.py's forecast expects df["date"].apply(lambda x: x["utc"]) shape
            date_field: Any = {"utc": date_utc} if date_utc else {"utc": None}
        else:
            # merged view sorts by the 'date' column directly; make it an ISO string
            date_field = date_utc

        cleaned.append(
            {
                "parameter": parameter,
                "value": value,
                "unit": unit,
                "date": date_field,
            }
        )

    return cleaned