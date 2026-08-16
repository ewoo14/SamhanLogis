/**
 * PartnerOrderCreateScreen — P1-4 영업 native 앱 신규 주문 (파트너 주문) 등록.
 *
 * 단계:
 *   1. 거래처 선택 (CustomerSearchScreen 임베드)
 *   2. 라인 추가 (품목 코드 + 품목명 + 수량 + 단가)
 *   3. 배송 정보 (배송 주소 + 요청 납기일) + 비고
 *   4. 합계 확인 후 제출
 *
 * BE: slip-service POST /api/v1/slips/mobile-order
 *     (@PreAuthorize SALES/MANAGER/MASTER)
 *
 * UUID 비공개:
 *   - 화면 표시: partnerCode + partnerName + productCode + slipNo.
 *   - 내부 전송: partnerId (UUID) → API body, 응답 slipId 는 저장하지 않음.
 */

import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  createMobilePartnerOrder,
  type CustomerSummary,
  type PartnerOrderLineRequest,
  type PartnerOrderResponse,
} from '../../api/sales';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import CustomerSearchScreen from './CustomerSearchScreen';

interface Props {
  token: string | null;
  onBack: () => void;
}

type Step = 'customer' | 'lines' | 'done';

interface LineForm {
  id: string;
  productCode: string;
  productName: string;
  quantity: string;
  unitPrice: string;
}

