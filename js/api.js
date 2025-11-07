/* ===========================
   api.js — Browser-friendly NWS client
   No modules. No build step. No OpenWeather.
   =========================== */

(function () {
  // --- Config ---
  var DEFAULT_TIMEOUT_MS = 15000;

  // --- Utilities ---
  function withTimeout(promise, ms) {
    var controller = new AbortController();
    var t = setTimeout(function () { controller.abort(); }, ms);
    return {
      signal: controller.signal,
      finalize: function () { clearTimeout(t); }
    };
  }

  async function fetchJSON(url, options, timeoutMs) {
    options = options || {};
    timeoutMs = typeof timeoutMs === "number" ? timeoutMs : DEFAULT_TIMEOUT_MS;

    // Merge headers; ensure Accept for NWS/GeoJSON.
    var hdrs = Object.assign({ "Accept": "application/geo+json" }, options.headers || {});
    var to = withTimeout(null, timeoutMs);
    try {
      var resp = await fetch(url, Object.assign({}, options, { headers: hdrs, signal: to.signal }));
      if (!resp.ok) {
        // Surface status for easier debugging
        var text = "";
        try { text = await resp.text(); } catch (_) {}
        console.error("HTTP error", resp.status, url, text);
        throw new Error("Request failed: " + resp.status + " " + url);
      }
      // NWS often returns geojson; Nominatim returns JSON.
      // If content-type is not JSON, try text->JSON anyway for proxies.
      var ct = resp.headers.get("content-type") || "";
      if (ct.includes("json")) return await resp.json();
      try { return JSON.parse(await resp.text()); }
      catch (e) { throw new Error("Non-JSON response at " + url); }
    } finally {
      to.finalize();
    }
  }

  // --- Geocoding (ZIP or city/state) via Nominatim (no API key needed) ---
  // Returns: { lat:number, lon:number, label:string }
  async function geocodeLocation(query) {
    if (!query || typeof query !== "string") throw new Error("Missing location query");
    var q = query.trim();
    var params = new URLSearchParams({
      format: "json",
      addressdetails: "1",
      limit: "1",
      countrycodes: "us",
      q: q
    });
    var url = "https://nominatim.openstreetmap.org/search?" + params.toString();

    // Nominatim usage policy: include Referer automatically from browser
    var data = await fetchJSON(url, { headers: { "Accept": "application/json" } }, 12000);
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("Location not found for: " + q);
    }
    var hit = data[0];
    var lat = parseFloat(hit.lat);
    var lon = parseFloat(hit.lon);

    // Construct a readable label (City, ST or display_name fallback)
    var adr = hit.address || {};
    var cityLike = adr.city || adr.town || adr.village || adr.hamlet || adr.county || "";
    var state = adr.state || adr.state_code || "";
    var label = (cityLike && state) ? (cityLike + ", " + (adr.state_code || state)) : (hit.display_name || q);

    return { lat: lat, lon: lon, label: label };
  }

  // --- NWS Points: lat/lon → grid + forecast URLs + zones + relativeLocation ---
  // Returns raw NWS points JSON
  async function getNwsPoint(lat, lon) {
    var url = "https://api.weather.gov/points/" + lat + "," + lon;
    return await fetchJSON(url, {}, 12000);
  }

  // --- Helpers to extract codes/labels from point data ---
  function extractZoneCodeFromUrl(zoneUrl) {
    // e.g., https://api.weather.gov/zones/forecast/MDZ014 -> MDZ014
    if (!zoneUrl) return null;
    try {
      var parts = zoneUrl.split("/");
      return parts[parts.length - 1] || null;
    } catch (_) { return null; }
  }

  function extractCityState(pointJson) {
    try {
      var rel = pointJson.properties.relativeLocation.properties;
      return {
        city: rel.city || "",
        state: rel.state || ""
      };
    } catch (_) {
      return { city: "", state: "" };
    }
  }

  // --- Forecast (grid-level) ---
  // Returns { forecast, hourly, city, state }
  async function getNwsForecast(lat, lon) {
    var point = await getNwsPoint(lat, lon);

    var fUrl = point.properties && point.properties.forecast;
    var hUrl = point.properties && point.properties.forecastHourly;

    if (!fUrl) throw new Error("NWS 'forecast' URL missing for these coordinates");
    if (!hUrl) console.warn("NWS 'forecastHourly' URL missing; continuing with daily forecast only");

    var cityState = extractCityState(point);
    var forecast = await fetchJSON(fUrl, {}, 12000);
    var hourly = null;
    if (hUrl) {
      try { hourly = await fetchJSON(hUrl, {}, 12000); }
      catch (e) { console.warn("Hourly forecast fetch failed:", e.message); }
    }

    return {
      forecast: forecast,           // NWS daily periods
      hourly: hourly,               // NWS hourly periods (may be null)
      city: cityState.city,
      state: cityState.state,
      point: point                  // hand back point for downstream (alerts)
    };
  }

  // --- Alerts: zone-first with county fallback ---
  // Returns array of GeoJSON Feature objects (may be empty)
  async function getNwsAlerts(lat, lon, options) {
    options = options || {};
    var includeCountyFallback = (options.includeCountyFallback !== false); // default true

    var point = options.pointJson || await getNwsPoint(lat, lon);
    var fxZoneCode = extractZoneCodeFromUrl(point.properties && point.properties.forecastZone);
    var countyZoneCode = extractZoneCodeFromUrl(point.properties && point.properties.county);

    async function fetchAlertsForZoneCode(zoneCode) {
      if (!zoneCode) return [];
      var url = "https://api.weather.gov/alerts/active?zone=" + encodeURIComponent(zoneCode);
      var geo = await fetchJSON(url, {}, 12000);
      return Array.isArray(geo.features) ? geo.features : [];
    }

    // 1) Try forecast zone
    var features = await fetchAlertsForZoneCode(fxZoneCode);

    // 2) Fallback to county zone if none
    if (includeCountyFallback && (!features || features.length === 0)) {
      var countyFeatures = await fetchAlertsForZoneCode(countyZoneCode);
      if (countyFeatures && countyFeatures.length) {
        features = countyFeatures;
      }
    }

    return features || [];
  }

  // --- Public API (attach both as globals and under window.WeatherAPI) ---
  // These names match common usage in your app (based on your logs)
  window.fetchWithTimeout = function (url, options, timeoutMs) {
    // Thin wrapper using fetchJSON to keep a consistent interface
    // but preserve original name used across your code.
    return fetchJSON(url, options, timeoutMs);
  };

  window.geocodeLocation = geocodeLocation;
  window.getNwsPoint = getNwsPoint;
  window.getNwsForecast = getNwsForecast;
  window.getNwsAlerts = getNwsAlerts;

  // Optional: single call to get everything needed for a location
  window.getNwsPackage = async function (locationQuery) {
    var geo = await geocodeLocation(locationQuery);
    var fc = await getNwsForecast(geo.lat, geo.lon);
    var alerts = await getNwsAlerts(geo.lat, geo.lon, { pointJson: fc.point, includeCountyFallback: true });
    return {
      query: locationQuery,
      label: geo.label,
      lat: geo.lat,
      lon: geo.lon,
      city: fc.city,
      state: fc.state,
      forecast: fc.forecast,
      hourly: fc.hourly,
      alerts: alerts
    };
  };

  // Helpful console banner so you know this file loaded
  try {
    console.debug("[api.js] NWS client initialized (browser mode).");
  } catch (_) {}
})();
