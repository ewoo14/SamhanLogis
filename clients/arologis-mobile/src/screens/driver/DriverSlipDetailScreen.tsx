import * as React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArologisApiError, fetchStopSlipDetail } from '../../api/arologis';
import type { DispatchVehicleSummary, StopSlipDetailLine, StopSlipDetailResponse } from '../../api/arologis';
import { badgeStyle, colors, radii, spacing, typography } from '../../theme/tokens';

export interface SlipDetailTarget {
  dispatchType: DispatchVehicleSummary['dispatchType'];
  vehicleSequence: number;
  stopSequence: number;
  parsedKakaoSeq?: number | null;
  stopLabel: string;
  partnerName?: string | null;
}

interface Props {
  token: string | null;
  target: SlipDetailTarget | null;
  onBackToDashboard: () => void;
}

interface DetailState {
  loading: boolean;
  detail: StopSlipDetailResponse | null;
  error: SlipDetailError | null;
}

const initialState: DetailState = {
  loading: false,
  detail: null,
  error: null,
};

interface SlipDetailError {
  message: string;
  hint: string;
  retryable: boolean;
}

export default function DriverSlipDetailScreen({
  token,
  target,
  onBackToDashboard,
}: Props): React.ReactElement {
  const [state, setState] = React.useState<DetailState>(initialState);

  const load = React.useCallback(async () => {
    if (!target) return;
    setState({ loading: true, detail: null, error: null });
    try {
      const detail = await fetchStopSlipDetail(
        token,
        target.dispatchType,
        target.vehicleSequence,
        target.stopSequence,
        { parsedKakaoSeq: target.parsedKakaoSeq ?? null },
      );
      setState({ loading: false, detail, error: null });
    } catch (error) {
      setState({ loading: false, detail: null, error: friendlySlipDetailError(error) });
    }
  }, [target, token]);

  React.useEffect(() => {
    setState(initialState);
    void load();
  }, [load]);

  if (!target) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.emptyState}>
          <Text style={styles.h1}>전표 상세</Text>
          <Text style={styles.muted}>배차 탭에서 정차를 선택해 주세요</Text>
          <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={onBackToDashboard}>
            <Text style={styles.btnPrimaryText}>배차로 이동</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.titleBlock}>
            <Text style={styles.h1}>전표 상세</Text>
            <Text style={styles.subtitle}>
              차량 #{state.detail?.vehicleSequence ?? target.vehicleSequence}
              {' / '}
              정차 #{state.detail?.stopSequence ?? target.stopSequence}
            </Text>
          </View>
          <TouchableOpacity style={styles.backBtn} onPress={onBackToDashboard}>
            <Text style={styles.backText}>배차</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.stopCard}>
          <Text style={styles.cardTitle}>정차 정보</Text>
          <Text style={styles.stopLabel}>{state.detail?.stopLabel ?? target.stopLabel}</Text>
        </View>

        {state.loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="small" color={colors.action.brand} />
            <Text style={styles.muted}>전표 상세 불러오는 중...</Text>
          </View>
        ) : null}

        {state.error ? (
          <View style={styles.errorCard}>
            <Text style={badgeStyle('warn')}>조회 실패</Text>
            <Text style={styles.errorText}>{state.error.message}</Text>
            <Text style={styles.errorHint}>{state.error.hint}</Text>
            <View style={styles.errorActions}>
              {state.error.retryable ? (
                <TouchableOpacity
                  style={[styles.btn, styles.btnSecondary]}
                  onPress={load}
                  testID="arologis-slip-detail-retry"
                >
                  <Text style={styles.btnSecondaryText}>재시도</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={onBackToDashboard}>
                <Text style={styles.btnGhostText}>
                  {state.error.retryable ? '배차로 이동' : '배차 탭으로 돌아가기'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {state.detail ? <SlipDetailContent detail={state.detail} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function SlipDetailContent({ detail }: { detail: StopSlipDetailResponse }): React.ReactElement {
  return (
    <>
      <View style={styles.summaryCard}>
        <View style={styles.summaryHead}>
          <Text style={styles.cardTitle}>전표번호</Text>
          <Text style={styles.slipNo}>{detail.slipNo}</Text>
        </View>
        <InfoRow label="거래처" value={detail.partnerName ?? '-'} />
        <InfoRow label="전표일자" value={detail.slipDate ?? '-'} />
        <InfoRow label="배송주소" value={detail.deliveryAddress ?? '-'} />
        <InfoRow label="출고창고" value={detail.sourceWarehouseName ?? '-'} />
      </View>

      <View style={styles.lineCard}>
        <Text style={styles.cardTitle}>품목</Text>
        {detail.lines.length > 0 ? detail.lines.map((line, index) => (
          <LineItem key={`${line.productName}-${index}`} line={line} />
        )) : (
          <Text style={styles.muted}>품목 정보가 없습니다</Text>
        )}
      </View>

      <View style={styles.totalCard}>
        <InfoRow label="공급가" value={formatAmount(detail.totalSupply)} strong />
        <InfoRow label="부가세" value={formatAmount(detail.vat)} strong />
        <View style={styles.totalDivider} />
        <InfoRow label="합계" value={formatAmount(detail.total)} strong highlight />
      </View>
    </>
  );
}

function LineItem({ line }: { line: StopSlipDetailLine }): React.ReactElement {
  return (
    <View style={styles.lineItem}>
      <View style={styles.lineTitleRow}>
        <Text style={styles.lineName}>{line.productName}</Text>
        <Text style={styles.lineTotal}>{formatAmount(line.lineTotal)}</Text>
      </View>
      <Text style={styles.lineMeta}>
        {[line.specification, `${formatNumber(line.quantity)}개`, `단가 ${formatAmount(line.unitPrice)}`]
          .filter(Boolean)
          .join(' / ')}
      </Text>
    </View>
  );
}

function InfoRow({
  label,
  value,
  strong = false,
  highlight = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  highlight?: boolean;
}): React.ReactElement {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, strong && styles.infoValueStrong, highlight && styles.infoValueHighlight]}>
        {value}
      </Text>
    </View>
  );
}

function friendlySlipDetailError(error: unknown): SlipDetailError {
  const status = typeof error === 'object' && error !== null && 'status' in error
    ? Number((error as { status?: number }).status)
    : 0;
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: string }).code ?? '')
    : '';
  const message = error instanceof Error ? error.message : String(error);
  if (status === 422 || code === 'SLIP_MAPPING_NOT_FOUND' || message.includes('SLIP_MAPPING_NOT_FOUND')) {
    return {
      message: '정차와 연결된 전표를 찾을 수 없습니다.',
      hint: '사무실에서 전표 연결 상태를 확인해야 합니다.',
      retryable: false,
    };
  }
  if (status === 502 || code === 'SLIP_DETAIL_FETCH_FAILED' || message.includes('SLIP_DETAIL_FETCH_FAILED')) {
    return {
      message: '전표 상세를 불러오지 못했습니다.',
      hint: '잠시 후 다시 시도해 주세요.',
      retryable: true,
    };
  }
  if (status === 401 || status === 403) {
    return {
      message: '기사 권한을 확인해 주세요.',
      hint: '다시 로그인하거나 사무실에 문의해 주세요.',
      retryable: false,
    };
  }
  if (status === 400) {
    return {
      message: '정차 정보를 확인해 주세요.',
      hint: '배차 목록을 새로 확인한 뒤 다시 선택해 주세요.',
      retryable: false,
    };
  }
  if (error instanceof ArologisApiError || status > 0) {
    return {
      message,
      hint: status >= 500 ? '잠시 후 다시 시도해 주세요.' : '배차 정보를 확인해 주세요.',
      retryable: status >= 500,
    };
  }
  return {
    message: '네트워크가 불안정합니다.',
    hint: '연결 상태를 확인한 뒤 다시 시도해 주세요.',
    retryable: true,
  };
}