function makeLineId(): string {
  return `order-line-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function newLine(): LineForm {
  return {
    id: makeLineId(),
    productCode: '',
    productName: '',
    quantity: '1',
    unitPrice: '',
  };
}

export default function PartnerOrderCreateScreen({ token, onBack }: Props): JSX.Element {
  const [step, setStep] = useState<Step>('customer');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSummary | null>(null);
  const [lines, setLines] = useState<LineForm[]>([newLine()]);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [requestedDate, setRequestedDate] = useState('');
  const [memo, setMemo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PartnerOrderResponse | null>(null);

  // ---- 거래처 선택 ----
  const handleSelectCustomer = useCallback((customer: CustomerSummary) => {
    if (selectedCustomer && selectedCustomer.id !== customer.id) {
      setLines([newLine()]);
      setDeliveryAddress('');
      setRequestedDate('');
      setMemo('');
      setResult(null);
    }
    setSelectedCustomer(customer);
    setStep('lines');
  }, [selectedCustomer]);

  // ---- 라인 조작 ----
  const updateLine = useCallback((id: string, field: keyof LineForm, value: string) => {
    setLines(prev =>
      prev.map(l => (l.id === id ? { ...l, [field]: value } : l)),
    );
  }, []);

  const addLine = useCallback(() => {
    setLines(prev => [...prev, newLine()]);
  }, []);

  const removeLine = useCallback((id: string) => {
    setLines(prev => {
      if (prev.length <= 1) return prev;
      return prev.filter(l => l.id !== id);
    });
  }, []);

  // ---- 합계 ----
  const total = lines.reduce((acc, l) => {
    const qty = parseInt(l.quantity, 10) || 0;
    const price = parseFloat(l.unitPrice) || 0;
    return acc + qty * price;
  }, 0);

  // ---- 유효성 검사 ----
  function validate(): string | null {
    if (!selectedCustomer) return '거래처를 선택하세요.';
    for (const l of lines) {
      if (!l.productCode.trim()) return '품목 코드를 입력하세요.';
      if (!l.productName.trim()) return '품목명을 입력하세요.';
      if ((parseInt(l.quantity, 10) || 0) <= 0) return '수량은 1 이상이어야 합니다.';
      if ((parseFloat(l.unitPrice) || 0) <= 0) return '단가를 입력하세요.';
    }
    if (requestedDate && !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
      return '요청 납기일은 YYYY-MM-DD 형식으로 입력하세요.';
    }
    return null;
  }

  // ---- 제출 ----
  const handleSubmit = useCallback(async () => {
    const err = validate();
    if (err) {
      Alert.alert('입력 오류', err);
      return;
    }
    if (!selectedCustomer) return;

    setSubmitting(true);
    try {
      const linePayload: PartnerOrderLineRequest[] = lines.map(l => ({
        productCode: l.productCode.trim(),
        productName: l.productName.trim(),
        quantity: parseInt(l.quantity, 10),
        unitPrice: parseFloat(l.unitPrice),
      }));
      const res = await createMobilePartnerOrder(
        {
          partnerId: selectedCustomer.id,
          deliveryAddress: deliveryAddress.trim() || null,
          requestedDate: requestedDate.trim() || null,
          lines: linePayload,
          memo: memo.trim() || null,
        },
        token,
      );
      setResult(res);
      setStep('done');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '주문 생성 중 오류가 발생했습니다.';
      Alert.alert('오류', msg);
    } finally {
      setSubmitting(false);
    }
  }, [selectedCustomer, lines, deliveryAddress, requestedDate, memo, token]);

  // ---- 렌더 ----
  if (step === 'customer') {
    return (
      <View style={styles.container}>
        <ScreenHeader title="신규 주문 — 거래처 선택" onBack={onBack} />
        <CustomerSearchScreen token={token} onSelect={handleSelectCustomer} />
      </View>
    );
  }

  if (step === 'done' && result) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="주문 등록 완료" onBack={onBack} />
        <View style={styles.doneBox}>
          <Text style={styles.doneTitle}>주문이 등록되었습니다.</Text>
          {/* UUID 비공개 — slipId 노출 금지, slipNo 만 표시 */}
          <InfoRow label="전표 번호" value={result.slipNo} />
          <InfoRow label="거래처" value={result.partnerName} />
          <InfoRow label="합계" value={`${result.totalAmount.toLocaleString('ko-KR')}원`} />
          <InfoRow label="상태" value={slipStatusLabel(result.status)} />
          <TouchableOpacity style={styles.doneBtn} onPress={onBack}>
            <Text style={styles.doneBtnLabel}>목록으로 돌아가기</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // step === 'lines'
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader title="신규 주문 — 라인 입력" onBack={() => setStep('customer')} />
      {/* 선택된 거래처 표시 (UUID 비공개: partnerCode + partnerName 만) */}
      {selectedCustomer && (
        <View style={styles.selectedCustomerBar}>
          <Text style={styles.selectedCustomerCode}>{selectedCustomer.partnerCode}</Text>
          <Text style={styles.selectedCustomerName}>{selectedCustomer.partnerName}</Text>
          <TouchableOpacity onPress={() => setStep('customer')}>
            <Text style={styles.changeLink}>변경</Text>
          </TouchableOpacity>
        </View>
      )}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* 배송 정보 */}
        <Text style={styles.sectionTitle}>배송 정보</Text>
        <FormGroup label="배송 주소 (선택)">
          <TextInput
            style={styles.input}
            value={deliveryAddress}
            onChangeText={setDeliveryAddress}
            placeholder="배송 주소 입력"
            placeholderTextColor={colors.ink.tertiary}
          />
        </FormGroup>
        <FormGroup label="요청 납기일 (선택, YYYY-MM-DD)">
          <TextInput
            style={styles.input}
            value={requestedDate}
            onChangeText={setRequestedDate}
            placeholder="예) 2026-05-20"
            placeholderTextColor={colors.ink.tertiary}
            keyboardType="numbers-and-punctuation"
          />
        </FormGroup>

        {/* 라인 목록 */}
        <Text style={[styles.sectionTitle, { marginTop: spacing[2] }]}>주문 라인</Text>
        <FlatList
          data={lines}
          keyExtractor={l => l.id}
          scrollEnabled={false}
          renderItem={({ item, index }) => (
            <OrderLineFormRow
              item={item}
              index={index}
              onUpdate={updateLine}
              onRemove={removeLine}
              canRemove={lines.length > 1}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.lineSep} />}
        />
        <TouchableOpacity style={styles.addLineBtn} onPress={addLine}>
          <Text style={styles.addLineBtnLabel}>+ 라인 추가</Text>
        </TouchableOpacity>

        {/* 합계 */}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>합계</Text>
          <Text style={styles.totalValue}>{total.toLocaleString('ko-KR')}원</Text>
        </View>

        {/* 비고 */}
        <FormGroup label="비고 (선택)">
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={memo}
            onChangeText={setMemo}
            placeholder="비고를 입력하세요."
            placeholderTextColor={colors.ink.tertiary}
            multiline
            numberOfLines={3}
          />
        </FormGroup>

        {/* 제출 */}
        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
          onPress={() => void handleSubmit()}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={colors.ink.onPrimary} />
          ) : (
            <Text style={styles.submitBtnLabel}>주문 등록</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// -----------------------------------------------------------------------
// 서브 컴포넌트
// -----------------------------------------------------------------------

interface ScreenHeaderProps {
  title: string;
  onBack: () => void;
}

function ScreenHeader({ title, onBack }: ScreenHeaderProps): JSX.Element {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} style={styles.backBtn} testID="header-back-order">
        <Text style={styles.backBtnLabel}>‹ 뒤로</Text>
      </TouchableOpacity>
      <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
    </View>
  );
}

interface FormGroupProps {
  label: string;
  children: React.ReactNode;
}

function FormGroup({ label, children }: FormGroupProps): JSX.Element {
  return (
    <View style={styles.formGroup}>
      <Text style={styles.formLabel}>{label}</Text>
      {children}
    </View>
  );
}

interface InfoRowProps {
  label: string;
  value: string;
}

function InfoRow({ label, value }: InfoRowProps): JSX.Element {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

interface OrderLineFormRowProps {
  item: LineForm;
  index: number;
  onUpdate: (id: string, field: keyof LineForm, value: string) => void;
  onRemove: (id: string) => void;
  canRemove: boolean;
}

function OrderLineFormRow({ item, index, onUpdate, onRemove, canRemove }: OrderLineFormRowProps): JSX.Element {
  return (
    <View style={styles.lineBox}>
      <View style={styles.lineHeader}>
        <Text style={styles.lineNum}>라인 {index + 1}</Text>
        {canRemove && (
          <TouchableOpacity onPress={() => onRemove(item.id)}>
            <Text style={styles.removeBtn}>삭제</Text>
          </TouchableOpacity>
        )}
      </View>
      <FormGroup label="품목 코드">
        <TextInput
          style={styles.input}
          value={item.productCode}
          onChangeText={v => onUpdate(item.id, 'productCode', v)}
          placeholder="예) P-0001"
          placeholderTextColor={colors.ink.tertiary}
          autoCapitalize="characters"
        />
      </FormGroup>
      <FormGroup label="품목명">
        <TextInput
          style={styles.input}
          value={item.productName}
          onChangeText={v => onUpdate(item.id, 'productName', v)}
          placeholder="품목명 입력"
          placeholderTextColor={colors.ink.tertiary}
        />
      </FormGroup>
      <View style={styles.lineRow2}>
        <View style={styles.lineRow2Item}>
          <FormGroup label="수량">
            <TextInput
              style={styles.input}
              value={item.quantity}
              onChangeText={v => onUpdate(item.id, 'quantity', v)}
              keyboardType="number-pad"
              placeholder="1"
              placeholderTextColor={colors.ink.tertiary}
            />
          </FormGroup>
        </View>
        <View style={styles.lineRow2Item}>
          <FormGroup label="단가 (원)">
            <TextInput
              style={styles.input}
              value={item.unitPrice}
              onChangeText={v => onUpdate(item.id, 'unitPrice', v)}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.ink.tertiary}
            />
          </FormGroup>
        </View>
      </View>
    </View>
  );
}

function slipStatusLabel(status: PartnerOrderResponse['status']): string {
  const MAP: Record<PartnerOrderResponse['status'], string> = {
    DRAFT: '초안',
    PENDING: '접수 대기',
    CONFIRMED: '확정',
    SHIPPED: '출고됨',
    CANCELLED: '취소',
  };
  return MAP[status] ?? status;
}

const { spacing: sp } = { spacing };

// -----------------------------------------------------------------------
// 스타일
// -----------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.app },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.line.default,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    gap: spacing[3],
  },
  backBtn: { paddingVertical: spacing[1], paddingRight: spacing[2] },
  backBtnLabel: {
    fontSize: typography.fontSize.base,
    color: colors.action.brand,
    fontFamily: typography.fontFamily.sans,
    fontWeight: typography.fontWeight.medium,
  },
  headerTitle: {
    flex: 1,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
  },
  selectedCustomerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface.selected,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    gap: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: colors.line.selected,
  },
  selectedCustomerCode: {
    fontSize: typography.fontSize.xs,
    color: colors.action.brand,
    fontFamily: typography.fontFamily.sans,
    fontWeight: typography.fontWeight.medium,
  },
  selectedCustomerName: {
    flex: 1,
    fontSize: typography.fontSize.base,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
    fontWeight: typography.fontWeight.semibold,
  },
  changeLink: {
    fontSize: typography.fontSize.sm,
    color: colors.action.brand,
    fontFamily: typography.fontFamily.sans,
    textDecorationLine: 'underline',
  },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing[4], gap: spacing[3] },
  sectionTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
    marginBottom: spacing[1],
  },
  formGroup: { gap: spacing[1] },
  formLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.secondary,
    fontFamily: typography.fontFamily.sans,
    fontWeight: typography.fontWeight.medium,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line.default,
    borderRadius: radii.sm,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    fontSize: typography.fontSize.base,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
    backgroundColor: colors.surface.card,
    minHeight: 42,
  },
  inputMultiline: { minHeight: 72, textAlignVertical: 'top', paddingTop: spacing[2] },
  lineSep: { height: spacing[2] },
  lineBox: {
    backgroundColor: colors.surface.card,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line.default,
    padding: spacing[3],
    gap: spacing[2],
  },
  lineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[1],
  },
  lineNum: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.state.success,
    fontFamily: typography.fontFamily.sans,
  },
  removeBtn: {
    fontSize: typography.fontSize.sm,
    color: colors.state.danger,
    fontFamily: typography.fontFamily.sans,
  },
  lineRow2: { flexDirection: 'row', gap: spacing[2] },
  lineRow2Item: { flex: 1 },
  addLineBtn: {
    paddingVertical: spacing[3],
    borderRadius: radii.button,
    borderWidth: 1,
    borderColor: colors.state.success,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  addLineBtnLabel: {
    fontSize: typography.fontSize.base,
    color: colors.state.success,
    fontWeight: typography.fontWeight.medium,
    fontFamily: typography.fontFamily.sans,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface.card,
    borderRadius: radii.card,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: colors.line.default,
  },
  totalLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.secondary,
    fontFamily: typography.fontFamily.sans,
  },
  totalValue: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
  },
  submitBtn: {
    backgroundColor: colors.state.success,
    borderRadius: radii.button,
    paddingVertical: spacing[4],
    alignItems: 'center',
    marginTop: spacing[2],
    marginBottom: spacing[8],
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnLabel: {
    fontSize: typography.fontSize.base,
    color: colors.ink.onPrimary,
    fontWeight: typography.fontWeight.bold,
    fontFamily: typography.fontFamily.sans,
  },
  doneBox: {
    flex: 1,
    padding: spacing[6],
    gap: spacing[4],
    justifyContent: 'center',
  },
  doneTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.state.success,
    fontFamily: typography.fontFamily.sans,
    textAlign: 'center',
    marginBottom: spacing[4],
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: colors.line.default,
  },
  infoLabel: {
    fontSize: typography.fontSize.base,
    color: colors.ink.secondary,
    fontFamily: typography.fontFamily.sans,
  },
  infoValue: {
    fontSize: typography.fontSize.base,
    color: colors.ink.primary,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
  },
  doneBtn: {
    marginTop: spacing[6],
    backgroundColor: colors.state.success,
    borderRadius: radii.button,
    paddingVertical: spacing[4],
    alignItems: 'center',
  },
  doneBtnLabel: {
    fontSize: typography.fontSize.base,
    color: colors.ink.onPrimary,
    fontWeight: typography.fontWeight.bold,
    fontFamily: typography.fontFamily.sans,
  },
});
