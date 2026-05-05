/**
 * OrderDetailScreen — 주문 상세 (조회 only).
 *
 * legacy 출처: partner-order Code.js `.order-list` row 클릭 → 상세 미리보기.
 * UUID 미노출 — orderNumber + modelCode + 거래처명 만 노출.
 */

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { fetchPartnerOrderDetail, type PartnerOrderStatus } from '@/api/partnerOrder';
import { RNBadge, type RNBadgeTone } from '@/components/RNBadge';
import { RNButton } from '@/components/RNButton';
import { RNCard } from '@/components/RNCard';
import { ScreenContainer } from '@/components/ScreenContainer';
import { colors, fontSize, fontWeight, spacing } from '@/tokens/tokens';
import type { OrderStackParamList } from '@/navigation/types';

const STATUS_LABEL: Record<PartnerOrderStatus, string> = {
  DRAFT: '임시저장',
  SUBMITTED: '접수',
  CONFIRMED: '확정',
  SHIPPED: '발송완료',
  CANCELLED: '취소',
};
const STATUS_TONE: Record<PartnerOrderStatus, RNBadgeTone> = {
  DRAFT: 'neutral',
  SUBMITTED: 'info',
  CONFIRMED: 'brand',
  SHIPPED: 'success',
  CANCELLED: 'danger',
};

type Props = NativeStackScreenProps<OrderStackParamList, 'OrderDetail'>;

export function OrderDetailScreen({ route, navigation }: Props): JSX.Element {
  const { orderId, orderNumber } = route.params;
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['partner-order', orderId],
    queryFn: () => fetchPartnerOrderDetail(orderId),
  });

  if (isLoading) {
    return (
      <ScreenContainer scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand500} />
        </View>
      </ScreenContainer>
    );
  }

  if (isError || !data) {
    return (
      <ScreenContainer scroll={false}>
        <View style={styles.center}>
          <Text style={styles.errorText}>주문 상세를 불러오지 못했습니다.</Text>
          <RNButton variant="secondary" label="다시 시도" onPress={() => refetch()} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <RNCard>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.orderNumber}>{data.orderNumber || orderNumber}</Text>
            <Text style={styles.orderDate}>{data.orderDate}</Text>
          </View>
          <RNBadge label={STATUS_LABEL[data.status]} tone={STATUS_TONE[data.status]} />
        </View>
        <View style={styles.divider} />
        <KV label="거래처" value={data.partnerName} />
        <KV label="배송지" value={data.shippingAddress ?? '-'} />
        <KV label="인수자" value={data.receiverPhone ?? '-'} />
        {data.dueDate ? <KV label="납기일" value={data.dueDate} /> : null}
        {data.externalSlipNo ? <KV label="출고전표" value={data.externalSlipNo} /> : null}
      </RNCard>

      <RNCard>
        <Text style={styles.sectionTitle}>주문 라인 ({data.lines.length}건)</Text>
        <View style={styles.lineList}>
          {data.lines.map((line) => (
            <View key={line.id} style={styles.line}>
              <View style={styles.lineHead}>
                <Text style={styles.lineNo}>#{line.lineNo}</Text>
                <Text style={styles.modelCode}>{line.modelCode}</Text>
              </View>
              <Text style={styles.modelName}>{line.modelName}</Text>
              {line.productSpecs && line.productSpecs.length > 0 ? (
                <View style={styles.specs}>
                  {line.productSpecs.map((s) => (
                    <Text key={s.specKey} style={styles.specText}>
                      {s.specKey}: {s.specValue} {s.unit ?? ''}
                    </Text>
                  ))}
                </View>
              ) : null}
              <View style={styles.lineFoot}>
                <Text style={styles.lineMeta}>
                  {line.qty} × {formatKRW(line.unitPrice)}
                </Text>
                <Text style={styles.lineAmount}>{formatKRW(line.amount)}</Text>
              </View>
            </View>
          ))}
        </View>
        <View style={styles.divider} />
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>합계</Text>
          <Text style={styles.totalValue}>{formatKRW(data.totalAmount)}</Text>
        </View>
      </RNCard>

      {data.memo ? (
        <RNCard>
          <Text style={styles.sectionTitle}>메모</Text>
          <Text style={styles.memoText}>{data.memo}</Text>
        </RNCard>
      ) : null}

      <RNButton variant="secondary" label="목록으로" onPress={() => navigation.popToTop()} fullWidth />
    </ScreenContainer>
  );
}

function KV({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <View style={styles.kvRow}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={styles.kvValue}>{value}</Text>
    </View>
  );
}

function formatKRW(n: number): string {
  return `₩${n.toLocaleString('ko-KR')}`;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.base },
  errorText: { color: colors.danger, fontSize: fontSize.base, marginBottom: spacing.sm },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flex: 1 },
  orderNumber: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text },
  orderDate: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.xs },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  kvRow: { flexDirection: 'row', paddingVertical: spacing.xs },
  kvLabel: { width: 80, fontSize: fontSize.sm, color: colors.textMuted },
  kvValue: { flex: 1, fontSize: fontSize.sm, color: colors.text },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.sm },
  lineList: { gap: spacing.sm },
  line: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  lineHead: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  lineNo: { fontSize: fontSize.xs, color: colors.textSubtle, fontWeight: fontWeight.medium },
  modelCode: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.text },
  modelName: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.xs },
  specs: { marginTop: spacing.xs, gap: 2 },
  specText: { fontSize: fontSize.xs, color: colors.textSubtle },
  lineFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  lineMeta: { fontSize: fontSize.sm, color: colors.textMuted },
  lineAmount: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.text },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.text },
  totalValue: { fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, color: colors.brand500 },
  memoText: { fontSize: fontSize.sm, color: colors.text, lineHeight: fontSize.sm * 1.5 },
});
