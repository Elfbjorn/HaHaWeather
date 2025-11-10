/**
 * ui.js — COMPLETE, DROP-IN
 * - Works with your current api.js (NWS-only) and app.js flow
 * - Renders 3-column compare table with cell-level alert icons
 * - No ES modules; browser-safe
 * - Includes theme + loading helpers
 */

/* =========================
   Helpers
   ========================= */

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function pad2(n) { return String(n).padStart(2, "0"); }

function formatDateKey(dateLike) {
  const d = new Date(dateLike);
  
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

function formatDateLabel(dateLike) {
  // If dateLike matches YYYY-MM-DD, parse as local date to avoid timezone bug
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateLike)) {
    const [year, month, day] = dateLike.split('-').map(Number);
    return new Date(year, month - 1, day)
      .toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }
  const d = new Date(dateLike);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * Returns true if any time on dateKey (00:00-23:59) overlaps alert window.
 * Accepts effective/onset/sent + expires/ends fallbacks.
 */
function alertAppliesOnDate(alert, dateKey) {
  if (!alert || !alert.properties) return false;

  const p = alert.properties;
  const eff = p.effective || p.onset || p.sent;
  const exp = p.expires  || p.ends;

  // Local day boundary for the calendar date represented by dateKey
  const y = Number(dateKey.slice(0, 4));
  const m = Number(dateKey.slice(5, 7)) - 1; // zero-indexed month
  const d = Number(dateKey.slice(8, 10));

  const dayStart = new Date(y, m, d, 0, 0, 0);     // local midnight
  const dayEnd   = new Date(y, m, d, 23, 59, 59);  // local 23:59:59

  // Parse alert timestamps normally (they include timezone offsets)
  const start = eff ? new Date(eff) : dayStart;
  const end   = exp ? new Date(exp) : dayEnd;

  // Overlap logic: alert applies if the date range intersects
  const applies = (dayStart <= end) && (dayEnd >= start);
  
  if (applies) {
    console.log(`[UI] Alert applies to ${dateKey}: ${p.event || p.headline || 'Alert'}`);
  }
  
  return applies;
}

/**
 * Converts getDailyRealFeelRange output into a date->object map.
 * Supports either:
 *  - Array form: [{date, high, low, realFeelHigh, realFeelLow, ...}, ...]
 *  - Map form:   {"YYYY-MM-DD": {high, low, realFeelHigh, realFeelLow, ...}, ...}
 */
function normalizeDailyMap(dailyData) {
  if (!dailyData) return {};
  if (Array.isArray(dailyData)) {
    const m = {};
    for (const d of dailyData) {
      // accept Date or ISO in d.date
      const key = formatDateKey(d.date);
      m[key] = d;
    }
    return m;
  }
  // assume it is already map keyed by YYYY-MM-DD - return as-is, don't reformat keys!
  return dailyData;
}

/**
 * Extracts a canonical list of date keys we will render as rows.
 * Priority: the first location with dailyData; if absent, derive from periods.
 */
function deriveDateKeys(locations) {
  const keySet = new Set();

  // gather keys from dailyData maps (preferred)
  for (const loc of locations) {
    const dm = normalizeDailyMap(loc && loc.dailyData);
    if (dm && typeof dm === "object") {
      // Keys are already formatted as YYYY-MM-DD, don't reformat them!
      for (const k of Object.keys(dm)) {
        keySet.add(k); // USE KEY DIRECTLY, don't call formatDateKey again!
      }
    }
  }

  // fallback: derive from periods
  for (const loc of locations) {
    if (loc && Array.isArray(loc.periods)) {
      for (const p of loc.periods) {
        const k = formatDateKey(p.startTime || p.start || p.date || new Date());
        keySet.add(k);
      }
    }
  }

  // final filter: today and beyond only (string compare works for YYYY-MM-DD)
  const todayKey = formatDateKey(new Date());
  console.log("[UI] Today's key for filtering:", todayKey);
  console.log("[UI] All keys before filtering:", Array.from(keySet).sort());
  
  const finalKeys = Array.from(keySet)
    .filter(k => k >= todayKey)
    .sort((a, b) => a.localeCompare(b));

  console.log("[UI] FINAL DATE KEYS after filtering:", finalKeys);
  return finalKeys;
}

/* =========================
   Cell rendering
   ========================= */

/**
 * Renders the main content inside a cell (icon + temps). Safe defaults.
 * dayData: {high, low, realFeelHigh, realFeelLow, ...}
 * period:  NWS period object (for icon/shortForecast)
 */
