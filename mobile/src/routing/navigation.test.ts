import { gpsSpeedToMph } from './navigation';

describe('gpsSpeedToMph', () => {
  it('converts a real m/s reading to mph', () => {
    // 10 m/s ≈ 22.37 mph — a plausible town-road speed.
    expect(gpsSpeedToMph(10)).toBeCloseTo(22.369, 2);
  });

  it('converts 0 m/s (stationary) to 0 mph, not null', () => {
    // Stationary is a real, valid reading — distinct from "unavailable".
    expect(gpsSpeedToMph(0)).toBe(0);
  });

  it('treats a negative speed as unavailable, per CoreLocation\'s own convention', () => {
    expect(gpsSpeedToMph(-1)).toBeNull();
  });

  it('treats null/undefined as unavailable', () => {
    expect(gpsSpeedToMph(null)).toBeNull();
    expect(gpsSpeedToMph(undefined)).toBeNull();
  });

  it('treats NaN as unavailable, not as a literal "NaN mph" reading', () => {
    expect(gpsSpeedToMph(NaN)).toBeNull();
  });
});
