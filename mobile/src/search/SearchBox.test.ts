import { stripLeadingEmoji } from './SearchBox';

describe('stripLeadingEmoji', () => {
  it('strips a single leading emoji and the space after it', () => {
    expect(stripLeadingEmoji('📍 Use current location')).toBe('Use current location');
    expect(stripLeadingEmoji('🗺️ Select on map')).toBe('Select on map');
  });

  it('leaves plain text with no leading emoji untouched', () => {
    expect(stripLeadingEmoji('Puma Freetown')).toBe('Puma Freetown');
  });

  it('handles a label that is only an emoji', () => {
    expect(stripLeadingEmoji('📍')).toBe('');
  });

  it('does not touch emoji that appear later in the string', () => {
    expect(stripLeadingEmoji('📍 A place 🎉 with a party')).toBe('A place 🎉 with a party');
  });
});
