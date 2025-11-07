var API_TIMEOUT = 5000;

/**
 * Fetch with timeout
 */
// api.js (or wherever fetchWithTimeout lives)
export async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error("Request timed out")), timeoutMs);

  // Normalize url to string for tests like startsWith
  const urlStr = typeof url === "string" ? url : url.toString();

  // Start with any headers the caller passed
  const callerHeaders = new Headers(options.headers || {});

  // Build defaults for NWS only
  const nwsDefaults = new Headers();
  if (urlStr.startsWith("https://api.weather.gov")) {
    // Always safe in browser:
    nwsDefaults.set("Accept", "application/geo+json");
    // Only set User-Agent when not running in a browser (browsers forbid it)
    const runningInBrowser = typeof window !== "undefined" && typeof window.document !== "undefined";
    if (!runningInBrowser) {
      // Include contact info per NWS guidance
      nwsDefaults.set("User-Agent", "HaHaWeather/1.0 (+https://yourdomain.example/contact)");
    }
  }

  // Merge: defaults first, then caller (caller can override)
  const mergedHeaders = new Headers(nwsDefaults);
  for (const [k, v] of callerHeaders.entries()) mergedHeaders.set(k, v);

  // Final init object; our AbortController takes precedence
  const init = {
    ...options,
    headers: mergedHeaders,
    signal: controller.signal,
  };

  try {
    const resp = await fetch(url, init);
    return resp;
  } finally {
    clearTimeout(timeoutId);
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

