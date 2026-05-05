/**
 * ProductPickerScreen — 품목 선택 모달.
 *
 * legacy 출처: partner-order index.html ProductPickerModal (usageScope 자동 필터).
 * RN 의 modal presentation 으로 stack 등록.
 *
 * UUID 미노출 — modelCode + modelName 만 노출.
 */

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchProducts, type EstimateCategory, type ProductMaster } from '@/api/product';
import { RNFormField } from '@/components/RNFormField';
import { ScreenContainer } from '@/components/ScreenContainer';
import { categoryColors, colors, fontSize, fontWeight, radii, spacing } from '@/tokens/tokens';
import type { OrderStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<OrderStackParamList, 'ProductPicker'>;

const CATEGORIES: Array<{ key: EstimateCategory; label: string }> = [
  { key: 'HW', label: '원자재' },
  { key: 'ACC', label: '부속품' },
  { key: 'ETC', label: '기타' },
  { key: 'CTRL', label: '컨트롤러' },
];

export function ProductPickerScreen({ route, navigation }: Props): JSX.Element {
  const { onPick } = route.params;
  const [category, setCategory] = useState<EstimateCategory>('HW');
  const [q, setQ] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['products', category, q],
    queryFn: () => fetchProducts(category, q || undefined),
  });

  const handleSelect = (product: ProductMaster): void => {
    onPick(product.modelCode, product.modelName);
    navigation.goBack();
  };

  return (
    <ScreenContainer scroll={false} padded={false}>
      <View style={styles.tabRow}>
        {CATEGORIES.map((c) => (
          <Pressable
            key={c.key}
            onPress={() => setCategory(c.key)}
            style={[styles.tab, category === c.key && styles.tabActive]}
          >
            <View style={[styles.tabDot, { backgroundColor: categoryColors[c.key] }]} />
            <Text style={[styles.tabText, category === c.key && styles.tabTextActive]}>{c.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.searchRow}>
        <RNFormField
          placeholder="품목명/코드 검색"
          value={q}
          onChangeText={setQ}
          autoCapitalize="none"
          testID="product-search"
        />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand500} />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>품목을 불러오지 못했습니다.</Text>
          <Pressable onPress={() => refetch()}>
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
          renderItem={({ item }) => (
            <Pressable
              onPress={() => handleSelect(item)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              testID={`product-${item.modelCode}`}
            >
              <View style={styles.rowHead}>
                <View style={[styles.catDot, { backgroundColor: categoryColors[item.category] }]} />
                <Text style={styles.modelCode}>{item.modelCode}</Text>
                {item.unit ? <Text style={styles.unitText}>{item.unit}</Text> : null}
              </View>
              <Text style={styles.modelName} numberOfLines={2}>
                {item.modelName}
              </Text>
              {item.defaultUnitPrice ? (
                <Text style={styles.priceText}>₩{item.defaultUnitPrice.toLocaleString('ko-KR')}</Text>
              ) : null}
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    gap: spacing.sm,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.neutral0,
  },
  tabActive: { borderColor: colors.brand500, backgroundColor: colors.brand50 },
  tabDot: { width: 8, height: 8, borderRadius: 4 },
  tabText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.text },
  tabTextActive: { color: colors.brand700, fontWeight: fontWeight.semibold },
  searchRow: { paddingHorizontal: spacing.base, paddingTop: spacing.base },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['2xl'], gap: spacing.sm },
  errorText: { color: colors.danger, fontSize: fontSize.base },
  emptyText: { color: colors.textSubtle, fontSize: fontSize.base },
  linkText: { color: colors.brand500, fontSize: fontSize.base, fontWeight: fontWeight.medium },
  listContent: { padding: spacing.base, paddingBottom: spacing['2xl'] },
  separator: { height: spacing.sm },
  row: {
    backgroundColor: colors.neutral0,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowPressed: { backgroundColor: colors.bgSubtle },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  catDot: { width: 8, height: 8, borderRadius: 4 },
  modelCode: { flex: 1, fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.text },
  unitText: { fontSize: fontSize.xs, color: colors.textSubtle },
  modelName: { fontSize: fontSize.sm, color: colors.textMuted },
  priceText: { marginTop: spacing.xs, fontSize: fontSize.sm, color: colors.brand500, fontWeight: fontWeight.semibold },
});
