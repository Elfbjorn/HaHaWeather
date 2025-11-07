/**
 * UI rendering and interaction handlers
 */

function renderWeatherTable(locationsData) {
    const container = document.getElementById('weather-table-container');
    
    if (!locationsData || locationsData.length === 0) {
        container.innerHTML = '<p class="no-data">No weather data available</p>';
        return;
    }

    // Collect unique dates
    const allDates = new Set();
    locationsData.forEach(location => {
        if (location.forecast) {
            const dates = Object.keys(location.dailyData).slice(0, 7);
            dates.forEach(date => allDates.add(date));
        }
    });

    const sortedDates = Array.from(allDates).sort().slice(0, 7);

    // Start table
    let tableHTML = '<table class="weather-table"><thead><tr><th>Date</th>';

    // Header row: location names only (no icons here)
    locationsData.forEach(location => {
        tableHTML += `<th>${location.name}</th>`;
    });

    tableHTML += '</tr></thead><tbody>';

    // Data rows for each date
    sortedDates.forEach(dateStr => {
        const date = new Date(dateStr + 'T12:00:00');
        const dateLabel = formatDateLabel(date);

        tableHTML += `<tr><td><strong>${dateLabel}</strong></td>`;

        locationsData.forEach(location => {
            if (location.dailyData && location.dailyData[dateStr]) {
                const day = location.dailyData[dateStr];
                const period = location.forecast.find(p => p.startTime.startsWith(dateStr));

                // Check alerts for this specific day
                const alertForDay = (location.alerts || []).find(a => alertAppliesOnDate(a, dateStr));
                const cellAlert = alertForDay
                    ? `<a class="alert-icon" href="${alertForDay.url}" target="_blank" rel="noopener" title="${alertForDay.headline}">⚠️</a>`
                    : '';

                tableHTML += `<td>${cellAlert}${renderWeatherCell(day, period)}</td>`;
            } else {
                tableHTML += '<td>—</td>';
            }
        });

        tableHTML += '</tr>';
    });

    tableHTML += '</tbody></table>';
    container.innerHTML = tableHTML;
}

/**
 * Determine whether an alert overlaps the given date (YYYY-MM-DD)
 */
function alertAppliesOnDate(alert, dateStr) {
    const dayStart = new Date(`${dateStr}T00:00:00`);
    const dayEnd   = new Date(`${dateStr}T23:59:59`);

    const start = alert.start ? new Date(alert.start) : null;
    const end   = alert.end   ? new Date(alert.end)   : null;

    const startsBeforeDayEnds = !start || start <= dayEnd;
    const endsAfterDayStarts  = !end   || end   >= dayStart;

    return startsBeforeDayEnds && endsAfterDayStarts;
}

function renderWeatherCell(dayData, period) {
    const iconUrl = period?.icon || 'https://api.weather.gov/icons/land/day/sct?size=medium';
    const condition = period?.shortForecast || '';

    return `
        <div class="weather-cell">
            <img src="${iconUrl}" alt="${condition}" title="${condition}" />
            <span class="temp">${dayData.high}°/${dayData.low}°</span>
            <span class="realfeel">(Feels ${dayData.realFeelHigh}°/${dayData.realFeelLow}°)</span>
        </div>
    `;
}

function formatDateLabel(date) {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    today.setHours(0, 0, 0, 0);
    tomorrow.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);

    if (date.getTime() === today.getTime()) return 'Today';
    if (date.getTime() === tomorrow.getTime()) return 'Tomorrow';

    const options = { weekday: 'short', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

function clearInputError(index) {
    const errorElement = document.getElementById(`error-${index + 1}`);
    if (errorElement) {
        errorElement.textContent = '';
    }
}

function showError(message, inputIndex = null) {
    if (inputIndex !== null) {
        const errorElement = document.getElementById(`error-${inputIndex + 1}`);
        if (errorElement) {
            errorElement.textContent = message;
            setTimeout(() => { errorElement.textContent = ''; }, 5000);
        }
    } else {
        const globalError = document.getElementById('error-global');
        globalError.textContent = message;
        globalError.classList.remove('hidden');
        setTimeout(() => { globalError.classList.add('hidden'); }, 5000);
    }
}

function updateLocationInput(index, locationName) {
    const input = document.getElementById(`location-${index + 1}`);
    if (input) input.value = locationName;
}

/**
 * Theme management
 */
function setTheme(theme) {
    localStorage.setItem('theme', theme);

    document.querySelectorAll('.theme-toggle button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    document.getElementById(`theme-${theme}`).classList.add('active');
    
    if (theme === 'system') {
        document.documentElement.removeAttribute('data-theme');
    } else {
        document.documentElement.setAttribute('data-theme', theme);
    }
}
