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
import { useTheme } from '../theme/ThemeContext';

// VoiceOver labels describe what a row does in words — strip the leading
// emoji glyph callers put in visible labels (extraShortcuts, section
// headers) rather than reading it out character-by-character.
export const stripLeadingEmoji = (label: string) => label.replace(/^[^\p{L}\p{N}]+/u, '');

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
  placeholder?: string;
  /** Default true (the original/normal search box behavior): clears the
   * input back to empty after a selection, since the result now shows on
   * the map/its own card. Pass false for a field that should keep showing
   * the selected place's name — e.g. src/routing/DirectionsSearchPanel's
   * origin/destination rows, which work like Naver/Kakao's own route
   * inputs (retyping searches again; the field isn't just a one-shot
   * search box). */
  clearOnSelect?: boolean;
  /** Default false. When true, skips this component's own absolute
   * positioning AND its search bar's card chrome (background/shadow/
   * radius) — for embedding as a plain row inside a parent-owned card,
   * like DirectionsSearchPanel's two stacked fields, instead of floating
   * on its own over the map. */
  embedded?: boolean;
  /** Overrides the results dropdown's fixed `top` offset (see
   * modalResultsWrapper below) — only relevant when `embedded`, since the
   * default assumes the normal single-search-box layout's own position. */
  dropdownTop?: number;
  /** Extra, always-first rows in the shortcuts section (shown alongside/
   * above favorites and recents whenever the query's under 2 characters) —
   * e.g. "📍 Use current location" / "🗺️ Select on map" for a directions
   * field. Selecting one does not go through onSelect/clearOnSelect at all,
   * just calls its own onPress. */
  extraShortcuts?: { label: string; onPress: () => void }[];
  /** Called when the input gains focus, in addition to this component's
   * own dropdown-opening logic — lets a parent track "which field is the
   * user interacting with right now" (DirectionsSearchPanel uses this to
   * decide which point a map tap should set). */
  onFocus?: () => void;
  /** Normally omitted — the box manages its own text locally (typing, then
   * clearing or filling in the picked name on select). Pass this when
   * something OTHER than this box's own dropdown can also change what it
   * should show — DirectionsSearchPanel's fields can be filled by a map
   * tap, a swap, or a clear button, none of which this component would
   * otherwise know about. Whenever this prop's value itself changes, the
   * input's text is resynced to it; typing in between two such changes is
   * untouched, so this doesn't fight normal keystrokes. */
  value?: string;
};

