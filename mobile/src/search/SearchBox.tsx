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

type Props = {
  onSelect: (result: SearchResult) => void;
};

export default function SearchBox({ onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
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
  }, [query]);

  const handleSelect = (result: SearchResult) => {
    Keyboard.dismiss();
    setShowResults(false);
    setQuery(result.name);
    onSelect(result);
  };

  const dismiss = () => {
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
            setShowResults(true);
          }}
          onFocus={() => setShowResults(true)}
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
        visible={showResults && results.length > 0}
        animationType="none"
        onRequestClose={dismiss}>
        <Pressable style={styles.backdrop} onPress={dismiss}>
          <View style={styles.modalResultsWrapper} pointerEvents="box-none">
            <ScrollView
              style={styles.resultsBox}
              keyboardShouldPersistTaps="handled">
              {results.map(item => (
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
