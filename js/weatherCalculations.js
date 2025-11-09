/**
 * Robust RealFeel (Apparent Temperature) helpers for NWS-style data
 * - Correct wind parsing ("5 to 10 mph" -> average 7.5)
 * - Proper heat index gating (T>=80 & RH>=40) + NWS adjustments
 * - Humidity clamped to [0,100]; wind >= 0
 * - Apparent temperature unit awareness when present
 */

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function parseWindSpeedMph(windSpeedStr) {
  if (!windSpeedStr) return 0;
  // Extract all numbers (handles "5 mph", "5 to 10 mph", "10G20 mph", "12-18 mph")
  const nums = (windSpeedStr.match(/(\d+(\.\d+)?)/g) || []).map(Number);
  if (nums.length === 0) return 0;
  // For ranges/gusts, use the average of the numbers found
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  return Math.max(0, avg);
}

function calculateWindChill(tempF, windMph) {
  // NWS wind chill valid for T <= 50°F and wind >= 3 mph
  if (tempF > 50 || windMph < 3) return tempF;
  return 35.74 +
         0.6215 * tempF -
         35.75 * Math.pow(windMph, 0.16) +
         0.4275 * tempF * Math.pow(windMph, 0.16);
}

function calculateHeatIndex(tempF, humidityPct) {
  const T = tempF;
  const RH = clamp(humidityPct ?? 50, 0, 100);

  // Heat index is only meaningful/used when T >= 80 and RH >= 40 (NWS guidance)
  if (T < 80 || RH < 40) return T;

  // Rothfusz regression
  let HI = -42.379 +
           2.04901523 * T +
           10.14333127 * RH -
           0.22475541 * T * RH -
           0.00683783 * T * T -
           0.05481717 * RH * RH +
           0.00122874 * T * T * RH +
           0.00085282 * T * RH * RH -
           0.00000199 * T * T * RH * RH;

  // NWS adjustments
  // Very low humidity (RH < 13) & 80°F <= T <= 112°F
  if (RH < 13 && T >= 80 && T <= 112) {
    const adj = ((13 - RH) / 4) * Math.sqrt((17 - Math.abs(T - 95)) / 17);
    HI -= adj;
  }
  // Very high humidity (RH > 85) & 80°F <= T <= 87°F
  if (RH > 85 && T >= 80 && T <= 87) {
    const adj = ((RH - 85) / 10) * ((87 - T) / 5);
    HI += adj;
  }

  return HI;
}

function calculateRealFeel(tempF, windSpeedMph, humidityPct) {
  const T = Number(tempF);
  const W = Number(windSpeedMph);
  const RH = Number.isFinite(humidityPct) ? humidityPct : 50;

  if (!Number.isFinite(T)) return NaN;

  if (T <= 50 && W >= 3) return calculateWindChill(T, W);
  if (T >= 80 && RH >= 40) return calculateHeatIndex(T, RH);
  return T;
}

function toFahrenheit(value, unitCode) {
  if (value == null || !Number.isFinite(value)) return null;
  // NWS unit codes can look like "wmoUnit:degF" or "wmoUnit:degC"
  if (unitCode && /degc/i.test(unitCode)) {
    return (value * 9) / 5 + 32;
  }
  return value; // assume already °F
}

// Local helper to format date keys in this module
function formatDateKeyLocal(dateLike) {
  const d = new Date(dateLike);
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

function getDailyRealFeelRange(periods) {
  // Group periods by calendar date (LOCAL, not UTC)
  const daily = {};
  
  periods.forEach(period => {
    const date = formatDateKeyLocal(period.startTime);
    
    // Initialize the daily bucket if it doesn't exist
    if (!daily[date]) {
      daily[date] = {
        realFeels: [],
        highs: [],
        lows: []
      };
    }

    // Temperature (°F)
    const tempF = Number(period.temperature);
    // Wind speed (mph)
    const windMph = parseWindSpeedMph(period.windSpeed);
    // Humidity (%)
    const rh = clamp(period?.relativeHumidity?.value ?? 50, 0, 100);

    // Prefer provided apparent temperature if present & in known units
    let apparentF = null;
    if (period.apparentTemperature != null) {
      // Support either { value, unitCode } or plain number
      if (typeof period.apparentTemperature === 'object') {
        apparentF = toFahrenheit(
          period.apparentTemperature.value,
          period.apparentTemperature.unitCode
        );
      } else if (typeof period.apparentTemperature === 'number') {
        apparentF = period.apparentTemperature; // assume °F
      }
    }

    const realFeel = Number.isFinite(apparentF)
      ? apparentF
      : calculateRealFeel(tempF, windMph, rh);

    if (Number.isFinite(realFeel)) daily[date].realFeels.push(realFeel);
    if (Number.isFinite(tempF)) {
      daily[date].highs.push(tempF);
      daily[date].lows.push(tempF);
    }
  });

  const result = {};
  Object.keys(daily).forEach(date => {
    const rf = daily[date].realFeels;
    const hs = daily[date].highs;
    const ls = daily[date].lows;

    result[date] = {
      realFeelHigh: rf.length ? Math.round(Math.max(...rf)) : null,
      realFeelLow:  rf.length ? Math.round(Math.min(...rf)) : null,
      high: hs.length ? Math.round(Math.max(...hs)) : null,
      low:  ls.length ? Math.round(Math.min(...ls)) : null
    };
  });

  return result;
}
