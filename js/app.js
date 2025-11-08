window.appState = {
    locations: [null, null, null],
    maxLocations: 3
};

function getLocationInputElement(index) {
  // Convert app index to actual DOM id
  return document.getElementById(`location-${index + 1}`);
}

async function initApp() {
    console.log("Initializing Weather Compare App...");
    initTheme();

    // ✅ Load saved locations if available
    const saved = loadLocationsFromCookie();

    if (saved && saved.length > 0) {
        saved.forEach((name, index) => {
            const input = document.getElementById(`location-${index + 1}`);
            if (input) input.value = name;
            updateLocation(index);  // triggers fetch & render
        });
    } else {
        // ✅ Default fallback list
        const defaults = ["21043", "53706"];
	defaults.forEach((name, index) => {
	    const input = document.getElementById(`location-${index + 1}`);
	    if (input) input.value = name;
	});
	
	// ✅ Ensure browser commits input values before running lookups
	requestAnimationFrame(() => {
	    defaults.forEach((_, index) => updateLocation(index));
	});
    }
}

async function updateLocation(index) {
  try {
    const inputEl = getLocationInputElement(index);
    const query = inputEl.value.trim();
    if (!query) return;

    console.log(`[APP] updateLocation(${index}) start -> "${query}"`);
    showLoading();

    // Only geocode here
    const geo = await geocodeLocation(query);

    // Pass minimal info; setLocation handles forecast + alerts
    await setLocation(index, {
      lat: geo.lat,
      lon: geo.lon,
      label: geo.label
    });

  } catch (err) {
    console.error(`[APP] updateLocation(${index}) ERROR:`, err);
  } finally {
    hideLoading();
    console.log(`[APP] updateLocation(${index}) end`);
  }
}

async function setLocation(index, locationInfo) {
  console.log(`[APP] setLocation(${index}) start for`, locationInfo);

  // Fetch NWS forecast package
  const forecastData = await fetchNWSForecast(locationInfo.lat, locationInfo.lon);

  const periods =
    forecastData.forecast &&
    forecastData.forecast.properties &&
    Array.isArray(forecastData.forecast.properties.periods)
      ? forecastData.forecast.properties.periods
      : [];

  const forecastZone =
    forecastData.point &&
    forecastData.point.properties &&
    forecastData.point.properties.forecastZone;

  // Fetch alerts with zone + county fallback
  const alerts = await fetchNWSAlerts(locationInfo.lat, locationInfo.lon, { pointJson: forecastData.point });

  // Compute daily aggregates
  const dailyData = getDailyRealFeelRange(periods);

  const displayCity = forecastData.city || locationInfo.label || "";
  const displayState = forecastData.state || "";
  
  appState.locations[index] = {
    ...locationInfo,
    city: displayCity,
    state: displayState,


  // Store enriched location object
/*
  appState.locations[index] = {
    ...locationInfo,
    city: forecastData.city,
    state: forecastData.state,
    periods,
    forecastZone,
    alerts,
    dailyData,
    index
  };
*/

  console.log(`[APP] setLocation(${index}) stored location, rendering table`);
  renderWeatherTable(appState.locations.filter(Boolean));
  saveLocationsToCookie();
  console.log(`[APP] setLocation(${index}) done`);
}



// ---------------- COOKIE STORAGE ----------------

function saveLocationsToCookie() {
    if (!navigator.cookieEnabled) return;

    const names = appState.locations
        .filter(Boolean)
        .map(loc => loc.name);

    document.cookie = `locations=${encodeURIComponent(names.join('|'))};path=/;max-age=${60 * 60 * 24 * 30}`;
}

function loadLocationsFromCookie() {
    if (!navigator.cookieEnabled) return null;

    const match = document.cookie.match(/(?:^|;\s*)locations=([^;]+)/);
    if (!match) return null;

    const decoded = decodeURIComponent(match[1]);
    return decoded.split('|').map(name => name.trim()).filter(Boolean);
}


window.addEventListener('DOMContentLoaded', initApp);
