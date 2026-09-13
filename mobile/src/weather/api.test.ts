import { formatTemp } from './api';

describe('formatTemp', () => {
  it('passes Celsius through, rounded, with the C suffix', () => {
    expect(formatTemp(27.4, 'C')).toBe('27°C');
    expect(formatTemp(27.6, 'C')).toBe('28°C');
  });

  it('converts to Fahrenheit correctly, rounded, with the F suffix', () => {
    expect(formatTemp(0, 'F')).toBe('32°F');
    expect(formatTemp(100, 'F')).toBe('212°F');
    expect(formatTemp(27, 'F')).toBe('81°F'); // 27*9/5+32 = 80.6 -> rounds to 81
  });

  it('handles negative temperatures', () => {
    expect(formatTemp(-40, 'C')).toBe('-40°C');
    expect(formatTemp(-40, 'F')).toBe('-40°F'); // the one point C and F agree
  });
});
