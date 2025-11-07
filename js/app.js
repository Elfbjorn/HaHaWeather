window.appState = {
    locations: [null, null, null],
    maxLocations: 3
};

async function initApp() {
    console.log('Initializing Weather Compare App...');
    initTheme();

    document.querySelectorAll('.location-input').forEach((input, index) => {
        input.addEventListener('keypress', e => {
            if (e.key === 'Enter') updateLocation(index);
        });
    });
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

    if (!forecastResult || !Array.isArray(forecastResult.periods)) {
        // Throw so caller's catch can handle and we don't proceed with bad data
        throw new Error('Invalid forecast data returned from NWS');
    }

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
    console.log(`[APP] setLocation(${index}) done`);
}

window.addEventListener('DOMContentLoaded', initApp);
