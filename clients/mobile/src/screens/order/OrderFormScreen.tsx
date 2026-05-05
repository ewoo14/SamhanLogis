/**
 * OrderFormScreen v3 — 주문 작성 (legacy 모바일 분기 1:1) + 정정 #18 cardOrderInfo 흐름.
 *
 * DECISIONS Phase 6 정정:
 *   - #4 — '모델 코드' → '모델명'
 *   - #5 — '품명' → '품목명'
 *   - #8 — 견적/주문 번호 양식 `YYYY/MM/DD - 0001` (formatSlipNumber)
 *   - #12 — 거래처 DC율 자동 적용된 가격 표시 (calcDcPrice)
 *   - #16 — partner-order index.html 모바일 viewport 분기 1:1 (legacy 테이블 layout)
 *   - #18 (v3) — 라인 1건 이상 추가 시 cardOrderInfo (배송지/요청사항/납기/연락처) 섹션 자동 표시 + scrollTo
 *
 * legacy 출처 (`migration/source/scripts/partner-order/index.html`):
 *   - line 175~ : `@media (max-width: 1280px)` 모바일 분기
 *   - line 222~248 : `.est-table th, .est-table td` 모바일 셀 스타일 (min-height:44px; padding:4px 3px)
 *   - line 233~234 : `.est-table th.colL.mobile-only / td.colD.mobile-only` 품목명 셀
 *   - line 1024~1082 : 주문정보 모달 폼 (배송주소 / 인수자번호 / 납기희망일 / 요청사항)
 *     - line 1056 `#tel` 인수자번호 (010-XXXX-XXXX)
 *     - line 1064 `#due` 납기희망일 (date input)
 *     - line 1080 `#memo` 요청사항 (예: 오전 9시 도착요청)
 *
 * 본 v3 는 legacy 모달을 RN ScrollView 안 inline 섹션으로 변환:
 *   1. ProductPicker 로 라인 1건 이상 추가
 *   2. cardOrderInfo 섹션 자동 표시 (조건부 렌더)
 *   3. ScrollView.scrollTo 로 cardOrderInfo 위치까지 자동 스크롤
 *   4. 거래처는 BizGate 인증 시 partnerCode 자동 채움 (별도 입력 X)
 *   5. 발주 button 활성화 (라인 ≥1 + cardOrderInfo 필수 필드 충족 시)
 *
 * UUID 미노출 — modelCode + 거래처명 + orderNumber 만 사용자 노출.
 */

