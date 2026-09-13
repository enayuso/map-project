/**
 * State + handlers for shareable saved-place lists (Naver's Dec 2022
 * favorites-folder upgrade) — additive on top of the existing flat
 * favorites, a list is a named, shareable subset of them. Extracted out
 * of App.tsx — see src/errors/useErrorLog.ts's header comment for why.
 * `favorites` is a parameter (not owned here) since building a list from
 * a set of favorite IDs is this feature's job, but *having* favorites is
 * a separate feature's own state. Selecting a place from a viewed list
 * stays in App.tsx, not here — it needs to set `selectedPlace` and move
 * the camera, both core app state this feature shouldn't own.
 */
import { Alert } from 'react-native';
import { useEffect, useState } from 'react';
import { createList, deleteList, getList, type ListPlace, type SharedList } from './api';
import { addLocalList, getLocalLists, removeLocalList, type LocalList } from './localLists';
import { logError } from '../errors/logger';
import type { SearchResult } from '../search/api';

export type UseLists = {
  managerVisible: boolean;
  toggleManager: () => void;
  closeManager: () => void;
  localLists: LocalList[];
  creating: boolean;
  createList: (label: string, placeIds: string[]) => Promise<void>;
  deleteLocalList: (code: string) => Promise<void>;
  viewCodeInput: string;
  setViewCodeInput: (value: string) => void;
  viewingBusy: boolean;
  viewingError: string | null;
  viewListCode: () => Promise<void>;
  viewedList: SharedList | null;
  viewSheetVisible: boolean;
  closeViewSheet: () => void;
};

export function useLists(favorites: SearchResult[], closeUtilityPanels: () => void): UseLists {
  const [managerVisible, setManagerVisible] = useState(false);
  const [localLists, setLocalLists] = useState<LocalList[]>([]);
  const [creating, setCreating] = useState(false);
  const [viewCodeInput, setViewCodeInput] = useState('');
  const [viewingBusy, setViewingBusy] = useState(false);
  const [viewingError, setViewingError] = useState<string | null>(null);
  const [viewedList, setViewedList] = useState<SharedList | null>(null);
  const [viewSheetVisible, setViewSheetVisible] = useState(false);

  useEffect(() => {
    getLocalLists().then(setLocalLists);
  }, []);

  const toggleManager = () => {
    if (managerVisible) {
      setManagerVisible(false);
    } else {
      closeUtilityPanels();
      setManagerVisible(true);
    }
  };

  const handleCreateList = async (label: string, placeIds: string[]) => {
    const places: ListPlace[] = favorites
      .filter(f => placeIds.includes(f.id))
      .map(f => ({ id: f.id, name: f.name, subtitle: f.subtitle, lat: f.lat, lon: f.lon }));
    setCreating(true);
    try {
      const { code } = await createList(label, places);
      const updated = await addLocalList({ code, label, placeIds });
      setLocalLists(updated);
    } catch (e) {
      logError('lists:create', e);
      Alert.alert('Could not create the list', 'Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteLocalList = async (code: string) => {
    deleteList(code).catch(() => {}); // best-effort — a local-only removal still un-shares it from this device's point of view even if the network call fails
    const updated = await removeLocalList(code);
    setLocalLists(updated);
  };

  const viewListCode = async () => {
    setViewingBusy(true);
    setViewingError(null);
    try {
      const list = await getList(viewCodeInput);
      setViewedList(list);
      setViewSheetVisible(true);
      setManagerVisible(false);
    } catch (e) {
      logError('lists:view', e);
      setViewingError(e instanceof Error ? e.message : 'Could not find that list.');
    } finally {
      setViewingBusy(false);
    }
  };

  return {
    managerVisible,
    toggleManager,
    closeManager: () => setManagerVisible(false),
    localLists,
    creating,
    createList: handleCreateList,
    deleteLocalList: handleDeleteLocalList,
    viewCodeInput,
    setViewCodeInput,
    viewingBusy,
    viewingError,
    viewListCode,
    viewedList,
    viewSheetVisible,
    closeViewSheet: () => setViewSheetVisible(false),
  };
}
