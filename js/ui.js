/**
 * UI rendering and interaction handlers
 */

function renderWeatherTable(locationsData) {
    const container = document.getElementById('weather-table-container');
    
    if (!locationsData || locationsData.length === 0) {
        container.innerHTML = '<p class="no-data">No weather data available</p>';
        return;
    }
    
    // Get all unique dates from all locations (first 7 days)
    const allDates = new Set();
    locationsData.forEach(location => {
        if (location.forecast) {
            const dates = Object.keys(location.dailyData).slice(0, 7);
            dates.forEach(date => allDates.add(date));
        }
    });
    
    const sortedDates = Array.from(allDates).sort().slice(0, 7);
    
    // Build table HTML
    let tableHTML = '<table class="weather-table"><thead><tr><th>Date</th>';
    
    // Header row with location names
    locationsData.forEach(location => {
        const alertIcon = location.alerts && location.alerts.length > 0 
            ? `<span class="alert-icon" onclick="showAlerts(${location.index})" title="Active weather alerts">⚠️</span>`
            : '';
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
                const cellAlert = (location.alerts && location.alerts.length > 0)
  ? `<a class="alert-icon" href="${location.alerts[0].url}" target="_blank" rel="noopener" title="${location.alerts[0].headline}">⚠️</a>`
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

function showAlerts(locationIndex) {
    const location = window.appState.locations[locationIndex];
    if (!location || !location.alerts || location.alerts.length === 0) return;
    
    // Open first alert URL in new tab
    window.open(location.alerts[0].url, '_blank');
}

function showError(message, inputIndex = null) {
    if (inputIndex !== null) {
        const errorElement = document.getElementById(`error-${inputIndex + 1}`);
        if (errorElement) {
            errorElement.textContent = message;
            setTimeout(() => {
                errorElement.textContent = '';
            }, 5000);
        }
    } else {
        const globalError = document.getElementById('error-global');
        globalError.textContent = message;
        globalError.classList.remove('hidden');
        setTimeout(() => {
            globalError.classList.add('hidden');
        }, 8000);
    }
}

function showLoading(show) {
    const loading = document.getElementById('loading');
    loading.style.display = show ? 'block' : 'none';
}

function clearInputError(inputIndex) {
    const errorElement = document.getElementById(`error-${inputIndex + 1}`);
    if (errorElement) {
        errorElement.textContent = '';
    }
}

function updateLocationInput(index, locationName) {
    const input = document.getElementById(`location-${index + 1}`);
    if (input) {
        input.value = locationName;
    }
}

/**
 * Theme management
 */
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'system';
    setTheme(savedTheme);
    
    document.getElementById('theme-light').addEventListener('click', () => setTheme('light'));
    document.getElementById('theme-dark').addEventListener('click', () => setTheme('dark'));
    document.getElementById('theme-system').addEventListener('click', () => setTheme('system'));
}

function setTheme(theme) {
    localStorage.setItem('theme', theme);
    
    // Remove active class from all buttons
    document.querySelectorAll('.theme-toggle button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Add active class to selected button
    document.getElementById(`theme-${theme}`).classList.add('active');
    
    // Apply theme
    if (theme === 'system') {
        document.documentElement.removeAttribute('data-theme');
    } else {
        document.documentElement.setAttribute('data-theme', theme);
    }
}
