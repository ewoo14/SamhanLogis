/**
 * CustomerSearchScreen — P1-4 영업 native 앱 거래처 빠른 검색 (자동완성).
 *
 * BE: partner-service GET /api/v1/partners/quick-search?q=&size=20
 *     (@PreAuthorize SALES/MANAGER/MASTER)
 *
 * UUID 비공개:
 *   - FlatList 에는 partnerCode + partnerName + representativeName 만 표시.
 *   - id(UUID)는 onSelect 콜백에서 상위로만 전달, 화면에 노출하지 않음.
 *
 * 키워드 2자 이상 입력 시 자동 검색 (400ms debounce).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { quickSearchCustomer, type CustomerSummary } from '../../api/sales';
import { colors, radii, spacing, typography } from '../../theme/tokens';

interface Props {
  token: string | null;
  /**
   * 거래처 선택 콜백.
   * 상위(견적/주문 화면)에서 거래처 UUID + 이름 수신.
   * UUID 비공개: 이 콜백은 내부 라우팅용이며 사용자에게 UUID 노출 안 됨.
   */
  onSelect?: (customer: CustomerSummary) => void;
  /** 독립 화면 모드 (onSelect 없이 단독 사용 시 true — 검색 결과만 표시) */
  standalone?: boolean;
}

type SearchState = 'idle' | 'loading' | 'ok' | 'error';

const DEBOUNCE_MS = 400;
const MIN_QUERY_LEN = 2;

export default function CustomerSearchScreen({ token, onSelect, standalone = false }: Props): JSX.Element {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CustomerSummary[]>([]);
  const [searchState, setSearchState] = useState<SearchState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(
    async (q: string) => {
      if (q.length < MIN_QUERY_LEN) {
        setResults([]);
        setSearchState('idle');
        return;
      }
      setSearchState('loading');
      setErrorMsg('');
      try {
        const list = await quickSearchCustomer(q, token);
        setResults(list);
        setSearchState('ok');
      } catch (e) {
        const msg = e instanceof Error ? e.message : '거래처 검색 중 오류가 발생했습니다.';
        setErrorMsg(msg);
        setSearchState('error');
        setResults([]);
      }
    },
    [token],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void doSearch(query);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, doSearch]);

  const renderItem = useCallback(
    ({ item }: { item: CustomerSummary }) => (
      <CustomerRow
        item={item}
        onPress={onSelect ? () => onSelect(item) : undefined}
        selectable={!standalone && Boolean(onSelect)}
      />
    ),
    [onSelect, standalone],
  );

  const keyExtractor = useCallback((item: CustomerSummary) => item.id, []);

  return (
    <View style={styles.container}>
      {/* 검색 입력 */}
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="거래처명 또는 코드 입력 (2자 이상)"
          placeholderTextColor={colors.ink.tertiary}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          testID="customer-search-input"
        />
        {searchState === 'loading' && (
          <ActivityIndicator
            size="small"
            color={colors.action.brand}
            style={styles.searchSpinner}
          />
        )}
      </View>

      {/* 상태별 본문 */}
      {searchState === 'idle' && query.length === 0 && (
        <View style={styles.hint}>
          <Text style={styles.hintText}>거래처명이나 코드를 입력하세요.</Text>
        </View>
      )}

      {searchState === 'idle' && query.length > 0 && query.length < MIN_QUERY_LEN && (
        <View style={styles.hint}>
          <Text style={styles.hintText}>{MIN_QUERY_LEN}자 이상 입력하면 검색합니다.</Text>
        </View>
      )}

      {searchState === 'error' && (
        <View style={styles.hint}>
          <Text style={styles.errorText}>{errorMsg}</Text>
          <TouchableOpacity onPress={() => void doSearch(query)} style={styles.retryBtn}>
            <Text style={styles.retryBtnLabel}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      )}

      {searchState === 'ok' && results.length === 0 && (
        <View style={styles.hint}>
          <Text style={styles.hintText}>"{query}" 에 해당하는 거래처가 없습니다.</Text>
        </View>
      )}

      {searchState === 'ok' && results.length > 0 && (
        <>
          <Text style={styles.resultCount}>{results.length}건 조회됨</Text>
          <FlatList
            data={results}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            ItemSeparatorComponent={Separator}
          />
        </>
      )}
    </View>
  );
}

// -----------------------------------------------------------------------
// 서브 컴포넌트
// -----------------------------------------------------------------------

interface CustomerRowProps {
  item: CustomerSummary;
  onPress?: () => void;
  selectable: boolean;
}

function CustomerRow({ item, onPress, selectable }: CustomerRowProps): JSX.Element {
  const Container = selectable && onPress ? TouchableOpacity : View;
  return (
    <Container
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.7}
      testID={`customer-row-${item.partnerCode}`}
    >
      <View style={styles.rowMain}>
        {/* UUID 비공개: partnerCode 만 표시 */}
        <Text style={styles.rowCode}>{item.partnerCode}</Text>
        <Text style={styles.rowName}>{item.partnerName}</Text>
      </View>
      <View style={styles.rowSub}>
        {item.representativeName && (
          <Text style={styles.rowSubText}>대표: {item.representativeName}</Text>
        )}
        {item.phone && (
          <Text style={styles.rowSubText}>{item.phone}</Text>
        )}
      </View>
      {selectable && (
        <Text style={styles.selectArrow}>›</Text>
      )}
    </Container>
  );
}

function Separator(): JSX.Element {
  return <View style={styles.separator} />;
}

// -----------------------------------------------------------------------
// 스타일
// -----------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.app },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.line.default,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  searchInput: {
    flex: 1,
    height: 42,
    fontSize: typography.fontSize.base,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
    backgroundColor: colors.surface.subtle,
    borderRadius: radii.sm,
    paddingHorizontal: spacing[3],
  },
  searchSpinner: { marginLeft: spacing[3] },
  hint: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing[6],
    gap: spacing[4],
  },
  hintText: {
    fontSize: typography.fontSize.base,
    color: colors.ink.tertiary,
    fontFamily: typography.fontFamily.sans,
    textAlign: 'center',
  },
  errorText: {
    fontSize: typography.fontSize.base,
    color: colors.state.danger,
    fontFamily: typography.fontFamily.sans,
    textAlign: 'center',
  },
  retryBtn: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[5],
    backgroundColor: colors.action.brand,
    borderRadius: radii.button,
  },
  retryBtnLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.onPrimary,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
  },
  resultCount: {
    fontSize: typography.fontSize.xs,
    color: colors.ink.tertiary,
    fontFamily: typography.fontFamily.sans,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    backgroundColor: colors.surface.subtle,
  },
  list: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    backgroundColor: colors.surface.card,
    gap: spacing[2],
  },
  rowMain: { flex: 1 },
  rowCode: {
    fontSize: typography.fontSize.xs,
    color: colors.ink.tertiary,
    fontFamily: typography.fontFamily.sans,
    fontWeight: typography.fontWeight.medium,
    marginBottom: 2,
  },
  rowName: {
    fontSize: typography.fontSize.base,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
    fontWeight: typography.fontWeight.medium,
  },
  rowSub: { gap: 1 },
  rowSubText: {
    fontSize: typography.fontSize.xs,
    color: colors.ink.secondary,
    fontFamily: typography.fontFamily.sans,
  },
  selectArrow: {
    fontSize: typography.fontSize.lg,
    color: colors.ink.tertiary,
    fontFamily: typography.fontFamily.sans,
  },
  separator: {
    height: 1,
    backgroundColor: colors.line.default,
    marginLeft: spacing[4],
  },
});
