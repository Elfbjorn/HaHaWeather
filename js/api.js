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
 * IP-based default location
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
        return {
            name: 'Chicago, IL',
            lat: 41.8781,
            lon: -87.6298,
            state: 'Illinois'
        };
    }
}

function isZipCode(input) {
    return /^\d{5}(-\d{4})?$/.test(input.trim());
}

/**
 * ZIP → lat/lon
 */
async function geocodeZipCode(zip) {
    const response = await fetchWithTimeout(`https://api.zippopotam.us/us/${zip}`);
    if (!response.ok) throw new Error(`Invalid ZIP code: ${zip}`);
    const data = await response.json();
    const place = data.places[0];

    return {
        name: `${place['place name']}, ${place['state abbreviation']}`,
        lat: parseFloat(place.latitude),
        lon: parseFloat(place.longitude)
    };
}

/**
 * City → lat/lon (OpenWeather geocoder)
 */
async function geocodeCityName(cityName) {
    const API_KEY = "<YOUR_OPENWEATHER_API_KEY>";
    const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(cityName)}&limit=5&appid=${API_KEY}`;
    const response = await fetchWithTimeout(url);
    const data = await response.json();
    if (!data.length) throw new Error(`Unable to find location: ${cityName}`);
    const r = data[0];
    return { name: `${r.name}, ${r.state || r.country}`, lat: r.lat, lon: r.lon };
}

async function geocodeLocation(input) {
    const clean = input.trim();
    if (isZipCode(clean)) return geocodeZipCode(clean.substring(0, 5));
    return geocodeCityName(clean);
}

/**
 * Fetch forecast + zone (CRITICAL FIX)
 */
async function fetchNWSForecast(lat, lon) {
    const pointsResponse = await fetchWithTimeout(`https://api.weather.gov/points/${lat},${lon}`, {
        headers: { 'User-Agent': 'WeatherCompareApp' }
    });
    const pointsData = await pointsResponse.json();

    const forecastUrl = pointsData.properties.forecast;
    const forecastZone = pointsData.properties.forecastZone.split('/').pop();

    const forecastResponse = await fetchWithTimeout(forecastUrl, {
        headers: { 'User-Agent': 'WeatherCompareApp' }
    });
    const forecastData = await forecastResponse.json();

    return {
        periods: forecastData.properties.periods,
        forecastZone
    };
}

/**
 * Fetch alerts using the correct zone (CRITICAL FIX)
 */
async function fetchNWSAlerts(lat, lon, forecastZone) {
    const url = `https://api.weather.gov/alerts/active?point=${lat},${lon}`;
    const response = await fetchWithTimeout(url, {
        headers: { 'User-Agent': 'WeatherCompareApp' }
    });
    if (!response.ok) return [];

    const data = await response.json();
    return data.features.map(f => ({
        headline: f.properties.headline,
        severity: f.properties.severity,
        url: `https://forecast.weather.gov/showsigwx.php?warnzone=${forecastZone}`,
        start: f.properties.onset,
        end: f.properties.ends
    }));
}
