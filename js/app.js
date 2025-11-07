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
    const locationString = input.value.trim();
    if (!locationString) return;

    try {
        clearInputError(index);
        showLoading();

        const locationInfo = await geocodeLocation(locationString);

        await setLocation(index, locationInfo);

        input.value = locationInfo.name;
    } catch (error) {
        showError(error.message, index);
    } finally {
        hideLoading();
    }
}

async function setLocation(index, locationInfo) {
    const { periods, forecastZone } = await fetchNWSForecast(locationInfo.lat, locationInfo.lon);

    // Ensure forecast is a valid array before doing anything else
    const forecast = Array.isArray(periods) ? periods : [];

    const alerts = await fetchNWSAlerts(locationInfo.lat, locationInfo.lon, forecastZone);

    const dailyData = getDailyRealFeelRange(forecast);

    appState.locations[index] = {
        ...locationInfo,
        forecast,
        forecastZone,
        alerts,
        dailyData,
        index
    };

    renderWeatherTable(appState.locations.filter(l => l));
}

window.addEventListener('DOMContentLoaded', initApp);
