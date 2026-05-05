/**
 * OrderListScreen — 거래처 본인 주문 목록.
 *
 * legacy 출처: partner-order Code.js getOrderHistory (Notion ORDER_003).
 * UUID 미노출 — orderNumber + 주문일 + 합계 만 노출 (id 는 navigation params 내부 만).
 *
 * status filter: ALL / DRAFT / SUBMITTED / CONFIRMED / SHIPPED / CANCELLED
 */

import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchPartnerOrders, type PartnerOrderMaster, type PartnerOrderStatus } from '@/api/partnerOrder';
import { RNBadge, type RNBadgeTone } from '@/components/RNBadge';
import { RNButton } from '@/components/RNButton';
import { ScreenContainer } from '@/components/ScreenContainer';
import { colors, fontSize, fontWeight, radii, spacing } from '@/tokens/tokens';
import type { OrderStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<OrderStackParamList, 'OrderList'>;

const FILTERS: Array<{ key: PartnerOrderStatus | 'ALL'; label: string }> = [
  { key: 'ALL', label: '전체' },
  { key: 'DRAFT', label: '임시' },
  { key: 'SUBMITTED', label: '접수' },
  { key: 'CONFIRMED', label: '확정' },
  { key: 'SHIPPED', label: '발송' },
  { key: 'CANCELLED', label: '취소' },
];

const STATUS_TONE: Record<PartnerOrderStatus, RNBadgeTone> = {
  DRAFT: 'neutral',
  SUBMITTED: 'info',
  CONFIRMED: 'brand',
  SHIPPED: 'success',
  CANCELLED: 'danger',
};

const STATUS_LABEL: Record<PartnerOrderStatus, string> = {
  DRAFT: '임시저장',
  SUBMITTED: '접수',
  CONFIRMED: '확정',
  SHIPPED: '발송완료',
  CANCELLED: '취소',
};

export function OrderListScreen(): JSX.Element {
  const nav = useNavigation<Nav>();
  const [filter, setFilter] = useState<PartnerOrderStatus | 'ALL'>('ALL');

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['partner-orders', filter],
    queryFn: () => fetchPartnerOrders(filter === 'ALL' ? undefined : filter),
  });

  return (
    <ScreenContainer scroll={false} padded={false}>
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.key}
            onPress={() => setFilter(f.key)}
            style={[styles.chip, filter === f.key && styles.chipActive]}
          >
            <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>{f.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.actionRow}>
        <RNButton
          variant="primary"
          label="+ 새 주문 작성"
          onPress={() => nav.navigate('OrderForm')}
          fullWidth
          testID="new-order-button"
        />
      </View>

      {isLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={colors.brand500} />
        </View>
      ) : isError ? (
        <View style={styles.centerBox}>
          <Text style={styles.errorText}>주문 목록을 불러오지 못했습니다.</Text>
          <RNButton variant="secondary" label="다시 시도" onPress={() => refetch()} />
        </View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshing={isRefetching}
          onRefresh={refetch}
          ListEmptyComponent={
            <View style={styles.centerBox}>
              <Text style={styles.emptyText}>해당 상태의 주문이 없습니다.</Text>
            </View>
          }
          renderItem={({ item }) => <OrderRow item={item} onPress={() => nav.navigate('OrderDetail', { orderId: item.id, orderNumber: item.orderNumber })} />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </ScreenContainer>
  );
}

function OrderRow({ item, onPress }: { item: PartnerOrderMaster; onPress: () => void }): JSX.Element {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={styles.rowHead}>
        <Text style={styles.orderNumber} numberOfLines={1}>
          {item.orderNumber}
        </Text>
        <RNBadge label={STATUS_LABEL[item.status]} tone={STATUS_TONE[item.status]} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.metaText}>주문일 {item.orderDate}</Text>
        <Text style={styles.amountText}>{formatKRW(item.totalAmount)}</Text>
      </View>
      {item.shippingAddress ? (
        <Text style={styles.addressText} numberOfLines={1}>
          {item.shippingAddress}
        </Text>
      ) : null}
    </Pressable>
  );
}

function formatKRW(n: number): string {
  return `₩${n.toLocaleString('ko-KR')}`;
}

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.neutral0,
  },
  chipActive: {
    backgroundColor: colors.brand500,
    borderColor: colors.brand500,
  },
  chipText: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: fontWeight.medium,
  },
  chipTextActive: {
    color: colors.textOnBrand,
    fontWeight: fontWeight.semibold,
  },
  actionRow: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['2xl'],
    gap: spacing.base,
  },
  emptyText: { color: colors.textSubtle, fontSize: fontSize.base },
  errorText: { color: colors.danger, fontSize: fontSize.base, marginBottom: spacing.sm },
  listContent: { padding: spacing.base, gap: spacing.sm, paddingBottom: spacing['2xl'] },
  separator: { height: spacing.sm },
  row: {
    backgroundColor: colors.neutral0,
    padding: spacing.base,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  rowPressed: { backgroundColor: colors.bgSubtle },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderNumber: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.text, flex: 1, marginRight: spacing.sm },
  rowBody: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaText: { fontSize: fontSize.sm, color: colors.textMuted },
  amountText: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.brand500 },
  addressText: { fontSize: fontSize.xs, color: colors.textSubtle, marginTop: spacing.xs },
});