import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createPartnerOrder } from '@/api/partnerOrder';
import { useAuthStore } from '@/stores/authStore';
import { useDcConfigStore } from '@/stores/dcConfigStore';
import { useOrderDraftStore } from '@/stores/orderDraftStore';
import {
  legacyMobileTableStyles,
  legacyVars,
} from '@/styles/legacyMobile';
import { calcDcPrice, type DcCategory, type DcLineOptions } from '@/utils/calcDcPrice';
import { formatSlipNumber, reformatLegacyOrderNumber } from '@/utils/formatSlipNumber';
import type { LegacyCategory, OrderStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<OrderStackParamList, 'OrderForm'>;
type Props = NativeStackScreenProps<OrderStackParamList, 'OrderForm'>;

/**
 * legacy `enterMobile(which)` → DcCategory 매핑.
 * home/single → HOMEMULTI, comm → COMMERCIAL_MULTI, old → OTHER.
 */
function mapDcCategory(legacy: LegacyCategory | undefined): DcCategory {
  if (legacy === 'home' || legacy === 'single') return 'HOMEMULTI';
  if (legacy === 'comm') return 'COMMERCIAL_MULTI';
  return 'OTHER';
}

/** legacy 카테고리 한글 라벨 */
function categoryLabel(legacy: LegacyCategory | undefined): string {
  switch (legacy) {
    case 'home': return '홈멀티';
    case 'single': return '싱글 세트';
    case 'comm': return '상업멀티';
    case 'old': return '구형';
    default: return '주문서';
  }
}

export function OrderFormScreen({ route }: Props): JSX.Element {
  const nav = useNavigation<Nav>();
  const draft = useOrderDraftStore();
  const dcConfig = useDcConfigStore((s) => s.config);
  const partnerName = useAuthStore((s) => s.partnerName);
  const partnerCode = useAuthStore((s) => s.partnerCode);
  const initialCategory = route.params?.initialCategory;
  const dcCategory = mapDcCategory(initialCategory);

  /** 정정 #18 — ScrollView ref + cardOrderInfo y 측정용 ref */
  const scrollRef = useRef<ScrollView>(null);
  const orderInfoRef = useRef<View>(null);
  const orderInfoYRef = useRef<number | null>(null);
  /**
   * 정정 #18 — 라인이 0 → 1 로 전환되는 순간만 자동 scrollTo 발동.
   * (이미 1건 이상이었던 경우 사용자가 스크롤 위치를 잡고 있을 수 있어 강제 이동 안 함.)
   */
  const prevLineCountRef = useRef<number>(draft.lines.length);

  /** cardOrderInfo 자동 표시 조건 — 라인 1건 이상 */
  const showOrderInfo = draft.lines.length >= 1;

  useEffect(() => {
    const prev = prevLineCountRef.current;
    const cur = draft.lines.length;
    if (prev === 0 && cur >= 1 && orderInfoYRef.current != null) {
      // 라인 0 → 1 전환 시 cardOrderInfo 위치로 스크롤.
      scrollRef.current?.scrollTo({ y: orderInfoYRef.current - 12, animated: true });
    }
    prevLineCountRef.current = cur;
  }, [draft.lines.length]);

  /** 라인의 DC 적용 단가 (정정 #12) */
  const computeAppliedPrice = useCallback(
    (basePrice: number, options?: Partial<DcLineOptions>): number => {
      return calcDcPrice(basePrice, dcConfig, { category: dcCategory, ...options });
    },
    [dcConfig, dcCategory],
  );

  const total = useMemo(
    () =>
      draft.lines.reduce((sum, l) => sum + l.qty * computeAppliedPrice(l.unitPrice), 0),
    [draft.lines, computeAppliedPrice],
  );

  /** 정정 #18 — cardOrderInfo 필수 필드 충족 여부 (legacy 모달 disabled 조건 1:1) */
  const orderInfoComplete = useMemo(() => {
    return (
      draft.shippingAddress.trim().length > 0 &&
      draft.receiverPhone.trim().length >= 9 &&
      draft.dueDate.trim().length > 0 &&
      draft.requestNote.trim().length > 0
    );
  }, [draft.shippingAddress, draft.receiverPhone, draft.dueDate, draft.requestNote]);

  const submit = useMutation({
    mutationFn: () =>
      createPartnerOrder({
        orderDate: new Date().toISOString().slice(0, 10),
        shippingAddress: draft.shippingAddress,
        receiverPhone: draft.receiverPhone,
        memo: [draft.memo, draft.requestNote, draft.dueDate ? `납기: ${draft.dueDate}` : '']
          .filter(Boolean)
          .join(' / '),
        lines: draft.lines.map((l) => ({
          modelCode: l.modelCode,
          qty: l.qty,
          // 백엔드에 적용가 전달 (정정 #12)
          unitPrice: computeAppliedPrice(l.unitPrice),
        })),
      }),
    onSuccess: (created) => {
      // 정정 #8 — 'YYYY/MM/DD - 0001' 양식
      const display = reformatLegacyOrderNumber(created.orderNumber)
        || formatSlipNumber(created.orderDate, created.orderNumber);
      Alert.alert('주문 접수 완료', `주문번호 ${display} 가 접수되었습니다.`);
      draft.reset();
      nav.navigate('OrderDetail', { orderId: created.id, orderNumber: created.orderNumber });
    },
    onError: () => {
      Alert.alert('오류', '주문 접수에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    },
  });

  const handlePickProduct = (): void => {
    nav.navigate('ProductPicker', {
      initialCategory,
      onPick: (modelCode, modelName, defaultUnitPrice) => {
        draft.addLine({
          category: 'HW',
          modelCode,
          modelName,
          qty: 1,
          unitPrice: defaultUnitPrice ?? 0,
        });
      },
    });
  };

  const handleQtyChange = (tempKey: string, raw: string): void => {
    const n = Number(raw.replace(/[^0-9]/g, '') || '0');
    draft.updateQty(tempKey, n);
  };

  // 미리보기용 임시 주문번호 ('YYYY/MM/DD - 미발송')
  const previewSlip = formatSlipNumber(new Date(), 0).replace(' - 0000', ' - (작성중)');

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll}>
        {/* legacy `.title` (line 1006) — 카테고리 + (작성중) */}
        <View style={styles.titleBar}>
          <Text style={styles.titleText}>{categoryLabel(initialCategory)}</Text>
          <Text style={styles.previewSlipText} testID="preview-slip">{previewSlip}</Text>
        </View>

        {/* 거래처 (BizGate 인증 시 자동 채움 — 사용자 입력 X, 정정 #18 명시) */}
        <View style={styles.partnerCard} testID="partner-card">
          <Text style={styles.partnerCardLabel}>거래처</Text>
          <Text style={styles.partnerCardValue} numberOfLines={1}>
            {partnerName ?? '미인증'}{partnerCode ? ` (${partnerCode})` : ''}
          </Text>
        </View>

        {/* legacy `<table class="est-table">` 모바일 1:1 */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>주문 라인 ({draft.lines.length}건)</Text>
            <Pressable
              style={styles.addBtn}
              onPress={handlePickProduct}
              testID="add-product-button"
            >
              <Text style={styles.addBtnText}>+ 품목 추가</Text>
            </Pressable>
          </View>

          {/* legacy thead — 품목명 / 모델명 / 수량 / 단가 (모바일 단위 컬럼 숨김 — line 200~201) */}
          <View style={legacyMobileTableStyles.theadRow} testID="line-thead">
            <Text style={[legacyMobileTableStyles.th, legacyMobileTableStyles.tdItemName]}>품목명</Text>
            <Text style={[legacyMobileTableStyles.th, legacyMobileTableStyles.tdModel]}>모델명</Text>
            <Text style={[legacyMobileTableStyles.th, legacyMobileTableStyles.tdQty]}>수량</Text>
            <Text style={[legacyMobileTableStyles.th, legacyMobileTableStyles.tdPrice, legacyMobileTableStyles.thLast]}>
              단가
            </Text>
          </View>

          {draft.lines.length === 0 ? (
            <View style={styles.emptyLines}>
              <Text style={styles.emptyText}>품목 추가 버튼으로 라인을 추가해 주세요.</Text>
            </View>
          ) : (
            draft.lines.map((line, idx) => {
              const applied = computeAppliedPrice(line.unitPrice);
              const hasDc = applied !== line.unitPrice && line.unitPrice > 0;
              return (
                <View key={line.tempKey} style={legacyMobileTableStyles.tr} testID={`line-${idx}`}>
                  <View style={[legacyMobileTableStyles.td, legacyMobileTableStyles.tdItemName]}>
                    <Text style={styles.itemName} numberOfLines={2}>{line.modelName}</Text>
                    <Pressable onPress={() => draft.removeLine(line.tempKey)} hitSlop={8}>
                      <Text style={styles.removeText}>삭제</Text>
                    </Pressable>
                  </View>
                  <View style={[legacyMobileTableStyles.td, legacyMobileTableStyles.tdModel]}>
                    <Text style={styles.modelText} numberOfLines={1}>{line.modelCode}</Text>
                  </View>
                  <View style={[legacyMobileTableStyles.td, legacyMobileTableStyles.tdQty]}>
                    <TextInput
                      style={legacyMobileTableStyles.qtyInput}
                      value={String(line.qty)}
                      onChangeText={(v) => handleQtyChange(line.tempKey, v)}
                      keyboardType="number-pad"
                      testID={`line-qty-${idx}`}
                    />
                  </View>
                  <View style={[
                    legacyMobileTableStyles.td,
                    legacyMobileTableStyles.tdPrice,
                    legacyMobileTableStyles.tdLast,
                  ]}>
                    {hasDc ? (
                      <>
                        <Text style={styles.priceOriginal}>{formatKRW(line.unitPrice)}</Text>
                        <Text style={styles.priceApplied}>{formatKRW(applied)}</Text>
                      </>
                    ) : (
                      <Text style={styles.priceText}>{formatKRW(applied)}</Text>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* 정정 #18 — cardOrderInfo: 라인 1건 이상 추가되면 자동 표시 */}
        {showOrderInfo ? (
          <View
            ref={orderInfoRef}
            style={styles.card}
            testID="card-order-info"
            onLayout={(e) => {
              orderInfoYRef.current = e.nativeEvent.layout.y;
            }}
          >
            <Text style={styles.cardTitle}>주문 정보</Text>
            <Text style={styles.cardSubtitle}>
              라인이 추가되어 주문 정보 입력란이 표시되었습니다. 모든 항목 입력 후 발주 버튼이 활성화됩니다.
            </Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>
                배송지 <Text style={styles.requiredMark}>*</Text>
              </Text>
              <TextInput
                style={styles.textInput}
                value={draft.shippingAddress}
                onChangeText={draft.setShippingAddress}
                placeholder="시·군·구 / 상세 주소"
                placeholderTextColor="#9CA3AF"
                testID="info-shipping-address"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>
                인수자 연락처 <Text style={styles.requiredMark}>*</Text>
              </Text>
              <TextInput
                style={styles.textInput}
                value={draft.receiverPhone}
                onChangeText={draft.setReceiverPhone}
                placeholder="010-0000-0000"
                keyboardType="phone-pad"
                placeholderTextColor="#9CA3AF"
                maxLength={13}
                testID="info-receiver-phone"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>
                납기희망일 <Text style={styles.requiredMark}>*</Text>
              </Text>
              <TextInput
                style={styles.textInput}
                value={draft.dueDate}
                onChangeText={draft.setDueDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#9CA3AF"
                testID="info-due-date"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>
                요청사항 <Text style={styles.requiredMark}>*</Text>
              </Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={draft.requestNote}
                onChangeText={draft.setRequestNote}
                placeholder="예: 오전 9시 도착요청"
                multiline
                numberOfLines={3}
                placeholderTextColor="#9CA3AF"
                testID="info-request-note"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>배송 메모 (선택)</Text>
              <TextInput
                style={[styles.textInput, styles.textAreaSm]}
                value={draft.memo}
                onChangeText={draft.setMemo}
                placeholder="기타 배송 안내"
                multiline
                numberOfLines={2}
                placeholderTextColor="#9CA3AF"
                testID="info-memo"
              />
            </View>
          </View>
        ) : null}

        {/* 합계 */}
        <View style={[styles.card, styles.totalCard]}>
          <Text style={styles.totalLabel}>합계</Text>
          <Text style={styles.totalValue} testID="order-total">{formatKRW(total)}</Text>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.submitBtn,
            (draft.lines.length === 0 || !orderInfoComplete || submit.isPending) && styles.submitBtnDisabled,
            pressed && styles.pressed,
          ]}
          onPress={() => submit.mutate()}
          disabled={draft.lines.length === 0 || !orderInfoComplete || submit.isPending}
          testID="submit-order"
        >
          <Text style={styles.submitBtnText}>
            {submit.isPending
              ? '접수 중...'
              : draft.lines.length === 0
                ? '라인을 추가해 주세요'
                : !orderInfoComplete
                  ? '주문 정보를 모두 입력해 주세요'
                  : '주문 발주'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function formatKRW(n: number): string {
  return `₩${n.toLocaleString('ko-KR')}`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: legacyVars.cBg },
  scroll: { padding: 12, gap: 12, paddingBottom: 60 },
  titleBar: {
    paddingHorizontal: 4,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  titleText: {
    fontSize: 22,
    fontWeight: '800',
    color: legacyVars.cStrong,
  },
  previewSlipText: {
    fontSize: 13,
    color: legacyVars.cMuted,
    fontWeight: '600',
  },
  // 거래처 (자동 채움) — legacy `#partner-readonly`
  partnerCard: {
    borderWidth: 1,
    borderColor: legacyVars.cLine,
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  partnerCardLabel: {
    fontSize: 13,
    color: legacyVars.cMuted,
    fontWeight: '700',
  },
  partnerCardValue: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    color: legacyVars.cStrong,
    fontWeight: '700',
    textAlign: 'right',
  },
  // legacy `.card` (line 41) — border:1px solid #000; border-radius:12px; background:#fff
  card: {
    borderWidth: 1,
    borderColor: legacyVars.cLine,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 8,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: legacyVars.cStrong,
  },
  cardSubtitle: {
    fontSize: 12,
    color: legacyVars.cMuted,
    lineHeight: 16,
  },
  fieldGroup: {
    gap: 4,
  },
  fieldLabel: {
    fontSize: 13,
    color: legacyVars.cMuted,
    fontWeight: '700',
  },
  requiredMark: {
    color: legacyVars.bizDanger,
    fontWeight: '800',
  },
  textInput: {
    height: 40,
    borderWidth: 1,
    borderColor: legacyVars.cLine,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 14,
    color: legacyVars.cStrong,
  },
  textArea: {
    height: 80,
    paddingTop: 8,
    textAlignVertical: 'top',
  },
  textAreaSm: {
    height: 56,
    paddingTop: 8,
    textAlignVertical: 'top',
  },
  addBtn: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: legacyVars.bizButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  emptyLines: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: legacyVars.cMuted,
    fontSize: 14,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '700',
    color: legacyVars.cStrong,
  },
  removeText: {
    fontSize: 12,
    color: legacyVars.bizDanger,
    marginTop: 2,
    fontWeight: '600',
  },
  modelText: {
    fontSize: 13,
    color: legacyVars.cMuted,
    textAlign: 'center',
  },
  priceOriginal: {
    fontSize: 11,
    color: legacyVars.cMuted,
    textDecorationLine: 'line-through',
    textAlign: 'right',
  },
  priceApplied: {
    fontSize: 14,
    color: legacyVars.cAccent,
    fontWeight: '700',
    textAlign: 'right',
  },
  priceText: {
    fontSize: 14,
    color: legacyVars.cStrong,
    textAlign: 'right',
  },
  totalCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    borderColor: '#FED7AA',
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: '#9A3412',
  },
  totalValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#C2410C',
  },
  submitBtn: {
    height: 56,
    borderRadius: 12,
    backgroundColor: legacyVars.cAccent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: {
    backgroundColor: '#9CA3AF',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  pressed: { opacity: 0.85 },
});
