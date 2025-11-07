var API_TIMEOUT = 5000;

/**
 * Fetch with timeout
 */
function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const headers = Object.assign(
    {},
    { "Accept": "application/geo+json" }, // required for NWS
    options.headers || {}
  );

  const finalOptions = Object.assign({}, options, {
    headers,
    signal: controller.signal
  });

  return fetch(url, finalOptions)
    .finally(() => clearTimeout(timeoutId));
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
    const API_KEY = "f00c6306f9ff9e67a6562b12f1d91f82";

    let city = cityName.trim();
    let state = null;

    // Detect "City, ST" format
    const match = city.match(/^(.+?),\s*([A-Za-z]{2})$/);
    if (match) {
        city = match[1].trim();
        state = match[2].toUpperCase();
    }

    // Build query
    // If we have state:   q=City,ST,US
    // If not:             q=City,US (still strongly biased to U.S.)
    const q = state ? `${city},${state},US` : `${city},US`;

    const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(q)}&limit=5&appid=${API_KEY}`;
    const response = await fetchWithTimeout(url);
    const data = await response.json();

    if (!data.length) throw new Error(`Unable to find location: ${cityName}`);

    const r = data[0];
    return {
        name: `${r.name}, ${r.state || 'US'}`,
        lat: r.lat,
        lon: r.lon,
        state: r.state
    };
}


async function geocodeLocation(locationName) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locationName)}`;
  const resp = await fetch(url);
  const data = await resp.json();
  if (!data || data.length === 0) throw new Error("Location not found");
  return {
    lat: parseFloat(data[0].lat),
    lon: parseFloat(data[0].lon)
  };
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
async function fetchNWSAlerts(lat, lon) {
    try {
	// 1) Get zone + county info from Points API (always reliable)
	const pointsResp = await fetchWithTimeout(`https://api.weather.gov/points/${lat},${lon}`, {
	    headers: { 'User-Agent': 'WeatherCompareApp' }
	});
	const pointsData = await pointsResp.json();

	const forecastZone = pointsData.properties?.forecastZone?.split('/').pop() || "";
	const countyCode = pointsData.properties?.county?.split('/').pop() || "";
	const firewxzone = pointsData.properties?.fireWeatherZone?.split('/').pop() || forecastZone;

	// 2) Get active alerts for the point
	const alertsResp = await fetchWithTimeout(
	    `https://api.weather.gov/alerts/active?point=${lat},${lon}`,
	    { headers: { 'User-Agent': 'WeatherCompareApp' } }
	);
	if (!alertsResp.ok) return [];
	const alertsData = await alertsResp.json();

	return (alertsData.features || []).map(alert => {
	    const p = alert.properties || {};

	    const local_place1_raw = (p.areaDesc || "").trim();
	    const local_place1 = encodeURIComponent(local_place1_raw);
	    const product1 = encodeURIComponent(p.event || "");

	    const latStr = Number(lat).toFixed(4);
	    const lonStr = Number(lon).toFixed(4);

	    const url =
		`https://forecast.weather.gov/showsigwx.php?` +
		`warnzone=${forecastZone}` +
		`&warncounty=${countyCode}` +
		`&firewxzone=${firewxzone}` +
		(local_place1 ? `&local_place1=${local_place1}` : "") +
		(product1 ? `&product1=${product1}` : "") +
		`&lat=${latStr}&lon=${lonStr}`;

		return {
		    headline: p.headline,
		    severity: p.severity,
		    url,
		    event: p.event,
		    
		    // ✅ Add these two lines:
		    start: new Date(p.onset || p.effective || p.sent || Date.now()),
		    end: new Date(p.ends || p.expires || p.onset || Date.now())
		};

	});
    } catch (err) {
	console.warn("Failed to fetch alerts:", err);
	return [];
    }
}

