/**
 * Calculate RealFeel (Apparent Temperature)
 * Uses NWS apparent temperature when available
 * Fallback: Wind chill or heat index calculations
 */

function calculateWindChill(tempF, windSpeedMph) {
    if (tempF > 50 || windSpeedMph < 3) return tempF;
    
    return 35.74 + 
           0.6215 * tempF - 
           35.75 * Math.pow(windSpeedMph, 0.16) + 
           0.4275 * tempF * Math.pow(windSpeedMph, 0.16);
}

function calculateHeatIndex(tempF, humidity) {
    if (tempF < 80) return tempF;
    
    const T = tempF;
    const RH = humidity;
    
    let HI = 0.5 * (T + 61.0 + ((T - 68.0) * 1.2) + (RH * 0.094));
    
    if (HI >= 80) {
        HI = -42.379 + 
             2.04901523 * T + 
             10.14333127 * RH - 
             0.22475541 * T * RH - 
             0.00683783 * T * T - 
             0.05481717 * RH * RH + 
             0.00122874 * T * T * RH + 
             0.00085282 * T * RH * RH - 
             0.00000199 * T * T * RH * RH;
    }
    
    return HI;
}

function calculateRealFeel(tempF, windSpeedMph, humidity) {
    if (tempF <= 50 && windSpeedMph >= 3) {
        return calculateWindChill(tempF, windSpeedMph);
    } else if (tempF >= 80) {
        return calculateHeatIndex(tempF, humidity);
    }
    return tempF;
}

function getDailyRealFeelRange(periods) {
    // Group periods by calendar date
    const dailyData = {};
    
    periods.forEach(period => {
        const date = period.startTime.split('T')[0];
        if (!dailyData[date]) {
            dailyData[date] = {
                realFeels: [],
                high: -Infinity,
                low: Infinity
            };
        }
        
        const realFeel = period.apparentTemperature || 
                        calculateRealFeel(
                            period.temperature,
                            period.windSpeed?.replace(/\D/g, '') || 0,
                            period.relativeHumidity?.value || 50
                        );
        
        dailyData[date].realFeels.push(realFeel);
        dailyData[date].high = Math.max(dailyData[date].high, period.temperature);
        dailyData[date].low = Math.min(dailyData[date].low, period.temperature);
    });
    
    // Calculate min/max RealFeel for each day
    const result = {};
    Object.keys(dailyData).forEach(date => {
        const realFeels = dailyData[date].realFeels;
        result[date] = {
            realFeelHigh: Math.round(Math.max(...realFeels)),
            realFeelLow: Math.round(Math.min(...realFeels)),
            high: Math.round(dailyData[date].high),
            low: Math.round(dailyData[date].low)
        };
    });
    
    return result;
}
