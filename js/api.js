/**
 * Application state and initialization
 */

window.appState = {
    locations: [null, null, null],
    maxLocations: 3
};

/**
 * Initialize application
 */
async function initApp() {
    console.log('Initializing Weather Compare App...');
    
    initTheme();
    showLoading(true);
    
    try {
        // Get user's initial location
        const userLocation = await getUserLocation();
        console.log('User location detected:', userLocation);
        
        // Set as first location
        await setLocation(0, userLocation);
        updateLocationInput(0, userLocation.name);
        
        showLoading(false);
    } catch (error) {
        console.error('Initialization error:', error);
        showError('Unable to load initial weather data. Please try again.');
        showLoading(false);
    }
}

/**
 * Set location data for a specific slot
 */
async function setLocation(index, locationInfo) {
    try {
        showLoading(true);
        clearInputError(index);
        
        // Fetch weather data
        const forecast = await fetchNWSForecast(locationInfo.lat, locationInfo.lon);
        const alerts = await fetchNWSAlerts(locationInfo.lat, locationInfo.lon);
        
        // Calculate daily RealFeel ranges
        const dailyData = getDailyRealFeelRange(forecast);
        
        // Store in app state
        appState.locations[index] = {
            ...locationInfo,
            forecast,
            alerts,
            dailyData,
            index
        };
        
        // Re-render table
        renderWeatherTable(appState.locations.filter(loc => loc !== null));
        showLoading(false);
        
    } catch (error) {
        console.error(`Error setting location ${index}:`, error);
        showError(error.message, index);
        showLoading(false);
        throw error;
    }
}

/**
 * Update location from user input
 */
async function updateLocation(index) {
    const input = document.getElementById(`location-${index + 1}`);
    const locationString = input.value.trim();
    
    if (!locationString) {
        showError('Please enter a city name or ZIP code', index);
        return;
    }
    
    try {
        clearInputError(index);
        showLoading(true);
        
        // Geocode the input
        const locationInfo = await geocodeLocation(locationString);
        console.log('Geocoded location:', locationInfo);
        
        // Set the location
        await setLocation(index, locationInfo);
        
        // Update input with formatted name
        input.value = locationInfo.name;
        
    } catch (error) {
        console.error('Update location error:', error);
        showError(error.message, index);
    } finally {
        showLoading(false);
    }
}

/**
 * Remove a location
 */
function removeLocation(index) {
    appState.locations[index] = null;
    
    const input = document.getElementById(`location-${index + 1}`);
    if (input) input.value = '';
    
    clearInputError(index);
    renderWeatherTable(appState.locations.filter(loc => loc !== null));
}

/**
 * Handle enter key in input fields
 */
document.addEventListener('DOMContentLoaded', () => {
    for (let i = 0; i < 3; i++) {
        const input = document.getElementById(`location-${i + 1}`);
        if (input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    updateLocation(i);
                }
            });
        }
    }
});

// Initialize on page load
window.addEventListener('DOMContentLoaded', initApp);