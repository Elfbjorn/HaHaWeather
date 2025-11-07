var API_TIMEOUT = 5000;

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT);
    
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(timeout);
        return response;
    } catch (error) {
        clearTimeout(timeout);
        throw error;
    }
}

/**
 * Get user's location via IP
 */
async function getUserLocation() {
    try {
        const response = await fetchWithTimeout('http://ip-api.com/json/');
        if (!response.ok) throw new Error('IP-API failed');
        
        const data = await response.json();
        return {
            name: `${data.city}, ${data.regionName}`,
            lat: data.lat,
            lon: data.lon,
            state: data.regionName
        };
    } catch (error) {
        console.warn('IP geolocation failed, using Chicago default', error);
        return {
            name: 'Chicago, IL',
            lat: 41.8781,
            lon: -87.6298,
            state: 'Illinois'
        };
    }
}

/**
 * Check if input is a ZIP code
 */
function isZipCode(input) {
    return /^\d{5}(-\d{4})?$/.test(input.trim());
}

/**
 * Geocode ZIP code using zippopotam.us
 */
async function geocodeZipCode(zip) {
    try {
        const response = await fetchWithTimeout(`https://api.zippopotam.us/us/${zip}`);
        
        if (!response.ok) {
            throw new Error('ZIP code not found');
        }
        
        const data = await response.json();
        const place = data.places[0];
        
        return {
            name: `${place['place name']}, ${place['state abbreviation']}`,
            lat: parseFloat(place.latitude),
            lon: parseFloat(place.longitude),
            state: place.state
        };
    } catch (error) {
        throw new Error(`Invalid ZIP code: ${zip}`);
    }
}

/**
 * Geocode city name using Open-Meteo
 */
async function geocodeCityName(cityName) {
    try {
        // Clean up input - remove state abbreviations if present
        let searchTerm = cityName;
        const stateMatch = cityName.match(/,\s*([A-Z]{2})\s*$/i);
        if (stateMatch) {
            // Extract just the city name for better search results
            searchTerm = cityName.replace(/,\s*[A-Z]{2}\s*$/i, '').trim();
        }
        
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(searchTerm)}&count=10&language=en&format=json`;
        const response = await fetchWithTimeout(url);
        
        if (!response.ok) throw new Error('Geocoding failed');
        
        const data = await response.json();
        if (!data.results || data.results.length === 0) {
            throw new Error('Location not found');
        }
        
        // If user provided a state, try to match it
        let result;
        if (stateMatch) {
            const stateAbbrev = stateMatch[1].toUpperCase();
            result = data.results.find(r => 
                r.country_code === 'US' && 
                (r.admin1?.toUpperCase().includes(stateAbbrev) || 
                 r.admin1_id?.toString().includes(stateAbbrev))
            );
        }
        
        // Fallback: prioritize US results
        if (!result) {
            result = data.results.find(r => r.country_code === 'US');
        }
        
        // Last resort: use first result
        if (!result) {
            result = data.results[0];
        }
        
        return {
            name: `${result.name}, ${result.admin1 || result.country}`,
            lat: result.latitude,
            lon: result.longitude,
            state: result.admin1
        };
    } catch (error) {
        throw new Error(`Unable to find location: ${cityName}`);
    }
}

/**
 * Geocode city name or ZIP code
 */
async function geocodeLocation(input) {
    const cleanInput = input.trim();
    
    if (isZipCode(cleanInput)) {
        return await geocodeZipCode(cleanInput.substring(0, 5));
    } else {
        return await geocodeCityName(cleanInput);
    }
}

/**
 * Fetch NWS forecast for coordinates
 */
async function fetchNWSForecast(lat, lon) {
    try {
        // Step 1: Get gridpoint
        const pointsUrl = `https://api.weather.gov/points/${lat},${lon}`;
        const pointsResponse = await fetchWithTimeout(pointsUrl, {
            headers: { 'User-Agent': 'WeatherCompareApp' }
        });
        
        if (!pointsResponse.ok) {
            throw new Error('Location outside NWS coverage (U.S. only)');
        }
        
        const pointsData = await pointsResponse.json();
        const forecastUrl = pointsData.properties.forecast;
        
        // Step 2: Get forecast
        const forecastResponse = await fetchWithTimeout(forecastUrl, {
            headers: { 'User-Agent': 'WeatherCompareApp' }
        });
        
        if (!forecastResponse.ok) throw new Error('Forecast unavailable');
        
        const forecastData = await forecastResponse.json();
        return forecastData.properties.periods;
    } catch (error) {
        throw new Error(`Weather data unavailable: ${error.message}`);
    }
}

/**
 * Fetch NWS active alerts
 */
async function fetchNWSAlerts(lat, lon) {
    try {
        const url = `https://api.weather.gov/alerts/active?point=${lat},${lon}`;
        const response = await fetchWithTimeout(url, {
            headers: { 'User-Agent': 'WeatherCompareApp' }
        });
        
        if (!response.ok) return [];
        
        const data = await response.json();
        return data.features.map(feature => ({
            headline: feature.properties.headline,
            severity: feature.properties.severity,
            url: feature.properties.url || `https://www.weather.gov/`
        }));
    } catch (error) {
        console.warn('Alert fetch failed', error);
        return [];
    }
}
