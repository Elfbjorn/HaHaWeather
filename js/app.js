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
        const defaults = ["Miami, FL", "Minneapolis, MN", "San Francisco, CA"];
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
    const input = document.getElementById(`location-${index + 1}`);
    const locationString = input?.value?.trim();
    if (!locationString) {
        showError('Please enter a city name or ZIP code', index);
        return;
    }

    console.log(`[APP] updateLocation(${index}) start -> "${locationString}"`);
    showLoading(); // always call showLoading synchronously

    try {
        clearInputError(index);

        // Important: propagate any errors to the caller (do not swallow)
        const locationInfo = await geocodeLocation(locationString);
        await setLocation(index, locationInfo);

        // success: update the input with canonical name
        input.value = locationInfo.name;
        console.log(`[APP] updateLocation(${index}) succeeded`);
    } catch (err) {
        // Log the actual error so we can debug root cause
        console.error(`[APP] updateLocation(${index}) ERROR:`, err);
        // Surface the error to the user (do not hide it)
        showError(err.message || 'Unknown error', index);
        // rethrow is optional; we keep it as handled here but not masked
    } finally {
        // Always hide loading. Finally always runs even after exceptions.
        hideLoading();
        console.log(`[APP] updateLocation(${index}) end`);
    }
}

async function setLocation(index, locationInfo) {
    console.log(`[APP] setLocation(${index}) start for`, locationInfo);
    // Do not call showLoading/hideLoading here — handled at the caller.
    // Fetch forecast and extract periods + zone
    const { periods, forecastZone } = await fetchNWSForecast(locationInfo.lat, locationInfo.lon);

    const forecast = Array.isArray(periods) ? periods : [];
    const alerts = await fetchNWSAlerts(locationInfo.lat, locationInfo.lon, forecastZone, locationInfo.name);

    // compute daily aggregates — this expects an array; we already validated
    const dailyData = getDailyRealFeelRange(forecast);

    // store everything atomically
    appState.locations[index] = {
        ...locationInfo,
        forecast,
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