function formatAmount(value: number): string {
  return `${formatNumber(value)}원`;
}

function formatNumber(value: number): string {
  return value.toLocaleString('ko-KR');
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface.app },
  content: { padding: spacing[4], gap: spacing[3] },
  emptyState: {
    flex: 1,
    padding: spacing[6],
    justifyContent: 'center',
    gap: spacing[3],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  titleBlock: { flex: 1 },
  h1: {
    fontSize: typography.fontSize.h1,
    fontWeight: typography.fontWeight.bold,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
  },
  subtitle: {
    marginTop: spacing[1],
    fontSize: typography.fontSize.sm,
    color: colors.ink.secondary,
    fontFamily: typography.fontFamily.sans,
  },
  muted: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.secondary,
    fontFamily: typography.fontFamily.sans,
  },
  backBtn: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderWidth: 1,
    borderColor: colors.line.default,
    borderRadius: radii.button,
    backgroundColor: colors.surface.card,
  },
  backText: {
    color: colors.ink.secondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
  },
  stopCard: {
    backgroundColor: colors.surface.card,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line.default,
    padding: spacing[4],
  },
  cardTitle: {
    fontSize: typography.fontSize.base,
    color: colors.ink.primary,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
  },
  stopLabel: {
    marginTop: spacing[2],
    fontSize: typography.fontSize.sm,
    color: colors.ink.secondary,
    lineHeight: typography.fontSize.sm * typography.lineHeight.base,
    fontFamily: typography.fontFamily.sans,
  },
  loadingCard: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.card,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line.default,
  },
  errorCard: {
    backgroundColor: colors.state.warningBg,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.state.warning,
    padding: spacing[4],
    gap: spacing[3],
  },
  errorText: {
    color: colors.ink.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
    textAlign: 'center',
  },
  errorHint: {
    color: colors.ink.secondary,
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.sans,
    textAlign: 'center',
  },
  errorActions: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  summaryCard: {
    backgroundColor: colors.surface.card,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line.default,
    padding: spacing[4],
    gap: spacing[2],
  },
  summaryHead: {
    gap: spacing[1],
    marginBottom: spacing[2],
  },
  slipNo: {
    fontSize: typography.fontSize.lg,
    color: colors.ink.primary,
    fontWeight: typography.fontWeight.bold,
    fontFamily: typography.fontFamily.sans,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing[3],
    paddingVertical: spacing[1],
  },
  infoLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.secondary,
    fontFamily: typography.fontFamily.sans,
  },
  infoValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: typography.fontSize.sm,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
  },
  infoValueStrong: {
    fontWeight: typography.fontWeight.semibold,
  },
  infoValueHighlight: {
    fontSize: typography.fontSize.base,
    color: colors.action.brandActive,
  },
  lineCard: {
    backgroundColor: colors.surface.card,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line.default,
    padding: spacing[4],
    gap: spacing[2],
  },
  lineItem: {
    borderTopWidth: 1,
    borderTopColor: colors.line.default,
    paddingTop: spacing[3],
    gap: spacing[1],
  },
  lineTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  lineName: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    color: colors.ink.primary,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
  },
  lineTotal: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.primary,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
  },
  lineMeta: {
    fontSize: typography.fontSize.xs,
    color: colors.ink.secondary,
    fontFamily: typography.fontFamily.sans,
  },
  totalCard: {
    backgroundColor: colors.surface.card,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line.default,
    padding: spacing[4],
    gap: spacing[1],
  },
  totalDivider: {
    height: 1,
    backgroundColor: colors.line.default,
    marginVertical: spacing[2],
  },
  btn: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
  },
  btnPrimary: { backgroundColor: colors.action.brand },
  btnPrimaryText: {
    color: colors.ink.onPrimary,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
  },
  btnSecondary: {
    backgroundColor: colors.action.brandSubtle,
    borderWidth: 1,
    borderColor: colors.action.brand,
  },
  btnSecondaryText: {
    color: colors.action.brandActive,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
  },
  btnGhost: {
    borderWidth: 1,
    borderColor: colors.line.default,
    backgroundColor: colors.surface.card,
  },
  btnGhostText: {
    color: colors.ink.secondary,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
  },
});
