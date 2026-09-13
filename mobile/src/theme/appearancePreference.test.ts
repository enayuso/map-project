import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAppearancePreference, setAppearancePreference } from './appearancePreference';

describe('appearancePreference', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('defaults to system when nothing has been set yet', async () => {
    expect(await getAppearancePreference()).toBe('system');
  });

  it('round-trips light and dark', async () => {
    await setAppearancePreference('light');
    expect(await getAppearancePreference()).toBe('light');

    await setAppearancePreference('dark');
    expect(await getAppearancePreference()).toBe('dark');
  });

  it('setting back to system is indistinguishable from never having set it', async () => {
    await setAppearancePreference('dark');
    await setAppearancePreference('system');
    expect(await getAppearancePreference()).toBe('system');
  });

  it('treats corrupted/unexpected stored values as system rather than throwing', async () => {
    await AsyncStorage.setItem('belizemap:appearance', 'not-a-real-value');
    expect(await getAppearancePreference()).toBe('system');
  });
});
