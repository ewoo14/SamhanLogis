/**
 * OrderFormScreen — 주문 작성.
 *
 * legacy 출처: partner-order index.html `.wrap` 4 카드 grid (메인 SPA).
 * 본 RN 버전은 단일 column 으로 변환 (모바일 적합).
 *
 * F8 분기계산 본 작업 보류 — 코어 주문 기능 우선.
 *
 * UUID 미노출 — modelCode + 거래처명 + orderNumber 만 사용자 노출.
 */

import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { createPartnerOrder } from '@/api/partnerOrder';
import { RNBadge } from '@/components/RNBadge';
import { RNButton } from '@/components/RNButton';
import { RNCard } from '@/components/RNCard';
import { RNFormField } from '@/components/RNFormField';
import { ScreenContainer } from '@/components/ScreenContainer';
import { useOrderDraftStore } from '@/stores/orderDraftStore';
import { categoryColors, colors, fontSize, fontWeight, radii, spacing } from '@/tokens/tokens';
import type { OrderStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<OrderStackParamList, 'OrderForm'>;

export function OrderFormScreen(): JSX.Element {
  const nav = useNavigation<Nav>();
  const draft = useOrderDraftStore();

  const total = useMemo(
    () => draft.lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0),
    [draft.lines],
  );

  const submit = useMutation({
    mutationFn: () =>
      createPartnerOrder({
        orderDate: new Date().toISOString().slice(0, 10),
        shippingAddress: draft.shippingAddress,
        receiverPhone: draft.receiverPhone,
        memo: draft.memo,
        lines: draft.lines.map((l) => ({ modelCode: l.modelCode, qty: l.qty, unitPrice: l.unitPrice })),
      }),
    onSuccess: (created) => {
      Alert.alert('주문 접수 완료', `주문번호 ${created.orderNumber} 가 접수되었습니다.`);
      draft.reset();
      nav.navigate('OrderDetail', { orderId: created.id, orderNumber: created.orderNumber });
    },
    onError: () => {
      Alert.alert('오류', '주문 접수에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    },
  });

  const handlePickProduct = (): void => {
    nav.navigate('ProductPicker', {
      onPick: (modelCode, modelName) => {
        draft.addLine({ category: 'HW', modelCode, modelName, qty: 1, unitPrice: 0 });
      },
    });
  };

  return (
    <ScreenContainer>
      {/* 거래처 정보 카드 */}
      <RNCard>
        <Text style={styles.cardTitle}>배송 정보</Text>
        <View style={styles.cardBody}>
          <RNFormField
            label="배송 주소"
            placeholder="시·군·구 / 상세 주소"
            value={draft.shippingAddress}
            onChangeText={draft.setShippingAddress}
          />
          <RNFormField
            label="인수자 연락처"
            placeholder="010-0000-0000"
            keyboardType="phone-pad"
            value={draft.receiverPhone}
            onChangeText={draft.setReceiverPhone}
          />
          <RNFormField
            label="메모"
            placeholder="배송 메모"
            value={draft.memo}
            onChangeText={draft.setMemo}
            multiline
            numberOfLines={3}
          />
        </View>
      </RNCard>

      {/* 라인 카드 */}
      <RNCard>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>주문 라인</Text>
          <RNBadge label={`${draft.lines.length}건`} tone="brand" />
        </View>

        {draft.lines.length === 0 ? (
          <View style={styles.emptyLines}>
            <Text style={styles.emptyText}>품목 추가 버튼으로 라인을 추가해 주세요.</Text>
          </View>
        ) : (
          <View style={styles.lineList}>
            {draft.lines.map((line, idx) => (
              <View key={line.tempKey} style={styles.line} testID={`line-${idx}`}>
                <View style={styles.lineHead}>
                  <View style={[styles.catDot, { backgroundColor: categoryColors[line.category] }]} />
                  <Text style={styles.modelCode}>{line.modelCode}</Text>
                  <Pressable onPress={() => draft.removeLine(line.tempKey)} hitSlop={8}>
                    <Text style={styles.removeText}>삭제</Text>
                  </Pressable>
                </View>
                <Text style={styles.modelName} numberOfLines={1}>
                  {line.modelName}
                </Text>
                <View style={styles.lineRow}>
                  <View style={styles.qtyCol}>
                    <Text style={styles.fieldLabel}>수량</Text>
                    <RNFormField
                      placeholder="1"
                      keyboardType="number-pad"
                      value={String(line.qty)}
                      onChangeText={(v) => draft.updateQty(line.tempKey, Number(v.replace(/[^0-9]/g, '') || '0'))}
                    />
                  </View>
                  <View style={styles.priceCol}>
                    <Text style={styles.fieldLabel}>단가</Text>
                    <Text style={styles.priceText}>{formatKRW(line.unitPrice)}</Text>
                  </View>
                  <View style={styles.amountCol}>
                    <Text style={styles.fieldLabel}>금액</Text>
                    <Text style={styles.amountText}>{formatKRW(line.qty * line.unitPrice)}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        <RNButton
          variant="secondary"
          label="+ 품목 추가"
          onPress={handlePickProduct}
          fullWidth
          style={styles.addButton}
          testID="add-product-button"
        />
      </RNCard>

      {/* 합계 카드 */}
      <RNCard>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>합계</Text>
          <Text style={styles.totalValue}>{formatKRW(total)}</Text>
        </View>
      </RNCard>

      <RNButton
        variant="primary"
        label={submit.isPending ? '접수 중...' : '주문 접수'}
        onPress={() => submit.mutate()}
        disabled={draft.lines.length === 0 || submit.isPending}
        loading={submit.isPending}
        fullWidth
        testID="submit-order"
      />
    </ScreenContainer>
  );
}

function formatKRW(n: number): string {
  return `₩${n.toLocaleString('ko-KR')}`;
}

const styles = StyleSheet.create({
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  cardTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.text },
  cardBody: { gap: 0 },
  emptyLines: { paddingVertical: spacing.lg, alignItems: 'center' },
  emptyText: { color: colors.textSubtle, fontSize: fontSize.sm },
  lineList: { gap: spacing.sm },
  line: {
    backgroundColor: colors.bgSubtle,
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  lineHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  catDot: { width: 8, height: 8, borderRadius: 4 },
  modelCode: { flex: 1, fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.text },
  removeText: { fontSize: fontSize.sm, color: colors.danger, fontWeight: fontWeight.medium },
  modelName: { fontSize: fontSize.sm, color: colors.textMuted, marginBottom: spacing.sm },
  lineRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' },
  qtyCol: { width: 90 },
  priceCol: { flex: 1 },
  amountCol: { flex: 1, alignItems: 'flex-end' },
  fieldLabel: { fontSize: fontSize.xs, color: colors.textSubtle, marginBottom: spacing.xs },
  priceText: { fontSize: fontSize.base, color: colors.text, paddingVertical: 12 },
  amountText: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.brand500, paddingVertical: 12 },
  addButton: { marginTop: spacing.sm },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.text },
  totalValue: { fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, color: colors.brand500 },
});
