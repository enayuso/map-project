import { weatherCodeInfo } from './weatherCodes';

describe('weatherCodeInfo', () => {
  it('maps known WMO codes to their emoji/label', () => {
    expect(weatherCodeInfo(0)).toEqual({ emoji: '☀️', label: 'Clear sky' });
    expect(weatherCodeInfo(95)).toEqual({ emoji: '⛈️', label: 'Thunderstorm' });
  });

  it('falls back to a generic entry for an unrecognized code, rather than throwing', () => {
    // Open-Meteo is a live third-party API — a code outside our hardcoded
    // WMO table (a typo, or the standard adding one) must degrade
    // gracefully, not crash the weather widget.
    expect(weatherCodeInfo(-1)).toEqual({ emoji: '🌡️', label: 'Unknown' });
    expect(weatherCodeInfo(12345)).toEqual({ emoji: '🌡️', label: 'Unknown' });
  });
});
