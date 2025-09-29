# Reference: US EPA AQI Breakpoints
# https://www.airnow.gov/aqi/aqi-calculation/

NO2_BREAKPOINTS = [
    (0, 53, 0, 50),
    (54, 100, 51, 100),
    (101, 360, 101, 150),
    (361, 649, 151, 200),
    (650, 1249, 201, 300),
    (1250, 1649, 301, 400),
    (1650, 2049, 401, 500)
]

PM25_BREAKPOINTS = [
    (0.0, 12.0, 0, 50),
    (12.1, 35.4, 51, 100),
    (35.5, 55.4, 101, 150),
    (55.5, 150.4, 151, 200),
    (150.5, 250.4, 201, 300),
    (250.5, 350.4, 301, 400),
    (350.5, 500.4, 401, 500)
]

# CO Breakpoints (8-HR RUN AVG END HOUR, in ppm)
CO_BREAKPOINTS = [
    (0.0, 4.4, 0, 50),
    (4.5, 9.4, 51, 100),
    (9.5, 12.4, 101, 150),
    (12.5, 15.4, 151, 200),
    (15.5, 30.4, 201, 300),
    (30.5, 50.4, 301, 500)
]

# PM10 Breakpoints (24 HOUR, in µg/m³)
PM10_BREAKPOINTS = [
    (0.0, 54.0, 0, 50),
    (55.0, 154.0, 51, 100),
    (155.0, 254.0, 101, 150),
    (255.0, 354.0, 151, 200),
    (355.0, 424.0, 201, 300),
    (425.0, 604.0, 301, 500)
]

# O3 Breakpoints (8-HR RUN AVG BEGIN HOUR, in ppm)
O3_BREAKPOINTS = [
    (0.000, 0.054, 0, 50),
    (0.055, 0.070, 51, 100),
    (0.071, 0.085, 101, 150),
    (0.086, 0.105, 151, 200),
    (0.106, 0.200, 201, 300)
]

def calc_aqi(conc, breakpoints):
    for C_low, C_high, I_low, I_high in breakpoints:
        if C_low <= conc <= C_high:
            aqi = ((I_high - I_low)/(C_high - C_low)) * (conc - C_low) + I_low
            return round(aqi)
    return None

def aqi_for_city(measurements):
    """measurements: list of dicts with keys 'parameter' and 'value'"""
    aqi_values = []
    for m in measurements:
        if m['value'] is None:
            continue
        if m['parameter'] == 'no2':
            aqi_values.append(calc_aqi(m['value'], NO2_BREAKPOINTS))
        elif m['parameter'] == 'pm25':
            aqi_values.append(calc_aqi(m['value'], PM25_BREAKPOINTS))
        elif m['parameter'] == 'co':
            aqi_values.append(calc_aqi(m['value'], CO_BREAKPOINTS))
        elif m['parameter'] == 'pm10':
            aqi_values.append(calc_aqi(m['value'], PM10_BREAKPOINTS))
        elif m['parameter'] == 'o3':
            aqi_values.append(calc_aqi(m['value'], O3_BREAKPOINTS))
    if aqi_values:
        return max(aqi_values)  # AQI is max of pollutants
    return None
