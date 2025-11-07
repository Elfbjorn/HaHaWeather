window.appState = {
    locations: [null, null, null],
    maxLocations: 3
};

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
    const query = locationInputs[index].value.trim();
    const geo = await geocodeLocation(query);

    console.log("[APP] geocoded:", geo);

    // Pass ONLY the geocoded info.
    const loc = {
      lat: geo.lat,
      lon: geo.lon,
      label: geo.label
    };

    await setLocation(index, loc);

  } catch (err) {
    console.error("[APP] updateLocation ERROR:", err);
    hideLoading();
  }
}


async function setLocation(index, locationInfo) {
  console.log(`[APP] setLocation(${index}) start for`, locationInfo);

  // 1) Fetch forecast package
  const forecastData = await fetchNWSForecast(locationInfo.lat, locationInfo.lon);

  // Extract the periods array
  const periods =
    forecastData.forecast &&
    forecastData.forecast.properties &&
    Array.isArray(forecastData.forecast.properties.periods)
      ? forecastData.forecast.properties.periods
      : [];

  // Extract zone for alerts
  const forecastZone = forecastData.point &&
                      forecastData.point.properties &&
                      forecastData.point.properties.forecastZone;

  // 2) Fetch alerts
  const alerts = await fetchNWSAlerts(locationInfo.lat, locationInfo.lon, { pointJson: forecastData.point });

  // 3) Compute daily aggregates (unchanged)
  const dailyData = getDailyRealFeelRange(periods);

  // 4) Store final enriched object
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

  console.log(`[APP] setLocation(${index}) stored location, rendering table`);
  renderWeatherTable(appState.locations.filter(l => l !== null));
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
