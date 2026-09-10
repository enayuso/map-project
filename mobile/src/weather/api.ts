/**
 * Weather overlay — low-effort polish per docs/research/
 * 09-kakao-naver-feature-audit.md (a real feature both apps have, but not
 * a functional gap the way most of this project's other work has been).
 * Open-Meteo: free, no API key, no account, commercial-use-permitted —
 * confirmed by fetching it live before building anything, not assumed.
 */

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

export type CurrentWeather = {
  tempC: number;
  weatherCode: number;
  windKmh: number;
  humidityPct: number;
};

export async function fetchCurrentWeather(lat: number, lon: number): Promise<CurrentWeather> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m',
    timezone: 'auto',
  });
  const res = await fetch(`${OPEN_METEO_URL}?${params}`);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const body = await res.json();
  return {
    tempC: body.current.temperature_2m,
    weatherCode: body.current.weather_code,
    windKmh: body.current.wind_speed_10m,
    humidityPct: body.current.relative_humidity_2m,
  };
}
