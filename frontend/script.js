// script.js

document.addEventListener('DOMContentLoaded', async () => {
    const lastUpdatedSpan = document.getElementById('last-updated');
    const refreshButton = document.getElementById('refresh-button');

    const healthAlert = document.getElementById('health-alert');
    const severeAlert = document.getElementById('severe-alert');

    const citySearchInput = document.getElementById('city-search-input');
    const citySearchButton = document.getElementById('city-search-button');
    const suggestionsContainer = document.getElementById('suggestions-container');

    const burgerMenuButton = document.getElementById('burger-menu-button');
    const headerNavContent = document.getElementById('header-nav-content');
    const currentLocationButton = document.getElementById('current-location-button');

    const loginButton = document.getElementById('login-button');
    const loginModal = document.getElementById('login-modal');
    const signupModal = document.getElementById('signup-modal');
    const showSignup = document.getElementById('show-signup');
    const showLogin = document.getElementById('show-login');

    // Initialize Leaflet Map
    const map = L.map('map').setView([20, 0], 2); // Centered globally, zoom level 2

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Handle popup 'Add favourite' clicks
    map.on('popupopen', function(e) {
        // Find the add-fav button inside the popup
        const popupNode = e.popup.getElement();
        if (!popupNode) return;
        const addBtn = popupNode.querySelector('.popup-add-fav');
        if (addBtn) {
            addBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                // Try to extract city/location/aqi from popup content
                const cityEl = popupNode.querySelector('p.font-semibold');
                const locationEl = popupNode.querySelector('p.text-sm');
                const aqiEl = popupNode.querySelector('p span.font-bold');
                const city = cityEl ? cityEl.textContent.trim() : 'Unknown';
                const locationName = locationEl ? locationEl.textContent.replace('Location:','').trim() : 'Unknown';
                let aqiVal = null;
                if (aqiEl) {
                    // aqiEl.textContent could be like '42 (Good)'
                    const aqiText = aqiEl.textContent.trim().split(' ')[0];
                    aqiVal = isNaN(Number(aqiText)) ? aqiText : Number(aqiText);
                }
                // Use popup latlng as location coords
                const latlng = e.popup.getLatLng();
                const lat = latlng ? latlng.lat : null;
                const lon = latlng ? latlng.lng : null;
                // Add to favourites (avoid duplicates)
                const exists = favourites.some(f => f.city === city && f.location === locationName);
                if (!exists) {
                    favourites.push({ city, location: locationName, lat, lon, aqi: aqiVal });
                    renderFavourites();
                }
            });
        }
    });

    let markers = L.featureGroup().addTo(map);

    // Initialize Chart.js for 24h Forecast
    const forecastCtx = document.getElementById('forecast-chart').getContext('2d');
    let forecastChart; // Declare chart globally to be able to update it

    // In-memory favourites store (could be persisted to localStorage later)
    let favourites = [];

    const renderFavourites = () => {
        const container = document.querySelector('#favourites-section .space-y-3');
        if (!container) return;
        container.innerHTML = '';
        if (favourites.length === 0) {
            container.innerHTML = '<p class="text-gray-400">No favourites yet. Click the star on a location to add it.</p>';
            return;
        }
        favourites.forEach(fav => {
            const favHtml = document.createElement('div');
            favHtml.className = 'bg-gray-700 p-3 rounded-lg flex justify-between items-center cursor-pointer hover:bg-gray-600';
            favHtml.dataset.city = fav.city;
            favHtml.dataset.location = fav.location;
            favHtml.dataset.lat = fav.lat;
            favHtml.dataset.lon = fav.lon;
            const aqiVal = (fav.aqi !== null && fav.aqi !== undefined) ? fav.aqi : null;
            const aqiText = aqiVal !== null ? aqiVal : 'N/A';
            const statusText = (aqiVal !== null) ? getAQIStatus(aqiVal) : 'N/A';
            const statusClass = (aqiVal !== null) ? getAQIStatusColor(aqiVal) : 'text-gray-400';

            favHtml.innerHTML = `
                <div>
                    <p class="font-semibold">${fav.location}</p>
                    <p class="text-sm text-gray-400">${fav.city}</p>
                </div>
                <div class="text-right">
                    <p class="font-semibold text-lg">${aqiText}</p>
                    <p class="text-sm ${statusClass}">${statusText}</p>
                    <div class="mt-1">
                        <button class="remove-fav text-yellow-400">Remove</button>
                    </div>
                </div>
            `;
            favHtml.querySelector('.remove-fav').addEventListener('click', (e) => {
                e.stopPropagation();
                favourites = favourites.filter(f => !(f.city === fav.city && f.location === fav.location));
                renderFavourites();
            });
            favHtml.addEventListener('click', async () => {
                // On click, center map and fetch weather/forecast
                const lat = fav.lat;
                const lon = fav.lon;
                map.setView([lat, lon], 12);
                await fetchWeatherAndUpdateUI(lat, lon, fav.city, fav.location);
                await fetchLocationForecast(fav.city, fav.location);
            });
            container.appendChild(favHtml);
        });
    };

    // Function to update the last updated time
    const updateLastUpdatedTime = () => {
        const now = new Date();
        lastUpdatedSpan.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    };

    // Initial update
    updateLastUpdatedTime();

    // Burger menu toggle functionality
    burgerMenuButton.addEventListener('click', () => {
        headerNavContent.classList.toggle('hidden');
    });

    // Modal functionality
    loginButton.addEventListener('click', () => {
        loginModal.classList.remove('hidden');
    });

    showSignup.addEventListener('click', (e) => {
        e.preventDefault();
        loginModal.classList.add('hidden');
        signupModal.classList.remove('hidden');
    });

    showLogin.addEventListener('click', (e) => {
        e.preventDefault();
        signupModal.classList.add('hidden');
        loginModal.classList.remove('hidden');
    });

    // Close modals when clicking outside of them
    loginModal.addEventListener('click', (e) => {
        if (e.target === loginModal) {
            loginModal.classList.add('hidden');
        }
    });

    signupModal.addEventListener('click', (e) => {
        if (e.target === signupModal) {
            signupModal.classList.add('hidden');
        }
    });

    // Current Location button functionality (USA - Kansas)
    currentLocationButton.addEventListener('click', () => {
        const usaCoords = [39.0119, -98.4842]; // Center of USA (Kansas)
        const zoomLevel = 4;
        map.setView(usaCoords, zoomLevel);
        fetchWeatherAndUpdateUI(usaCoords[0], usaCoords[1]); // Update weather for USA center
    });

    let debounceTimer;

    citySearchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const cityName = citySearchInput.value.trim();
        if (cityName.length > 2) { // Start suggesting after 2 characters
            debounceTimer = setTimeout(() => fetchCitySuggestions(cityName), 300);
        } else {
            suggestionsContainer.classList.add('hidden');
        }
    });

    const fetchCitySuggestions = async (query) => {
        try {
            const geoResponse = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`);
            const geoData = await geoResponse.json();
            displaySuggestions(geoData);
        } catch (error) {
            console.error('Error fetching city suggestions:', error);
        }
    };

    const displaySuggestions = (suggestions) => {
        suggestionsContainer.innerHTML = '';
        if (suggestions && suggestions.length > 0) {
            suggestions.forEach(place => {
                const suggestionItem = document.createElement('div');
                suggestionItem.classList.add('p-2', 'cursor-pointer', 'hover:bg-gray-700', 'text-sm');
                suggestionItem.textContent = place.display_name;
                suggestionItem.addEventListener('click', () => {
                    citySearchInput.value = place.display_name;
                    suggestionsContainer.classList.add('hidden');
                    // Optionally trigger search immediately
                    citySearchButton.click();
                });
                suggestionsContainer.appendChild(suggestionItem);
            });
            suggestionsContainer.classList.remove('hidden');
        } else {
            suggestionsContainer.classList.add('hidden');
        }
    };

    // Hide suggestions when clicking outside
    document.addEventListener('click', (event) => {
        if (!citySearchInput.contains(event.target) && !suggestionsContainer.contains(event.target)) {
            suggestionsContainer.classList.add('hidden');
        }
    });

    // City search functionality
    citySearchButton.addEventListener('click', async () => {
        const cityName = citySearchInput.value.trim();
        if (cityName) {
            console.log(`Searching for city: ${cityName}`);
            try {
                // Using OpenStreetMap Nominatim for geocoding
                const geoResponse = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cityName)}&format=json&limit=1`);
                const geoData = await geoResponse.json();

                if (geoData && geoData.length > 0) {
                    const lat = parseFloat(geoData[0].lat);
                    const lon = parseFloat(geoData[0].lon);
                    console.log(`City found: ${cityName} at Lat: ${lat}, Lon: ${lon}`);
                    map.setView([lat, lon], 10); // Zoom to city with zoom level 10
                    fetchWeatherAndUpdateUI(lat, lon, cityName); // Update weather for the new city
                } else {
                    alert(`City not found: ${cityName}. Please try again.`);
                    console.log(`City not found: ${cityName}`);
                }
            } catch (error) {
                console.error('Error during geocoding:', error);
                alert('Error searching for city. Please try again later.');
            }
        }
    });

    // Refresh button functionality
    refreshButton.addEventListener('click', () => {
        console.log('Refreshing data...');
        fetchData();
        updateLastUpdatedTime();
        // Optionally, show a loading indicator
    });

    // Placeholder for fetching data from the backend
    const fetchData = async () => {
        try {
            const mergedResponse = await fetch('/api/merged');
            const mergedData = await mergedResponse.json();
            console.log('Merged Data:', mergedData);

            // Update Weather Conditions
            await fetchWeatherAndUpdateUI(); // Call separately for weather

            // Update Current Readings (OpenAQ data)
            updateCurrentReadingsUI(mergedData.openaq);

            // Update Alerts
            updateAlertsUI(mergedData.openaq);

            // Update TEMPO Satellite data
            updateTempoUI(mergedData.tempo);

            // Update Map with OpenAQ locations
            updateMapWithOpenAQ(mergedData.openaq);

            // Invalidate map size to ensure it renders correctly after data load
            map.invalidateSize();

        } catch (error) {
            console.error('Error fetching data:', error);
            // Display an error message on the UI
        }
    };

    // Function to fetch forecast data for a specific location
    const fetchLocationForecast = async (city, locationName) => {
        try {
            const forecastDescription = document.getElementById('forecast-description');
            forecastDescription.textContent = `Loading 24-hour AQI forecast for ${locationName}, ${city}...`;

            const forecastResponse = await fetch(`/api/forecast?city=${encodeURIComponent(city)}&location=${encodeURIComponent(locationName)}`);
            const forecastData = await forecastResponse.json();
            console.log(`Forecast Data for ${locationName}, ${city}:`, forecastData);
            updateForecastUI(forecastData, city, locationName);
        } catch (error) {
            console.error(`Error fetching forecast data for ${locationName}, ${city}:`, error);
            const forecastDescription = document.getElementById('forecast-description');
            forecastDescription.textContent = `Failed to load forecast for ${locationName}, ${city}.`;
            if (forecastChart) forecastChart.destroy(); // Clear old chart if exists
        }
    };

    // Function to fetch weather data separately and update UI
    // Now accepts optional city and locationName so the UI can display which location the weather refers to
    const fetchWeatherAndUpdateUI = async (lat = 40.7128, lon = -74.0060, city = null, locationName = null) => {
        const weatherLocationEl = document.getElementById('weather-location');
        try {
            // Update the weather location label immediately for responsiveness
            if (city || locationName) {
                const cityLabel = city ? city : '';
                const locLabel = locationName ? ` — ${locationName}` : '';
                weatherLocationEl.textContent = `Weather for: ${cityLabel}${locLabel}`;
            } else if (lat !== undefined && lon !== undefined) {
                weatherLocationEl.textContent = `Weather for: ${parseFloat(lat).toFixed(4)}, ${parseFloat(lon).toFixed(4)}`;
            } else {
                weatherLocationEl.textContent = 'Weather for: Default location';
            }

            const weatherResponse = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
            const weatherData = await weatherResponse.json();
            console.log('Weather Data:', weatherData);
            updateWeatherUI(weatherData);
        } catch (error) {
            console.error('Error fetching weather data:', error);
            // Show failed state but keep the location label so user knows what we attempted
            if (city || locationName) {
                const cityLabel = city ? city : '';
                const locLabel = locationName ? ` — ${locationName}` : '';
                weatherLocationEl.textContent = `Weather for: ${cityLabel}${locLabel} (failed)`;
            } else if (lat !== undefined && lon !== undefined) {
                weatherLocationEl.textContent = `Weather for: ${parseFloat(lat).toFixed(4)}, ${parseFloat(lon).toFixed(4)} (failed)`;
            } else {
                weatherLocationEl.textContent = 'Weather for: Default location (failed)';
            }
        }
    };

    // Functions to update specific UI sections
    const updateWeatherUI = (weatherData) => {
        // Safely extract values from backend response. Backend may return different shapes; handle both.
        try {
            // temperature and wind are top-level in many responses
            const temp = weatherData.temperature ?? (weatherData.raw && weatherData.raw.temperature) ?? 'N/A';
            const windspeed = weatherData.windspeed ?? (weatherData.raw && weatherData.raw.windspeed) ?? 'N/A';
            const winddir = weatherData.winddirection ?? (weatherData.raw && weatherData.raw.winddirection) ?? '';

            // humidity/pressure: prefer top-level if backend provided them, otherwise fall back to raw.current or hourly
            let humidity = weatherData.humidity ?? 'N/A';
            let pressure = weatherData.pressure ?? 'N/A';
            if ((humidity === 'N/A' || pressure === 'N/A') && weatherData.raw) {
                if (weatherData.raw.current) {
                    humidity = humidity === 'N/A' ? (weatherData.raw.current.relativehumidity_2m ?? weatherData.raw.current.humidity ?? humidity) : humidity;
                    pressure = pressure === 'N/A' ? (weatherData.raw.current.surface_pressure ?? weatherData.raw.current.pressure ?? pressure) : pressure;
                } else if (weatherData.raw.hourly) {
                    // attempt to read from hourly arrays (best-effort)
                    const hourly = weatherData.raw.hourly;
                    const times = hourly.time || [];
                    const currentTime = weatherData.time || (weatherData.raw.current && weatherData.raw.current.time) || null;
                    let idx = -1;
                    if (currentTime && Array.isArray(times)) {
                        idx = times.indexOf(currentTime);
                        if (idx === -1) idx = times.length - 1;
                    } else if (Array.isArray(times)) {
                        idx = times.length - 1;
                    }
                    if (idx >= 0) {
                        if (hourly.relativehumidity_2m && Array.isArray(hourly.relativehumidity_2m) && hourly.relativehumidity_2m[idx] !== undefined) {
                            humidity = humidity === 'N/A' ? hourly.relativehumidity_2m[idx] : humidity;
                        }
                        if (hourly.surface_pressure && Array.isArray(hourly.surface_pressure) && hourly.surface_pressure[idx] !== undefined) {
                            pressure = pressure === 'N/A' ? hourly.surface_pressure[idx] : pressure;
                        }
                    }
                }
            }

            document.getElementById('weather-temperature').textContent = (temp !== 'N/A') ? `${temp}°C` : 'N/A';
            document.getElementById('weather-wind').textContent = (windspeed !== 'N/A') ? `${windspeed} km/h ${winddir}` : 'N/A';
            document.getElementById('weather-humidity').textContent = (humidity !== null && humidity !== undefined) ? `${humidity}%` : 'N/A';
            document.getElementById('weather-pressure').textContent = (pressure !== null && pressure !== undefined) ? `${pressure} hPa` : 'N/A';
            document.getElementById('weather-last-updated').textContent = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
        } catch (err) {
            console.error('Error updating weather UI with data:', weatherData, err);
            // Display best-effort values and avoid throwing
            document.getElementById('weather-temperature').textContent = 'N/A';
            document.getElementById('weather-wind').textContent = 'N/A';
            document.getElementById('weather-humidity').textContent = 'N/A';
            document.getElementById('weather-pressure').textContent = 'N/A';
            document.getElementById('weather-last-updated').textContent = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
        }
    };

    const updateCurrentReadingsUI = (openaqData) => {
        const currentReadingsContainer = document.querySelector('#current-readings-section .space-y-3');
        currentReadingsContainer.innerHTML = ''; // Clear existing readings

        if (openaqData && openaqData.length > 0) {
            console.log("openaqData:", openaqData);
            // Group data by city
            const groupedByCity = openaqData.reduce((acc, location) => {
                const city = location.city || 'Unknown';
                if (!acc[city]) {
                    acc[city] = [];
                }
                acc[city].push(location);
                return acc;
            }, {});

            // Sort cities alphabetically
            const sortedCities = Object.keys(groupedByCity).sort();

            sortedCities.forEach(city => {
                const cityLocations = groupedByCity[city];
                // Sort locations within each city by AQI (highest first)
                cityLocations.sort((a, b) => (b.aqi || 0) - (a.aqi || 0));

                const cityGroupHtml = `
                    <div class="city-group mb-4">
                        <div class="city-header bg-gray-600 p-3 rounded-lg flex justify-between items-center cursor-pointer hover:bg-gray-500 transition-colors duration-200">
                            <h3 class="text-xl font-semibold">${city}</h3>
                            <i class="material-icons expand-icon">expand_more</i>
                        </div>
                        <div class="city-locations mt-2 space-y-2 pl-4 hidden"> <!-- Initially hidden -->
                            ${cityLocations.map(location => {
                                // Sort measurements by date_utc to get the latest ones
                                const sortedMeasurements = location.measurements.sort((a, b) => new Date(b.date_utc).getTime() - new Date(a.date_utc).getTime());

                                const aqi = location.aqi || 'N/A';
                                // Choose the latest available measurement to display its parameter and value
                                const latestMeasurement = sortedMeasurements.length > 0 ? sortedMeasurements[0] : null;
                                const displayParam = latestMeasurement ? (latestMeasurement.parameter || '') : '';
                                const displayUnit = latestMeasurement ? (latestMeasurement.unit || '') : '';
                                const displayValue = latestMeasurement && latestMeasurement.value !== undefined && latestMeasurement.value !== null ? (typeof latestMeasurement.value === 'number' ? latestMeasurement.value.toFixed(1) : latestMeasurement.value) : 'N/A';
                                const paramLabelMap = { pm25: 'PM2.5', pm10: 'PM10', no2: 'NO2', o3: 'O3', co: 'CO' };
                                const displayLabel = paramLabelMap[displayParam] || (displayParam ? displayParam.toUpperCase() : '');
                                const locationName = location.location || 'N/A';
                                const status = getAQIStatus(aqi);
                                const statusColor = getAQIStatusColor(aqi);
                                const latitude = location.lat ?? 'N/A';
                                const longitude = location.lon ?? 'N/A';

                                return `
                                    <div class="bg-gray-700 p-3 rounded-lg flex justify-between items-center cursor-pointer hover:bg-gray-600" 
                                         data-city="${city}" data-location="${locationName}" data-lat="${latitude}" data-lon="${longitude}" data-aqi="${aqi}">
                                        <div>
                                            <p class="font-semibold">${locationName}</p>
                                            <p class="text-sm text-gray-400">${displayLabel}: ${displayValue}${displayUnit ? ' ' + displayUnit : ''}</p>
                                        </div>
                                        <div class="text-right flex items-center space-x-3">
                                            <div>
                                                <p class="font-semibold text-lg">${aqi}</p>
                                                <p class="text-sm ${statusColor}">${status}</p>
                                            </div>
                                            <button class="fav-toggle text-yellow-400" title="Add to favourites">${favourites.some(f => f.city === city && f.location === locationName) ? '★' : '☆'}</button>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
                currentReadingsContainer.innerHTML += cityGroupHtml;
            });

            // Add event listeners for expanding/collapsing city lists
            document.querySelectorAll('.city-header').forEach(header => {
                header.addEventListener('click', (event) => {
                    const cityLocationsDiv = header.nextElementSibling;
                    const expandIcon = header.querySelector('.expand-icon');
                    if (cityLocationsDiv.classList.contains('hidden')) {
                        cityLocationsDiv.classList.remove('hidden');
                        expandIcon.textContent = 'expand_less';
                    } else {
                        cityLocationsDiv.classList.add('hidden');
                        expandIcon.textContent = 'expand_more';
                    }
                });
            });

            // Add event listeners for individual location clicks to fetch forecast
            document.querySelectorAll('.city-locations > div').forEach(locationDiv => {
                locationDiv.addEventListener('click', async (event) => {
                    const city = locationDiv.dataset.city;
                    const locationName = locationDiv.dataset.location;
                    await fetchWeatherAndUpdateUI(locationDiv.dataset.lat, locationDiv.dataset.lon, city, locationName);
                    await fetchLocationForecast(city, locationName);
                });
            });

            // Attach favourite toggle handlers
            document.querySelectorAll('.fav-toggle').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation(); // prevent triggering the parent click
                    const parent = btn.closest('[data-city]');
                    const city = parent.dataset.city;
                    const locationName = parent.dataset.location;
                    const lat = parseFloat(parent.dataset.lat);
                    const lon = parseFloat(parent.dataset.lon);
                    const aqiVal = parent.dataset.aqi ? (isNaN(parent.dataset.aqi) ? parent.dataset.aqi : Number(parent.dataset.aqi)) : null;
                    // Toggle favourite presence
                    const exists = favourites.some(f => f.city === city && f.location === locationName);
                    if (exists) {
                        favourites = favourites.filter(f => !(f.city === city && f.location === locationName));
                        btn.textContent = '☆';
                    } else {
                        favourites.push({ city, location: locationName, lat, lon, aqi: aqiVal });
                        btn.textContent = '★';
                    }
                    renderFavourites();
                });
            });

        } else {
            currentReadingsContainer.innerHTML = '<p class="text-gray-400">No current readings available.</p>';
        }
    };

    const updateAlertsUI = (openaqData) => {
        let laAQI = null;
        let houstonAQI = null;

        // Find Los Angeles and Houston data
        let losAngeles = null;
        let houston = null;

        if (openaqData) {
            losAngeles = openaqData.find(loc => loc.city === 'Los Angeles');
            if (losAngeles) {
                laAQI = losAngeles.aqi;
            }
            houston = openaqData.find(loc => loc.city === 'Houston');
            if (houston) {
                houstonAQI = houston.aqi;
            }
        }
        
        if (laAQI && laAQI > 100) {
            document.getElementById('health-alert').querySelector('span').innerHTML = `Health Alert: Air quality is <span class="font-semibold">unhealthy sensitive</span> in ${losAngeles ? losAngeles.city : 'Los Angeles'}`;
            healthAlert.classList.remove('hidden');
        } else {
            healthAlert.classList.add('hidden');
        }

        if (houstonAQI && houstonAQI > 150) {
            document.getElementById('severe-alert').querySelector('span').innerHTML = `Severe Alert: Air quality is <span class="font-semibold">unhealthy</span> in ${houston ? houston.city : 'Houston'}`;
            severeAlert.classList.remove('hidden');
        } else {
            severeAlert.classList.add('hidden');
        }
    };

    // Removed updateAQITrendsUI as the section is removed
    const updateAQITrendsUI = (openaqData) => { /* No longer needed */ };

    const updateTempoUI = (tempoData) => {
        // The tempoData structure needs to be analyzed to determine if it's directly plottable.
        // For now, we will log it and focus on OpenAQ points for map.
        console.log('TEMPO Data (raw):', tempoData);
        // if (tempoData && tempoData.lat && tempoData.lon && tempoData.lat.length > 0) {
        //     // This would be for plotting tempo data like heatmaps or specific NO2 concentrations
        //     // Requires more complex Leaflet layers or a separate mapping library for raster data.
        // } else {
        //     // Map placeholder handled by updateMapWithOpenAQ for now.
        // }
    };

    const updateMapWithOpenAQ = (openaqData) => {
        markers.clearLayers(); // Clear existing markers

        if (openaqData && openaqData.length > 0) {
            openaqData.forEach(location => {
                const lat = location.lat;
                const lon = location.lon;
                const city = location.city || 'Unknown';
                const aqi = location.aqi || 'N/A';
                const dominantPollutant = location.dominant_pollutant || 'N/A';
                // Determine the most recent measurement for display
                const sortedLocMeasurements = (location.measurements || []).slice().sort((a, b) => new Date(b.date_utc).getTime() - new Date(a.date_utc).getTime());
                const latestLocMeasurement = sortedLocMeasurements.length > 0 ? sortedLocMeasurements[0] : null;
                const locParam = latestLocMeasurement ? (latestLocMeasurement.parameter || '') : '';
                const locUnit = latestLocMeasurement ? (latestLocMeasurement.unit || '') : '';
                const locValue = latestLocMeasurement && latestLocMeasurement.value !== undefined && latestLocMeasurement.value !== null ? (typeof latestLocMeasurement.value === 'number' ? latestLocMeasurement.value.toFixed(1) : latestLocMeasurement.value) : 'N/A';
                const paramLabelMap = { pm25: 'PM2.5', pm10: 'PM10', no2: 'NO2', o3: 'O3', co: 'CO' };
                const locLabel = paramLabelMap[locParam] || (locParam ? locParam.toUpperCase() : '');
                const status = getAQIStatus(aqi);
                const locationName = location.location || 'N/A';

                if (lat !== null && lon !== null) {
                    const markerHtmlStyles = `
                        background-color: ${getAQIMarkerColor(aqi)};
                        width: 2rem;
                        height: 2rem;
                        display: block;
                        left: -1rem;
                        top: -1rem;
                        position: relative;
                        border-radius: 2rem 2rem 0;
                        transform: rotate(45deg);
                        border: 1px solid #FFFFFF;`;
                    const icon = L.divIcon({
                        className: "my-custom-pin",
                        iconAnchor: [0, 24],
                        labelAnchor: [-6, 0],
                        popupAnchor: [0, -36],
                        html: `<span style="${markerHtmlStyles}" />`
                    });

                    const marker = L.marker([lat, lon], {icon: icon}).addTo(markers);
                    marker.bindPopup(`
                        <div class="font-sans text-gray-900">
                            <p class="font-semibold text-lg">${city}</p>
                            <p class="text-sm">Location: ${locationName}</p>
                            <p>AQI: <span class="font-bold ${getAQIStatusColor(aqi)}">${aqi} (${status})</span></p>
                            ${dominantPollutant !== 'N/A' ? `<p>Dominant Pollutant: ${dominantPollutant.toUpperCase()}</p>` : ''}
                            ${locValue !== 'N/A' ? `<p>${locLabel}: ${locValue}${locUnit ? ' ' + locUnit : ''}</p>` : ''}
                            <div class="mt-2">
                                <button class="popup-add-fav bg-yellow-400 text-gray-900 py-1 px-3 rounded-md">Add favourite</button>
                            </div>
                        </div>
                    `);
                }
            });
            // Only fit bounds if there are markers to prevent error with empty bounds
            if (markers.getLayers().length > 0) {
                map.fitBounds(markers.getBounds());
            } else {
                console.log('No markers to fit bounds for.');
            }
        } else {
            console.log('No OpenAQ data to plot on map.');
        }
    };

    const updateForecastUI = (forecastData, city, locationName) => {
        const forecastDescription = document.getElementById('forecast-description');
        const chartContainer = document.querySelector('#forecast-section .bg-gray-700');

        if (forecastData && forecastData.length > 0) {
            // Check if all data points are for the same pollutant
            const firstPollutant = forecastData[0].parameter_name;
            const allSamePollutant = forecastData.every(d => d.parameter_name === firstPollutant);

            if (allSamePollutant) {
                forecastDescription.textContent = `AQI Trend for ${firstPollutant.toUpperCase()} in ${locationName}, ${city}`;
            } else {
                // Change title from forecast to trend
                forecastDescription.textContent = `AQI Trend for ${locationName}, ${city}`;
            }

            // Use the actual 'ds' (date and time) for labels
            const labels = forecastData.map(d => new Date(d.ds).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            
            // Use data as is (not reversed), sorted by backend
            const data = forecastData.map(d => d.yhat);

            if (forecastChart) {
                forecastChart.destroy(); // Destroy existing chart before creating a new one
            }

            forecastChart = new Chart(forecastCtx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'AQI Forecast',
                        data: data,
                        borderColor: '#3B82F6', // Tailwind blue-500
                        backgroundColor: 'rgba(59, 130, 246, 0.2)',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            labels: {
                                color: '#D1D5DB' // gray-300
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    let label = context.dataset.label || '';
                                    if (label) {
                                        label += ': ';
                                    }
                                    if (context.parsed.y !== null) {
                                        label += Math.round(context.parsed.y);
                                    }
                                    // Add parameter name to tooltip if available
                                    if (forecastData[context.dataIndex] && forecastData[context.dataIndex].parameter_name) {
                                        label += ` (${forecastData[context.dataIndex].parameter_name.toUpperCase()})`;
                                    }
                                    return label;
                                }
                            }
                        },
                    },
                    scales: {
                        x: {
                            title: {
                                display: true,
                                text: 'Time',
                                color: '#D1D5DB'
                            },
                            ticks: {
                                color: '#D1D5DB' // gray-300
                            },
                            grid: {
                                color: '#4B5563' // gray-600
                            }
                        },
                        y: {
                            title: {
                                display: true,
                                text: 'AQI',
                                color: '#D1D5DB'
                            },
                            ticks: {
                                color: '#D1D5DB' // gray-300
                            },
                            grid: {
                                color: '#4B5563' // gray-600
                            }
                        }
                    }
                }
            });
        } else {
            forecastDescription.textContent = `No 24-hour AQI forecast available for ${locationName}, ${city}.`;
            if (forecastChart) forecastChart.destroy(); // Clear old chart if exists
        }
    };

    // Helper function to determine AQI status and color
    const getAQIStatus = (aqi) => {
        if (aqi === null || isNaN(aqi)) return 'N/A';
        if (aqi <= 50) return 'Good';
        if (aqi <= 100) return 'Moderate';
        if (aqi <= 150) return 'Unhealthy for Sensitive Groups';
        if (aqi <= 200) return 'Unhealthy';
        if (aqi <= 300) return 'Very Unhealthy';
        return 'Hazardous';
    };

    const getAQIStatusColor = (aqi) => {
        if (aqi === null || isNaN(aqi)) return 'text-gray-400';
        if (aqi <= 50) return 'text-green-400';
        if (aqi <= 100) return 'text-yellow-400';
        if (aqi <= 150) return 'text-orange-400';
        if (aqi <= 200) return 'text-red-400';
        if (aqi <= 300) return 'text-purple-400';
        return 'text-red-700'; // Hazardous
    };

    const getAQIMarkerColor = (aqi) => {
        if (aqi === null || isNaN(aqi)) return '#4A5568'; // gray-700
        if (aqi <= 50) return '#48BB78'; // green-500
        if (aqi <= 100) return '#ECC94B'; // yellow-500
        if (aqi <= 150) return '#ED8936'; // orange-500
        if (aqi <= 200) return '#F56565'; // red-500
        if (aqi <= 300) return '#9F7AEA'; // purple-500
        return '#E53E3E'; // red-600 Hazardous
    };

    // Initial data fetch on page load
    fetchData();
    await fetchWeatherAndUpdateUI(); // Also fetch weather on load
    renderFavourites();

    // You might want to set up an interval for refreshing data periodically
    // setInterval(fetchData, 300000); // Refresh every 5 minutes
});
