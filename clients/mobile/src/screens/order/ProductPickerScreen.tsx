/**
 * ProductPickerScreen v2 — 품목 선택 모달 (legacy 모바일 분기 1:1).
 *
 * DECISIONS Phase 6 정정:
 *   - #4 — '모델 코드' → '모델명'
 *   - #5 — '품명' → '품목명'
 *   - #12 — DC 적용 가격 표시
 *   - #16 — partner-order index.html 모바일 viewport 분기 1:1
 *
 * legacy 출처:
 *   - line 152~ : `dialog#dlgPreview` modal layout (border-radius:16px; max-width:640px)
 *   - line 175~ : `@media (max-width: 1280px)` 모달 모바일 분기
 *   - line 380~ : 모바일 검색 input (`.filter-search input { width:100%; height:100%; font-size:16px; padding-left:36px }`)
 *   - line 1192~ : `.mobile-handle-bar` / drawer 핸들 (메뉴/검색 진입 UX)
 *
 * RN modal presentation 으로 stack 등록.
 *
 * UUID 미노출 — modelCode + modelName 만 노출.
 */

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchProducts, type EstimateCategory, type ProductMaster } from '@/api/product';
import { useDcConfigStore } from '@/stores/dcConfigStore';
import { legacyVars } from '@/styles/legacyMobile';
import { calcDcPrice, type DcCategory } from '@/utils/calcDcPrice';
import type { LegacyCategory, OrderStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<OrderStackParamList, 'ProductPicker'>;

/** 4 카테고리 — legacy 의 4 카드 (line 122) 와 동일 */
const CATEGORIES: Array<{ key: EstimateCategory; label: string }> = [
  { key: 'HW', label: '원자재' },
  { key: 'ACC', label: '부속품' },
  { key: 'ETC', label: '기타' },
  { key: 'CTRL', label: '컨트롤러' },
];

/** legacy 카테고리 → DcCategory 매핑 (HOMEMULTI 등 — 단가 표시용) */
function mapDcCategory(legacy: LegacyCategory | undefined): DcCategory {
  if (legacy === 'home' || legacy === 'single') return 'HOMEMULTI';
  if (legacy === 'comm') return 'COMMERCIAL_MULTI';
  return 'OTHER';
}

export function ProductPickerScreen({ route, navigation }: Props): JSX.Element {
  const { onPick, initialCategory } = route.params;
  const [category, setCategory] = useState<EstimateCategory>('HW');
  const [q, setQ] = useState('');
  const dcConfig = useDcConfigStore((s) => s.config);
  const dcCategory = mapDcCategory(initialCategory);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['products', category, q],
    queryFn: () => fetchProducts(category, q || undefined),
  });

  const handleSelect = (product: ProductMaster): void => {
    onPick(product.modelCode, product.modelName, product.defaultUnitPrice);
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.modalRoot} edges={['top', 'bottom']}>
      {/* 모달 head — legacy `dialog .modal-head` (border-bottom 1px) */}
      <View style={styles.modalHead}>
        <Text style={styles.modalTitle}>품목 선택</Text>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} testID="modal-close">
          <Text style={styles.modalCloseText}>닫기 ✕</Text>
        </Pressable>
      </View>

      {/* 4 카테고리 탭 — legacy `.opts` (line 63) 모바일 분기 */}
      <View style={styles.tabRow}>
        {CATEGORIES.map((c) => (
          <Pressable
            key={c.key}
            onPress={() => setCategory(c.key)}
            style={[styles.tab, category === c.key && styles.tabActive]}
            testID={`tab-${c.key}`}
          >
            <Text style={[styles.tabText, category === c.key && styles.tabTextActive]}>{c.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* legacy `.filter-search` (line 380) 모바일 — height:40, padding-left:36, background:#f1f5f9 */}
      <View style={styles.searchRow}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="품목명/코드 검색"
          placeholderTextColor={legacyVars.cMuted}
          value={q}
          onChangeText={setQ}
          autoCapitalize="none"
          testID="product-search"
        />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={legacyVars.cAccent} />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>품목을 불러오지 못했습니다.</Text>
          <Pressable onPress={() => refetch()} testID="retry-products">
            <Text style={styles.linkText}>다시 시도</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>해당 카테고리에 품목이 없습니다.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const base = item.defaultUnitPrice ?? 0;
            const applied = calcDcPrice(base, dcConfig, { category: dcCategory });
            const hasDc = base > 0 && applied !== base;
            return (
              <Pressable
                onPress={() => handleSelect(item)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                testID={`product-${item.modelCode}`}
              >
                {/* 품목명 (정정 #5) — 가장 굵게 */}
                <Text style={styles.itemName} numberOfLines={2}>{item.modelName}</Text>
                {/* 모델명 (정정 #4) + 단위 */}
                <View style={styles.metaRow}>
                  <Text style={styles.modelLabel}>모델명</Text>
                  <Text style={styles.modelText}>{item.modelCode}</Text>
                  {item.unit ? <Text style={styles.unitText}>· {item.unit}</Text> : null}
                </View>
                {/* DC 적용가 표시 (정정 #12) */}
                {base > 0 ? (
                  <View style={styles.priceRow}>
                    {hasDc ? (
                      <>
                        <Text style={styles.priceOriginal}>{formatKRW(base)}</Text>
                        <Text style={styles.priceApplied}>{formatKRW(applied)}</Text>
                      </>
                    ) : (
                      <Text style={styles.priceText}>{formatKRW(applied)}</Text>
                    )}
                  </View>
                ) : null}
              </Pressable>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </SafeAreaView>
  );
}

function formatKRW(n: number): string {
  return `₩${n.toLocaleString('ko-KR')}`;
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    backgroundColor: legacyVars.cBg,
  },
  // legacy `dialog .modal-head` (line 152) — border-bottom 1px
  modalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: legacyVars.cLine,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: legacyVars.cStrong,
  },
  modalCloseText: {
    fontSize: 14,
    color: legacyVars.cAccent,
    fontWeight: '700',
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 12,
    gap: 6,
  },
  // legacy `.opts .chip` 형 — height 36, padding 8/12, border 1px
  tab: {
    flex: 1,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: legacyVars.cLine,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  tabActive: {
    backgroundColor: legacyVars.cAccent,
    borderColor: legacyVars.cAccent,
  },
  tabText: { fontSize: 14, fontWeight: '700', color: legacyVars.cStrong },
  tabTextActive: { color: '#FFFFFF' },
  // legacy `.filter-search` 모바일 (line 380~382)
  searchRow: {
    paddingHorizontal: 12,
    paddingTop: 12,
    position: 'relative',
  },
  searchIcon: {
    position: 'absolute',
    left: 22,
    top: 22,
    fontSize: 16,
    zIndex: 2,
  },
  searchInput: {
    width: '100%',
    height: 40,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingLeft: 36,
    paddingRight: 10,
    fontSize: 16,
    color: legacyVars.cStrong,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 8,
  },
  errorText: { color: legacyVars.bizDanger, fontSize: 14 },
  emptyText: { color: legacyVars.cMuted, fontSize: 14 },
  linkText: { color: legacyVars.cAccent, fontSize: 14, fontWeight: '700' },
  listContent: { padding: 12, paddingBottom: 32 },
  separator: { height: 8 },
  row: {
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: legacyVars.cLine,
    gap: 4,
  },
  rowPressed: { backgroundColor: '#F8FAFC' },
  itemName: {
    fontSize: 15,
    fontWeight: '800',
    color: legacyVars.cStrong,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  modelLabel: {
    fontSize: 11,
    color: legacyVars.cMuted,
    fontWeight: '700',
  },
  modelText: { fontSize: 13, color: legacyVars.cStrong, fontWeight: '600' },
  unitText: { fontSize: 12, color: legacyVars.cMuted },
  priceRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'baseline', gap: 8, marginTop: 4 },
  priceOriginal: {
    fontSize: 12,
    color: legacyVars.cMuted,
    textDecorationLine: 'line-through',
  },
  priceApplied: {
    fontSize: 15,
    color: legacyVars.cAccent,
    fontWeight: '800',
  },
  priceText: { fontSize: 14, color: legacyVars.cStrong, fontWeight: '700' },
});
