// script.js

document.addEventListener('DOMContentLoaded', () => {
    const lastUpdatedSpan = document.getElementById('last-updated');
    const refreshButton = document.getElementById('refresh-button');

    const healthAlert = document.getElementById('health-alert');
    const severeAlert = document.getElementById('severe-alert');

    // Initialize Leaflet Map
    const map = L.map('map').setView([20, 0], 2); // Centered globally, zoom level 2

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    let markers = L.featureGroup().addTo(map);

    // Initialize Chart.js for 24h Forecast
    const forecastCtx = document.getElementById('forecast-chart').getContext('2d');
    let forecastChart; // Declare chart globally to be able to update it

    // Function to update the last updated time
    const updateLastUpdatedTime = () => {
        const now = new Date();
        lastUpdatedSpan.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    };

    // Initial update
    updateLastUpdatedTime();

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
            fetchWeatherAndUpateUI(); // Call separately for weather

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
    const fetchWeatherAndUpateUI = async () => {
        try {
            const weatherResponse = await fetch('/api/weather');
            const weatherData = await weatherResponse.json();
            console.log('Weather Data:', weatherData);
            updateWeatherUI(weatherData);
        } catch (error) {
            console.error('Error fetching weather data:', error);
        }
    };

    // Functions to update specific UI sections
    const updateWeatherUI = (weatherData) => {
        // Based on backend's weather_fetch.py and app.py, it returns a dict with 'temperature', 'wind_speed', 'humidity', 'pressure'.
        document.getElementById('weather-temperature').textContent = `${weatherData.temperature}°C`;
        document.getElementById('weather-wind').textContent = `${weatherData.windspeed} km/h ${weatherData.winddirection}`;
        document.getElementById('weather-humidity').textContent = `${weatherData.raw.current.relativehumidity_2m}%`;
        document.getElementById('weather-pressure').textContent = `${weatherData.raw.current.surface_pressure} hPa`;
        document.getElementById('weather-last-updated').textContent = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    };

    const updateCurrentReadingsUI = (openaqData) => {
        const currentReadingsContainer = document.querySelector('#current-readings-section .space-y-3');
        currentReadingsContainer.innerHTML = ''; // Clear existing readings

        if (openaqData && openaqData.length > 0) {
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
                                // Find the latest PM2.5 measurement after sorting
                                const pm25Measurement = sortedMeasurements.find(m => m.parameter === 'pm25');
                                const pm25Value = pm25Measurement ? pm25Measurement.value.toFixed(1) : 'N/A';
                                const locationName = location.location || 'N/A';
                                const status = getAQIStatus(aqi);
                                const statusColor = getAQIStatusColor(aqi);

                                return `
                                    <div class="bg-gray-700 p-3 rounded-lg flex justify-between items-center cursor-pointer hover:bg-gray-600" 
                                         data-city="${city}" data-location="${locationName}">
                                        <div>
                                            <p class="font-semibold">${locationName}</p>
                                            <p class="text-sm text-gray-400">PM2.5: ${pm25Value}µg/m³</p>
                                        </div>
                                        <div class="text-right">
                                            <p class="font-semibold text-lg">${aqi}</p>
                                            <p class="text-sm ${statusColor}">${status}</p>
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
                locationDiv.addEventListener('click', (event) => {
                    const city = locationDiv.dataset.city;
                    const locationName = locationDiv.dataset.location;
                    fetchLocationForecast(city, locationName);
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
                const pm25Measurement = location.measurements.find(m => m.parameter === 'pm25');
                const pm25Value = pm25Measurement ? pm25Measurement.value.toFixed(1) : 'N/A';
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
                            <p class="text-sm">Location: ${locationName}</p> <!-- Add location name here -->
                            <p>AQI: <span class="font-bold ${getAQIStatusColor(aqi)}">${aqi} (${status})</span></p>
                            ${dominantPollutant !== 'N/A' ? `<p>Dominant Pollutant: ${dominantPollutant.toUpperCase()}</p>` : ''}
                            ${pm25Value !== 'N/A' ? `<p>PM2.5: ${pm25Value} µg/m³</p>` : ''}
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
    fetchWeatherAndUpateUI(); // Also fetch weather on load

    // You might want to set up an interval for refreshing data periodically
    // setInterval(fetchData, 300000); // Refresh every 5 minutes
}); 