export default function SearchBox({
  onSelect,
  recentSearches,
  favorites,
  placeholder = 'Search Belize — address or place...',
  clearOnSelect = true,
  embedded = false,
  dropdownTop = 112,
  extraShortcuts,
  onFocus,
  value,
}: Props) {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openedAtRef = useRef(0);

  // See the `value` prop's own doc comment — only fires when the caller's
  // canonical value actually changes (a map tap, swap, or clear elsewhere),
  // not on every keystroke, since typing doesn't touch the `value` prop.
  useEffect(() => {
    if (value !== undefined) setQuery(value);
  }, [value]);

  const trimmed = query.trim();
  // Below 2 characters there's nothing to search yet — this is also exactly
  // when Kakao/Naver show a "recent searches" / saved-places shortcut list
  // instead of leaving the dropdown empty, so we do the same here.
  const showShortcuts =
    trimmed.length < 2 &&
    (!!extraShortcuts?.length || favorites.length > 0 || recentSearches.length > 0);

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

  // Closes the dropdown Modal and dismisses the keyboard — but NOT in the
  // same tick. Calling Keyboard.dismiss() synchronously alongside the
  // setState that hides a <Modal> races two independent native UIKit
  // transitions (the modal's own dismiss animation, and the keyboard's)
  // against each other; iOS can drop or stall one, and on this app that
  // manifested as a fully reproducible, permanently-stuck-open transparent
  // full-screen Modal — invisible, but still capturing every touch on
  // screen, anywhere, until a force-quit. (A real, documented React
  // Native/UIKit failure class, not specific to this app — see e.g.
  // facebook/react-native#8562, "Attempt to dismiss from view controller
  // while a presentation or dismiss is in progress!") Fix: let the
  // Modal's own hide transition start and commit on its own tick first;
  // only ask the OS to dismiss the keyboard afterward.
  const closeResults = () => {
    setShowResults(false);
    setTimeout(Keyboard.dismiss, 0);
  };

  const handleSelect = (result: SearchResult) => {
    closeResults();
    // Clear back to empty rather than filling in the selected name — the
    // place itself now shows on the map/its card, and leaving the box
    // empty means focusing it again immediately offers recents/favorites
    // instead of just re-running the same search. (Callers that want the
    // name to stick around instead — a directions field — pass
    // clearOnSelect={false}.)
    setQuery(clearOnSelect ? '' : result.name);
    onSelect(result);
  };

  const handleExtraShortcut = (onPress: () => void) => {
    closeResults();
    onPress();
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
    // A clearOnSelect={false} field (a directions row) shows the previously
    // picked place's name rather than staying empty — clear it on refocus,
    // same as Naver/Kakao, so re-tapping it to change your mind offers
    // recents/favorites immediately instead of making you delete the old
    // name by hand first. Safe to do synchronously — this only touches
    // local text state, not the Modal-mounting race markOpened defers for.
    if (!clearOnSelect && query) setQuery('');
    onFocus?.();
  };

  const dismiss = () => {
    // Belt-and-suspenders alongside openResults's setTimeout defer above —
    // ignore a dismiss that arrives suspiciously soon after opening,
    // rather than trusting that defer alone to fully close the race in
    // every case.
    if (Date.now() - openedAtRef.current < DISMISS_GUARD_MS) return;
    closeResults();
  };

  return (
    <View style={embedded ? styles.embeddedContainer : styles.container}>
      <View style={[styles.searchBar, { backgroundColor: colors.card }, embedded && styles.searchBarEmbedded]}>
        <TextInput
          style={[styles.input, { color: colors.textPrimary }]}
          placeholder={placeholder}
          placeholderTextColor={colors.textSecondary}
          value={query}
          onChangeText={text => {
            setQuery(text);
            markOpened();
          }}
          onFocus={openResults}
          autoCorrect={false}
          returnKeyType="search"
        />
        {loading && <ActivityIndicator size="small" color={colors.textSecondary} />}
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
          <View style={[styles.modalResultsWrapper, embedded && { top: dropdownTop }]} pointerEvents="box-none">
            <ScrollView
              style={[styles.resultsBox, { backgroundColor: colors.card }]}
              keyboardShouldPersistTaps="handled">
              {showShortcuts ? (
                <>
                  {extraShortcuts?.map(shortcut => (
                    <Pressable
                      key={shortcut.label}
                      style={[styles.resultRow, { borderBottomColor: colors.divider }]}
                      onPress={() => handleExtraShortcut(shortcut.onPress)}
                      accessibilityRole="button"
                      accessibilityLabel={stripLeadingEmoji(shortcut.label)}>
                      <Text style={[styles.resultName, { color: colors.textPrimary }]}>{shortcut.label}</Text>
                    </Pressable>
                  ))}
                  {favorites.length > 0 && (
                    <>
                      <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>⭐ Saved places</Text>
                      {favorites.map(item => (
                        <Pressable
                          key={item.id}
                          style={[styles.resultRow, { borderBottomColor: colors.divider }]}
                          onPress={() => handleSelect(item)}
                          accessibilityRole="button"
                          accessibilityLabel={item.name}>
                          <Text style={[styles.resultName, { color: colors.textPrimary }]}>{item.name}</Text>
                          <Text style={[styles.resultSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                            {item.subtitle}
                          </Text>
                        </Pressable>
                      ))}
                    </>
                  )}
                  {recentSearches.length > 0 && (
                    <>
                      <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>🕐 Recent</Text>
                      {recentSearches.map(item => (
                        <Pressable
                          key={item.id}
                          style={[styles.resultRow, { borderBottomColor: colors.divider }]}
                          onPress={() => handleSelect(item)}
                          accessibilityRole="button"
                          accessibilityLabel={item.name}>
                          <Text style={[styles.resultName, { color: colors.textPrimary }]}>{item.name}</Text>
                          <Text style={[styles.resultSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
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
                    style={[styles.resultRow, { borderBottomColor: colors.divider }]}
                    onPress={() => handleSelect(item)}
                    accessibilityRole="button"
                    accessibilityLabel={item.name}>
                    <Text style={[styles.resultName, { color: colors.textPrimary }]}>{item.name}</Text>
                    <Text style={[styles.resultSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
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
  // embedded mode has no absolute positioning (the parent card lays it out
  // in normal flex flow) but still needs to actually fill the row's
  // remaining width — a plain `undefined` style here would size to content
  // instead, leaving DirectionsSearchPanel's clear button oddly placed
  // right up against the input rather than pinned to the row's far edge.
  embeddedContainer: {
    flex: 1,
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
  searchBarEmbedded: {
    backgroundColor: 'transparent',
    borderRadius: 0,
    paddingHorizontal: 0,
    shadowOpacity: 0,
    elevation: 0,
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
