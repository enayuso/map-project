/**
 * WMO Weather interpretation codes (WW) — the fixed, published
 * international standard Open-Meteo's own API returns `weather_code` in
 * (confirmed directly against the live API before writing this, not
 * assumed). A stable public standard, not something that changes, so this
 * is hardcoded rather than fetched.
 */

export type WeatherCodeInfo = {
  emoji: string;
  label: string;
};

const CODES: Record<number, WeatherCodeInfo> = {
  0: { emoji: '☀️', label: 'Clear sky' },
  1: { emoji: '🌤️', label: 'Mostly clear' },
  2: { emoji: '⛅', label: 'Partly cloudy' },
  3: { emoji: '☁️', label: 'Overcast' },
  45: { emoji: '🌫️', label: 'Fog' },
  48: { emoji: '🌫️', label: 'Depositing rime fog' },
  51: { emoji: '🌦️', label: 'Light drizzle' },
  53: { emoji: '🌦️', label: 'Drizzle' },
  55: { emoji: '🌦️', label: 'Dense drizzle' },
  56: { emoji: '🌧️', label: 'Freezing drizzle' },
  57: { emoji: '🌧️', label: 'Dense freezing drizzle' },
  61: { emoji: '🌧️', label: 'Light rain' },
  63: { emoji: '🌧️', label: 'Rain' },
  65: { emoji: '🌧️', label: 'Heavy rain' },
  66: { emoji: '🌧️', label: 'Freezing rain' },
  67: { emoji: '🌧️', label: 'Heavy freezing rain' },
  71: { emoji: '🌨️', label: 'Light snow' },
  73: { emoji: '🌨️', label: 'Snow' },
  75: { emoji: '🌨️', label: 'Heavy snow' },
  77: { emoji: '🌨️', label: 'Snow grains' },
  80: { emoji: '🌧️', label: 'Light rain showers' },
  81: { emoji: '🌧️', label: 'Rain showers' },
  82: { emoji: '🌧️', label: 'Violent rain showers' },
  85: { emoji: '🌨️', label: 'Snow showers' },
  86: { emoji: '🌨️', label: 'Heavy snow showers' },
  95: { emoji: '⛈️', label: 'Thunderstorm' },
  96: { emoji: '⛈️', label: 'Thunderstorm with hail' },
  99: { emoji: '⛈️', label: 'Thunderstorm with heavy hail' },
};

export function weatherCodeInfo(code: number): WeatherCodeInfo {
  return CODES[code] ?? { emoji: '🌡️', label: 'Unknown' };
}
