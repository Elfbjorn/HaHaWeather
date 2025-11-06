# Weather Compare App

A responsive web application for comparing 7-day weather forecasts across up to three U.S. locations.

## Features

- **7-Day Comparative Forecast**: View and compare weather for up to 3 cities side-by-side
- **Auto-Detection**: Automatically detects your location via IP geolocation
- **RealFeel Temperature**: Displays calculated "feels like" temperatures (high/low)
- **Severe Weather Alerts**: Shows active NWS weather alerts with one-click access
- **Theme Support**: Light, Dark, and System Default modes
- **Fully Responsive**: Optimized for mobile, tablet, and desktop

## Technology Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **APIs**: 
  - National Weather Service (NWS) - Weather data
  - IP-API - Geolocation
  - Open-Meteo - Geocoding
- **Hosting**: GitHub Pages

## Usage

1. Visit the live app: [Your GitHub Pages URL]
2. The app will auto-detect your location
3. Add additional cities by typing city names or ZIP codes
4. View the 7-day comparative forecast table
5. Click alert icons (⚠️) to view active weather warnings

## Local Development
```bash
# Clone repository
git clone https://github.com/YOUR-USERNAME/weather-compare-app.git

# Navigate to directory
cd weather-compare-app

# Open in browser (or use local server)
open index.html
```

## API Limitations

- **Geographic Coverage**: U.S. and territories only (NWS API limitation)
- **Forecast Length**: 7 days (NWS provides up to 7 days reliably)
- **Rate Limits**: Moderate usage to respect API fair use policies

## Browser Support

- Chrome/Edge: Latest 2 versions
- Firefox: Latest 2 versions
- Safari: Latest 2 versions
- Mobile: iOS Safari 12+, Android Chrome 90+

## License

MIT License - Free to use and modify

## Data Attribution

Weather data provided by the [National Weather Service](https://www.weather.gov)
```

---

### .gitignore
```
# System files
.DS_Store
Thumbs.db

# Editor directories
.vscode/
.idea/

# Logs
*.log

# Environment files
.env
.env.local