function renderWeatherCell(dayData, period) {
  const iconUrl   = (period && period.icon) || 'https://api.weather.gov/icons/land/day/sct?size=medium';
  const condition = (period && period.shortForecast) || '';

  const hi = (dayData && (dayData.high ?? dayData.max ?? "")) + "";
  const lo = (dayData && (dayData.low  ?? dayData.min ?? "")) + "";
  const rfHi = (dayData && (dayData.realFeelHigh ?? dayData.feelsLikeHigh ?? dayData.feelsLike ?? "")) + "";
  const rfLo = (dayData && (dayData.realFeelLow  ?? dayData.feelsLikeLow  ?? dayData.feelsLike ?? "")) + "";

  return `
    <div class="weather-cell">
      <img src="${escapeHtml(iconUrl)}" alt="${escapeHtml(condition)}" title="${escapeHtml(condition)}" />
      <span class="temp">${escapeHtml(hi)}°/${escapeHtml(lo)}°</span>
      <span class="realfeel">(Feels ${escapeHtml(rfHi)}°/${escapeHtml(rfLo)}°)</span>
    </div>
  `;
}

/* =========================
   Table rendering (MAIN)
   ========================= */
function renderWeatherTable(locationsInput) {
  try {
    const container = document.getElementById('forecast-container')
      || document.getElementById('weather-table-container')
      || document.querySelector('.forecast-container')
      || document.querySelector('#forecast-table-container');
    if (!container) {
      console.error("[UI] renderWeatherTable: container #weather-table-container not found.");
      return;
    }

    // Normalize locations to exactly 3 columns (undefined -> empty)
    const locations = [locationsInput[0] || null, locationsInput[1] || null, locationsInput[2] || null];

    // Derive the date rows to render
    const dateKeys = deriveDateKeys(locations);
    if (!dateKeys.length) {
      container.innerHTML = '<p class="no-data">No weather data available</p>';
      return;
    }

    // Header
    let html = '<table class="forecast-table"><thead><tr>';
    html += '<th class="date-col">Date</th>';

    // Filter to only real locations
    const activeLocations = locations.filter(loc => loc && (loc.city || loc.state || loc.label));

    // Build header for only real, defined locations
    for (let i = 0; i < activeLocations.length; i++) {
      const loc = activeLocations[i];
      const headerLabel = (loc.city && loc.state)
        ? `${loc.city}, ${loc.state}`
        : (loc.label || "");
      html += `<th class="loc-col loc-${i}">${escapeHtml(headerLabel)}</th>`;
    }

    html += '</tr></thead><tbody>';

    // Build body rows
    console.log("[UI] Rendering rows for dates:", dateKeys);
    for (const dateKey of dateKeys) {
      html += `<tr class="date-row" data-date="${dateKey}">`;
      html += `<td class="date-cell"><strong>${escapeHtml(formatDateLabel(dateKey))}</strong></td>`;

      for (let col = 0; col < activeLocations.length; col++) {
        const loc = locations[col];

        if (!loc) {
          html += `<td class="forecast-cell empty-cell">—</td>`;
          continue;
        }

        const dailyMap = normalizeDailyMap(loc.dailyData);
        const day = dailyMap[dateKey] || null;

        // find one representative period that starts on this dateKey
        let period = null;
        if (Array.isArray(loc.periods)) {
          period = loc.periods.find(p => formatDateKey(p.startTime || p.start || p.date) === dateKey) || null;
        }

        // find an alert that applies for this dateKey
        const alertsForLoc = Array.isArray(loc.alerts) ? loc.alerts : [];
        console.log(`[UI] Checking alerts for ${dateKey}, col ${col}:`, alertsForLoc.length, 'alerts');
        const alertForDay = alertsForLoc.find(a => alertAppliesOnDate(a, dateKey));

        let alertHtml = "";

        if (alertForDay && alertForDay.properties) {
          const p = alertForDay.properties;

          // UNFUCKING: Ensure location has countyFIPS and zoneCode set, using the point metadata if present in loc.point
          if (!loc.countyFIPS && loc.point && loc.point.properties && loc.point.properties.county) {
            loc.countyFIPS = codeFromZoneUrl(loc.point.properties.county);
          }
          if (!loc.zoneCode && loc.point && loc.point.properties && loc.point.properties.forecastZone) {
            loc.zoneCode = codeFromZoneUrl(loc.point.properties.forecastZone);
          }

          // Always prefer location object for NWS codes
          const zoneCode = loc.zoneCode || p.zoneId || p.zone || (p.geocode && p.geocode.UGC && p.geocode.UGC[0]) || '';
          const countyCode = loc.countyFIPS ||
            ((p.geocode && Array.isArray(p.geocode.FIPS6) && p.geocode.FIPS6[0]) ? p.geocode.FIPS6[0] :
              (typeof p.county === "string" && p.county.length > 0 ? codeFromZoneUrl(p.county) : ''));

          const fireWxZone = zoneCode;
          const localPlace1 = (loc.city ? `${loc.city} ${loc.state}` : loc.label) || "";
          const product1 = p.event || p.headline || "Weather Alert";
          const lat = loc.lat || '';
          const lon = loc.lon || '';
          function encode(val) { return encodeURIComponent(val || ''); }

          let forecastUrl = '';
          if (zoneCode && countyCode && lat && lon) {
            forecastUrl = `https://forecast.weather.gov/showsigwx.php?warnzone=${encode(zoneCode)}&warncounty=${encode(countyCode)}&firewxzone=${encode(fireWxZone)}&local_place1=${encode(localPlace1)}&product1=${encode(product1).replace(/%20/g, '+')}&lat=${encode(lat)}&lon=${encode(lon)}`;
            console.log("Forecast product URL:", forecastUrl);
          }

          const link = forecastUrl || p['@id'] || p.id || p.link || p.url || "";
          const title = p.headline || p.event || "Weather Alert";

          alertHtml = `<a class="alert-icon alert-clickable"
            href="${escapeHtml(link)}"
            target="_blank"
            rel="noopener noreferrer"
            title="${escapeHtml(title)}">⚠️</a>`;
        }

        const main = renderWeatherCell(day, period);

        // Place alert ABOVE the icon+temps block
        html += `<td class="forecast-cell">
          <div class="cell-stack">
            ${alertHtml ? `<div class="alert-row">${alertHtml}</div>` : ``}
            ${main}
          </div>
        </td>`;
      }

      html += '</tr>';
    }

    html += '</tbody></table>';
    container.innerHTML = html;

  } catch (err) {
    console.error("[UI] renderWeatherTable ERROR:", err);
  }
}

