/* ==========================================================
   api.js — NWS-only, browser-safe, no modules, no bundler
   Defines EXACT names your UI calls:
     - fetchWithTimeout(url, options, timeoutMs)
     - geocodeLocation(query)
     - fetchNWSPoint(lat, lon)
     - fetchNWSForecast(lat, lon)  // returns {forecast, hourly, city, state, point}
     - fetchNWSAlerts(lat, lon, opts)  // zone, with county fallback
   ========================================================== */

(function () {
  var DEFAULT_TIMEOUT_MS = 15000;

  // ---------- Core fetch helpers ----------
  function withAbortTimeout(ms) {
    var controller = new AbortController();
    var id = setTimeout(function () { controller.abort(); }, ms);
    return { signal: controller.signal, clear: function () { clearTimeout(id); } };
  }

  function isJSONContent(resp) {
    var ct = resp.headers && resp.headers.get ? (resp.headers.get("content-type") || "") : "";
    return ct.indexOf("json") !== -1;
  }

  async function fetchJSON(url, options, timeoutMs) {
    options = options || {};
    var ms = typeof timeoutMs === "number" ? timeoutMs : DEFAULT_TIMEOUT_MS;

    // Ensure Accept header for NWS/GeoJSON; allow caller to override
    var mergedHeaders = Object.assign({ "Accept": "application/geo+json" }, options.headers || {});
    var t = withAbortTimeout(ms);

    try {
      var resp = await fetch(url, Object.assign({}, options, { headers: mergedHeaders, signal: t.signal }));
      if (!resp.ok) {
        var body = "";
        try { body = await resp.text(); } catch (e) {}
        console.error("[api] HTTP", resp.status, url, body.slice(0, 240));
        throw new Error("Request failed " + resp.status + " for " + url);
      }
      if (isJSONContent(resp)) return await resp.json();
      // last-ditch parse for proxies w/o content-type
      try { return JSON.parse(await resp.text()); } catch (e) {
        throw new Error("Non-JSON response for " + url);
      }
    } finally {
      t.clear();
    }
  }

  // Public wrapper preserving your original name
  window.fetchWithTimeout = function (url, options, timeoutMs) {
    return fetchJSON(url, options, timeoutMs);
  };

  // ---------- Geocoding (ZIP or city/state) ----------
  // Returns { lat, lon, label }
  async function geocodeLocation(query) {
    if (!query || typeof query !== "string") throw new Error("Missing location query");
    var q = query.trim();
    var params = new URLSearchParams({
      q: q,
      format: "json",
      addressdetails: "1",
      limit: "1",
      countrycodes: "us"
    });
    var url = "https://nominatim.openstreetmap.org/search?" + params.toString();
    // Nominatim policy: browser Referer is fine; keep requests modest
    var data = await fetchJSON(url, { headers: { "Accept": "application/json" } }, 12000);
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("Location not found: " + q);
    }
    var hit = data[0];
    var lat = parseFloat(hit.lat), lon = parseFloat(hit.lon);
    var adr = hit.address || {};
    var cityLike = adr.city || adr.town || adr.village || adr.hamlet || adr.county || "";
    var state = adr.state_code || adr.state || "";
    var label = (cityLike && state) ? (cityLike + ", " + (state || "")) : (hit.display_name || q);
    return { lat: lat, lon: lon, label: label };
  }
  window.geocodeLocation = geocodeLocation;

  // ---------- NWS Points ----------
  async function fetchNWSPoint(lat, lon) {
    var url = "https://api.weather.gov/points/" + lat + "," + lon;
    return await fetchJSON(url, {}, 12000);
  }
  window.fetchNWSPoint = fetchNWSPoint;

  function extractCityStateFromPoint(pointJson) {
    try {
      var rel = pointJson.properties.relativeLocation.properties;
      return { city: rel.city || "", state: rel.state || "" };
    } catch (e) {
      return { city: "", state: "" };
    }
  }

  function codeFromZoneUrl(zoneUrl) {
    if (!zoneUrl) return null;
    var parts = zoneUrl.split("/");
    return parts[parts.length - 1] || null;
  }

  // ---------- Forecast ----------
  // Returns { forecast, hourly, city, state, point }
  async function fetchNWSForecast(lat, lon) {
    var point = await fetchNWSPoint(lat, lon);

    var forecastUrl = point.properties && point.properties.forecast;
    var hourlyUrl   = point.properties && point.properties.forecastHourly;
    if (!forecastUrl) throw new Error("NWS 'forecast' URL missing for " + lat + "," + lon);

    var loc = extractCityStateFromPoint(point);
    var forecast = await fetchJSON(forecastUrl, {}, 12000);

    var hourly = null;
    if (hourlyUrl) {
      try { hourly = await fetchJSON(hourlyUrl, {}, 12000); }
      catch (e) { console.warn("[api] hourly forecast failed:", e.message); }
    }

    return {
      forecast: forecast,  // NWS daily periods
      hourly: hourly,      // may be null
      city: loc.city,
      state: loc.state,
      point: point
    };
  }
  window.fetchNWSForecast = fetchNWSForecast;

  // ---------- Alerts (zone-first, county fallback) ----------
  // Returns array of GeoJSON features

  // ---------- Alerts (zone-first, county fallback) ----------
  // Returns array of GeoJSON features
  async function fetchNWSAlerts(lat, lon, { pointJson }) {
    try {
      const props = pointJson.properties || {};
      const zoneUrl   = props.forecastZone;
      const countyUrl = props.county;

      const zoneCode   = codeFromZoneUrl(zoneUrl);
      const countyCode = codeFromZoneUrl(countyUrl);

      let alerts = [];

      // Zone-based hazards (wind, coastal, winter storm watches, etc.)
      if (zoneCode) {
        try {
          const j = await fetchJSON(
            `https://api.weather.gov/alerts/active?zone=${encodeURIComponent(zoneCode)}`
          );
          if (j && Array.isArray(j.features)) alerts = alerts.concat(j.features);
        } catch (e) {
          console.warn("[api] zone alerts failed", zoneCode, e);
        }
      }

      // County-based alerts (Freeze Warning, Heat Advisory, Air Quality Alerts, etc.)
      if (countyCode) {
        try {
          const j2 = await fetchJSON(
            `https://api.weather.gov/alerts/active?zone=${encodeURIComponent(countyCode)}`
          );
          if (j2 && Array.isArray(j2.features)) alerts = alerts.concat(j2.features);
        } catch (e) {
          console.warn("[api] county alerts failed", countyCode, e);
        }
      }

      return alerts;
    } catch (err) {
      console.error("[api] fetchNWSAlerts ERROR:", err);
      return [];
    }
  }
  window.fetchNWSAlerts = fetchNWSAlerts;

})(); // <--- THIS WAS MISSING!!!

