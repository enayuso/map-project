import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { searchAll, type SearchResult } from './api';

const DEBOUNCE_MS = 300;
// Guards against the exact tap that opens the dropdown also closing it —
// see openResults's comment for the full mechanism. Comfortably longer
// than a single tap's own down-to-up time, comfortably shorter than a
// deliberate second tap to dismiss.
const DISMISS_GUARD_MS = 300;

type Props = {
  onSelect: (result: SearchResult) => void;
  recentSearches: SearchResult[];
  favorites: SearchResult[];
};

export default function SearchBox({ onSelect, recentSearches, favorites }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openedAtRef = useRef(0);

  const trimmed = query.trim();
  // Below 2 characters there's nothing to search yet — this is also exactly
  // when Kakao/Naver show a "recent searches" / saved-places shortcut list
  // instead of leaving the dropdown empty, so we do the same here.
  const showShortcuts = trimmed.length < 2 && (favorites.length > 0 || recentSearches.length > 0);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(() => {
      searchAll(trimmed)
        .then(r => setResults(r))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [trimmed]);

  const handleSelect = (result: SearchResult) => {
    Keyboard.dismiss();
    setShowResults(false);
    // Clear back to empty rather than filling in the selected name — the
    // place itself now shows on the map/its card, and leaving the box
    // empty means focusing it again immediately offers recents/favorites
    // instead of just re-running the same search.
    setQuery('');
    onSelect(result);
  };

  // Marks the dropdown as opened *now* — dismiss() below won't act until
  // this guard window has passed, and openResults() (used for onFocus)
  // additionally defers the state update itself until the opening tap's
  // gesture has fully settled. Two layers for the same race condition,
  // deliberately: see openResults's comment for why relying on just one
  // felt too fragile to trust without being able to test interactively.
  const markOpened = () => {
    openedAtRef.current = Date.now();
    setShowResults(true);
  };

  const openResults = () => {
    // A native Modal (below) mounting synchronously on TextInput focus can
    // let the very tap that focused the input also land on the Modal's
    // full-screen backdrop the instant it appears — that touch's "up"
    // gets delivered to whatever's now topmost at that screen point, which
    // is the backdrop, whose onPress calls dismiss(). The dropdown opens
    // and is immediately closed by the same physical tap that opened it.
    // Deferring the state update by a tick means the Modal mounts only
    // after this tap's touch-up has already been fully processed, so
    // there's no in-flight touch left to bleed through to the backdrop.
    // (Would use InteractionManager.runAfterInteractions for this — it's
    // the API RN had for exactly this purpose — but it's been removed
    // from RN core as of this project's version, per react-native's own
    // index.js; confirmed directly, not assumed, before reaching for
    // setTimeout instead.)
    setTimeout(markOpened, 50);
  };

  const dismiss = () => {
    // Belt-and-suspenders alongside openResults's setTimeout defer above —
    // ignore a dismiss that arrives suspiciously soon after opening,
    // rather than trusting that defer alone to fully close the race in
    // every case.
    if (Date.now() - openedAtRef.current < DISMISS_GUARD_MS) return;
    Keyboard.dismiss();
    setShowResults(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.input}
          placeholder="Search Belize — address or place..."
          placeholderTextColor="#8a8578"
          value={query}
          onChangeText={text => {
            setQuery(text);
            markOpened();
          }}
          onFocus={openResults}
          autoCorrect={false}
          returnKeyType="search"
        />
        {loading && <ActivityIndicator size="small" color="#8a8578" />}
      </View>

      {/*
       * Results render in a Modal rather than a plain absolutely-positioned
       * sibling View. A native MapView sibling can otherwise swallow touches
       * meant for an RN overlay above it — a known React Native issue
       * (facebook/react-native#35612) that no pointerEvents combination
       * reliably works around. A Modal is a genuinely separate native layer,
       * which sidesteps it. Only mounted while there's something to show, so
       * the map underneath stays fully interactive the rest of the time.
       */}
      <Modal
        transparent
        visible={showResults && (results.length > 0 || showShortcuts)}
        animationType="none"
        onRequestClose={dismiss}>
        <Pressable style={styles.backdrop} onPress={dismiss}>
          <View style={styles.modalResultsWrapper} pointerEvents="box-none">
            <ScrollView
              style={styles.resultsBox}
              keyboardShouldPersistTaps="handled">
              {showShortcuts ? (
                <>
                  {favorites.length > 0 && (
                    <>
                      <Text style={styles.sectionHeader}>⭐ Saved places</Text>
                      {favorites.map(item => (
                        <Pressable
                          key={item.id}
                          style={styles.resultRow}
                          onPress={() => handleSelect(item)}>
                          <Text style={styles.resultName}>{item.name}</Text>
                          <Text style={styles.resultSubtitle} numberOfLines={1}>
                            {item.subtitle}
                          </Text>
                        </Pressable>
                      ))}
                    </>
                  )}
                  {recentSearches.length > 0 && (
                    <>
                      <Text style={styles.sectionHeader}>🕐 Recent</Text>
                      {recentSearches.map(item => (
                        <Pressable
                          key={item.id}
                          style={styles.resultRow}
                          onPress={() => handleSelect(item)}>
                          <Text style={styles.resultName}>{item.name}</Text>
                          <Text style={styles.resultSubtitle} numberOfLines={1}>
                            {item.subtitle}
                          </Text>
                        </Pressable>
                      ))}
                    </>
                  )}
                </>
              ) : (
                results.map(item => (
                  <Pressable
                    key={item.id}
                    style={styles.resultRow}
                    onPress={() => handleSelect(item)}>
                    <Text style={styles.resultName}>{item.name}</Text>
                    <Text style={styles.resultSubtitle} numberOfLines={1}>
                      {item.subtitle}
                    </Text>
                  </Pressable>
                ))
              )}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    left: 12,
    right: 12,
    zIndex: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 46,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#3a3226',
  },
  backdrop: {
    flex: 1,
  },
  modalResultsWrapper: {
    position: 'absolute',
    top: 112, // search bar's top (60) + height (46) + gap (6)
    left: 12,
    right: 12,
  },
  resultsBox: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    maxHeight: 280,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
    overflow: 'hidden',
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8a8578',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
  },
  resultRow: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0ede4',
  },
  resultName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#3a3226',
  },
  resultSubtitle: {
    fontSize: 12,
    color: '#8a8578',
    marginTop: 2,
  },
});