// Helper unchanged
function codeFromZoneUrl(zoneUrl) {
  if (!zoneUrl) return '';
  const parts = zoneUrl.split("/");
  const last = parts[parts.length - 1];
  const prev = parts[parts.length - 2];
  if (/^[A-Z]{3}\d{3}$/.test(last) || /^[A-Z]{2}[CZ]\d{3}$/.test(last)) return last;
  if (/^[A-Z]{2}$/.test(prev) && /^[C|Z]\d{3}$/.test(last)) return prev + last;
  return '';
}

/* =========================
   Loading helpers (match your logs)
   ========================= */

function showLoading() {
  const el = document.getElementById('loading-overlay');
  if (el) el.style.display = 'block';
  try { console.log('[UI] showLoading()'); } catch (_) {}
}

function hideLoading() {
  const el = document.getElementById('loading-overlay');
  if (el) el.style.display = 'none';
  try { console.log('[UI] hideLoading()'); } catch (_) {}
}

/* =========================
   Theme handling (match your logs)
   ========================= */

function applyTheme(mode) {
  // mode: 'light' | 'dark' | 'system'
  const root = document.documentElement;
  let effective = mode;
  if (mode === 'system') {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    effective = prefersDark ? 'dark' : 'light';
  }
  root.setAttribute('data-theme', effective);
  localStorage.setItem('theme', mode);
}

function initTheme() {
  const saved = localStorage.getItem('theme') || 'system';
  applyTheme(saved);

  const elLight  = document.getElementById('theme-light');
  const elDark   = document.getElementById('theme-dark');
  const elSystem = document.getElementById('theme-system');

  if (elLight)  elLight.addEventListener('click',  () => applyTheme('light'));
  if (elDark)   elDark.addEventListener('click',   () => applyTheme('dark'));
  if (elSystem) elSystem.addEventListener('click', () => applyTheme('system'));

  try { console.log(`Theme initialized: ${saved}`); } catch (_) {}
}

/* =========================
   Minimal styles (safe to keep here or move to CSS file)
   ========================= */
/* You may move these into your main CSS if preferred. */
(function injectUiStyles(){
  const css = `
    .forecast-table { width: 100%; border-collapse: collapse; }
    .forecast-table th, .forecast-table td { padding: 12px; text-align: center; }
    .date-col { text-align: left; width: 160px; }
    .loc-col { background: #1595f2; color: #fff; font-weight: 700; }
    .forecast-cell { vertical-align: middle; position: relative; }
    .alert-icon { display: inline-block; margin-right: 6px; font-size: 18px; text-decoration: none; }
    .alert-icon:hover { transform: translateY(-1px); }
    .weather-cell { display: inline-flex; align-items: center; gap: 8px; }
    .weather-cell img { width: 42px; height: 42px; image-rendering: -webkit-optimize-contrast; }
    .weather-cell .temp { font-weight: 700; }
    .weather-cell .realfeel { opacity: 0.85; margin-left: 4px; font-size: 0.9em; }
    .no-data { padding: 16px; text-align: center; opacity: 0.8; }
  `;
  const style = document.createElement('style');
  style.setAttribute('data-ui-js', '1');
  style.textContent = css;
  document.head.appendChild(style);
})();

/* =========================
   Public API (if you need to call manually)
   ========================= */
window.renderWeatherTable = renderWeatherTable;
window.initTheme = initTheme;
window.showLoading = showLoading;
window.hideLoading = hideLoading;
