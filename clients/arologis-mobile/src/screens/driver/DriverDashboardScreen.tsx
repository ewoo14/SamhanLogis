/**
 * DriverDashboardScreen — Phase 10 W10-3 신규.
 * Phase 12 PR-H4c 보강 — 배차 갱신 audit overlay (마지막 동기화 시각 + 사용자 색상 dot) + 30초
 * polling fallback (gateway 가 user 단위 dispatch SSE 채널을 발행하기 전 임시 운영). 본 화면은
 * dispatch 응답이 slipId 를 포함하지 않으므로 (W10-1 단순화 응답) slip-service SSE 직접 구독
 * 대신 "마지막 갱신" overlay + 폴링으로 변경 가시성을 확보한다.
 *
 * 본인 사용자 (ROLE_DRIVER) 의 오늘 배정 차량 목록 + 정차 상태 표시.
 *
 * 동작:
 *   1. mount 직후 GET `/driver-app/arologis/dispatches/today` 호출 (token = JWT).
 *   2. 응답 = `[{dispatchType, vehicleSequence, tonnage, status, stops}]`.
 *   3. 각 차량 카드 = sequence + tonnage + status badge + 정차 목록 표시.
 *   4. 각 stop 상태 (PENDING / ARRIVED / DELIVERED / FAILED / UNPARSED) = STOP_STATUS_BADGE 매핑.
 *   5. (PR-H4c) header 우상단 "마지막 동기화 HH:mm:ss" + driverCode hash 색상 dot 노출.
 *   6. (PR-H4c) 30초 polling fallback — 배차 변경 시 카드 자동 갱신 (Alert 안내 X, silent).
 *
 * 토큰 사용:
 *   - `theme/tokens.ts` 의 surface / ink / line / sliceAccent / b-channel-* / b-unparsed.
 *   - W3+W4+W5+post-W5+W10-1 토큰 1:1 복제 일관 (Designer-2 채택).
 *   - userIdToColor (PR-H2 audit 색상 hash) 재사용 — desktop / mobile 색상 일치.
 *
 * UUID 비공개:
 *   - 화면 노출은 driverCode + dispatchType + vehicleSequence + stopSequence + 카톡 순번까지만 허용한다.
 *
 * data-testid (PR-H4c 추가):
 *   - `driver-dashboard-realtime-mobile` — header 우상단 마지막 동기화 영역
 *   - `driver-dashboard-realtime-dot-mobile` — driverCode hash 색상 dot
 *   - `driver-dashboard-realtime-time-mobile` — 마지막 동기화 시각 텍스트
 */

import { useEffect, useState, type ReactElement } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchTodayDispatches, type DispatchVehicleSummary, type DriverStopSummary } from '../../api/arologis';
import { badgeStyle, colors, radii, spacing, STOP_STATUS_BADGE, typography } from '../../theme/tokens';
import { userIdToColor } from '../../utils/userColorHash';
import type { SignatureTarget } from './DriverSignatureScreen';

interface Props {
  /** JWT access token — driver tab 진입 시점에 user-service `/auth/me` 로 확인 후 보관. */
  token: string | null;
  /**
   * slip 상세 진입 콜백 — Phase 12 PR-H1 신규.
   *
   * 본 PR (W10-3) 시점 backend 응답 = vehicle 단순 요약 (slip 식별자 미포함). 정식 deeplink 는 후속.
   * D-AX-12 단계는 vehicle card 우측 "전표 보기" 버튼 노출 — placeholder slipId 로 DriverSlipDetailEntry
   * 진입 흐름 검증. backend 확장 (vehicleSequence → slipId 매핑) 시 실 slipId 전달.
   */
  onOpenSlipDetail?: (params: { slipId: string; slipNo?: string; partnerName?: string | null }) => void;
  /** D-AX-16 — 실제 정차 target 으로 전자서명 화면 진입. */
  onOpenSignature?: (target: SignatureTarget) => void;
  /**
   * (PR-H4c) 현재 driver 식별 코드 — audit overlay 의 색상 hash 입력 (UUID 미노출 가드).
   * 미전달 시 hash 입력은 'driver' 상수로 fallback (시각적 일관 유지).
   */
  driverCode?: string | null;
}

/** PR-H4c — 배차 변경 polling 주기 (ms). gateway dispatch SSE 채널 활성 시 본 fallback 제거 가능. */
const DISPATCH_POLL_INTERVAL_MS = 30_000;

const TONNAGE_LABEL: Record<DispatchVehicleSummary['tonnage'], string> = {
  TONNAGE_1:    '1톤',
  TONNAGE_1_4:  '1.4톤',
  TONNAGE_2_5:  '2.5톤',
  TONNAGE_5:    '5톤',
  TONNAGE_BIG:  '대형',
};

const STATUS_LABEL: Record<DispatchVehicleSummary['status'], string> = {
  PENDING:   '대기',
  MATCHING:  '매칭중',
  ASSIGNED:  '배정완료',
  DEPARTED:  '출발',
  DELIVERED: '배송완료',
  CANCELLED: '취소',
};

const STATUS_BADGE_KIND: Record<DispatchVehicleSummary['status'], Parameters<typeof badgeStyle>[0]> = {
  PENDING:   'slicePending',
  MATCHING:  'info',
  ASSIGNED:  'channelPush',
  DEPARTED:  'channelEmail',
  DELIVERED: 'sliceSuccess',
  CANCELLED: 'sliceDeferred',
};

export default function DriverDashboardScreen({
  token,
  onOpenSlipDetail,
  onOpenSignature,
  driverCode,
}: Props): ReactElement {
  const [vehicles, setVehicles] = useState<DispatchVehicleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // PR-H4c — 배차 마지막 동기화 시각 (audit overlay 의 actor timestamp 와 동등 시각 표시).
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const load = async () => {
    setError(null);
    try {
      const data = await fetchTodayDispatches(token);
      setVehicles(data);
      setLastSyncedAt(new Date()); // PR-H4c — audit overlay 시간 표시.
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // PR-H4c — 30초 polling fallback. gateway 의 user 단위 dispatch SSE 채널 발행 시 본 effect 제거.
  useEffect(() => {
    const id = setInterval(() => {
      load();
    }, DISPATCH_POLL_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  // PR-H4c — driverCode (또는 'driver' fallback) hash 색상 — desktop / mobile 색상 일치 가드.
  const realtimeDotColor = userIdToColor(driverCode ?? 'driver');

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={colors.action.brand} />
        <Text style={styles.muted}>오늘의 배차 불러오는 중…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View style={styles.headerTitleBlock}>
            <Text style={styles.h1}>오늘의 배차</Text>
            <Text style={styles.subtitle}>본인 배정 차량 {vehicles.length}대</Text>
          </View>
          {/* PR-H4c — 배차 audit overlay 마지막 동기화 시각 + driverCode hash 색상 dot. */}
          <View style={styles.realtimeBlock} testID="driver-dashboard-realtime-mobile">
            <View
              style={[styles.realtimeDot, { backgroundColor: realtimeDotColor }]}
              testID="driver-dashboard-realtime-dot-mobile"
            />
            <Text style={styles.realtimeText} testID="driver-dashboard-realtime-time-mobile">
              {lastSyncedAt ? `갱신 ${formatTimeShort(lastSyncedAt)}` : '연결 대기…'}
            </Text>
          </View>
        </View>
      </View>
      {error && (
        <View style={styles.errorCard}>
          <Text style={[styles.errorText, badgeStyle('warn')]}>오류</Text>
          <Text style={styles.errorMessage}>{error}</Text>
        </View>
      )}
      <FlatList
        data={vehicles}
        keyExtractor={(item, index) => `${item.dispatchDate}-${item.dispatchType}-${item.vehicleSequence}-${index}`}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          !error ? (
            <View style={styles.empty}>
              <Text style={styles.muted}>배정된 차량이 없습니다</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>{formatVehicleTitle(item)}</Text>
              <Text style={badgeStyle(STATUS_BADGE_KIND[item.status])}>
                {STATUS_LABEL[item.status]}
              </Text>
            </View>
            <View style={styles.cardRow}>
              <Text style={styles.label}>톤수</Text>
              <Text style={styles.value}>{TONNAGE_LABEL[item.tonnage]}</Text>
            </View>
            <View style={styles.cardRow}>
              <Text style={styles.label}>상태</Text>
              <Text style={styles.value}>{STATUS_LABEL[item.status]}</Text>
            </View>
            <View style={styles.stopList}>
              {item.stops.length > 0 ? item.stops.map((stop) => (
                <StopRow
                  key={`${item.dispatchDate}-${item.dispatchType}-${item.vehicleSequence}-${stop.stopSequence}`}
                  vehicle={item}
                  stop={stop}
                  onOpenSignature={onOpenSignature}
                />
              )) : (
                <Text style={styles.stopEmpty}>정차 정보가 없습니다</Text>
              )}
            </View>
            {onOpenSlipDetail ? (
              <TouchableOpacity
                style={styles.openSlipBtn}
                onPress={() => onOpenSlipDetail({
                  // 본 PR 시점 backend 응답 = vehicle 단순 요약 → placeholder slipId.
                  // backend 확장 (vehicleSequence → slipId 매핑) 후 실 slipId 전달.
                  slipId: `vehicle-${item.vehicleSequence}`,
                  slipNo: `차량 #${item.vehicleSequence}`,
                })}
                testID={`driver-dashboard-open-slip-mobile-${item.vehicleSequence}`}
              >
                <Text style={styles.openSlipLabel}>전표 보기 / 코멘트</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function StopRow({
  vehicle,
  stop,
  onOpenSignature,
}: {
  vehicle: DispatchVehicleSummary;
  stop: DriverStopSummary;
  onOpenSignature?: (target: SignatureTarget) => void;
}): ReactElement {
  const disabled = !onOpenSignature || stop.status === 'UNPARSED';
  const stopLabel = formatStopLabel(stop);
  return (
    <View style={styles.stopRow}>
      <View style={styles.stopBody}>
        <View style={styles.stopHead}>
          <Text style={styles.stopTitle}>정차 #{stop.stopSequence}</Text>
          <Text style={badgeStyle(STOP_STATUS_BADGE[stop.status])}>{STOP_STATUS_LABEL[stop.status]}</Text>
        </View>
        <Text style={styles.stopPartner}>{stop.parsedPartnerName ?? '미해석 거래처'}</Text>
        <Text style={styles.stopAddress} numberOfLines={2}>{stop.parsedAddress ?? stop.rawText}</Text>
        {stop.parsedKakaoSeq ? (
          <Text style={styles.stopSeq}>카톡 순번 {stop.parsedKakaoSeq}</Text>
        ) : null}
      </View>
      <TouchableOpacity
        style={[styles.signBtn, disabled && styles.signBtnDisabled]}
        disabled={disabled}
        onPress={() => onOpenSignature?.({
          dispatchType: vehicle.dispatchType,
          vehicleSequence: vehicle.vehicleSequence,
          stopSequence: stop.stopSequence,
          parsedKakaoSeq: stop.parsedKakaoSeq,
          partnerName: stop.parsedPartnerName,
          stopLabel,
        })}
        testID={`arologis-open-signature-${vehicle.vehicleSequence}-${stop.stopSequence}`}
        accessibilityState={{ disabled }}
      >
        <Text style={[styles.signBtnText, disabled && styles.signBtnTextDisabled]}>서명</Text>
      </TouchableOpacity>
    </View>
  );
}

const STOP_STATUS_LABEL: Record<DriverStopSummary['status'], string> = {
  PENDING: '대기',
  ARRIVED: '도착',
  DELIVERED: '완료',
  FAILED: '실패',
  UNPARSED: '미해석',
};

function formatVehicleTitle(vehicle: DispatchVehicleSummary): string {
  return vehicle.label ? `차량 #${vehicle.vehicleSequence} ${vehicle.label}` : `차량 #${vehicle.vehicleSequence}`;
}

function formatStopLabel(stop: DriverStopSummary): string {
  const parts = [
    stop.parsedPartnerName,
    stop.parsedAddress ?? stop.rawText,
    stop.parsedKakaoSeq ? `카톡 순번 ${stop.parsedKakaoSeq}` : null,
  ].filter(Boolean);
  return parts.join(' / ');
}

/** PR-H4c — 마지막 동기화 시각 헤더 표시 (HH:mm:ss) — local timezone. */
function formatTimeShort(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface.app },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.surface.app },
  header: {
    paddingHorizontal: spacing[6],
    paddingTop: spacing[4],
    paddingBottom: spacing[2],
    backgroundColor: colors.surface.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.line.default,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing[2],
  },
  headerTitleBlock: { flex: 1 },
  realtimeBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingTop: spacing[1],
  },
  realtimeDot: {
    width: 8,
    height: 8,
    borderRadius: radii.full,
  },
  realtimeText: {
    fontSize: typography.fontSize.xs,
    color: colors.ink.tertiary,
    fontFamily: typography.fontFamily.sans,
  },
  h1: {
    fontSize: typography.fontSize.h1,
    fontWeight: typography.fontWeight.bold,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.secondary,
    marginTop: spacing[1],
    fontFamily: typography.fontFamily.sans,
  },
  list: { padding: spacing[4], gap: spacing[3] },
  empty: { alignItems: 'center', paddingTop: spacing[10] },
  muted: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.tertiary,
    marginTop: spacing[2],
    fontFamily: typography.fontFamily.sans,
  },
  card: {
    backgroundColor: colors.surface.card,
    borderRadius: radii.card,
    padding: spacing[4],
    marginBottom: spacing[3],
    borderWidth: 1,
    borderColor: colors.line.default,
    // soft elevation alias (web tokens.css `--elev-card` 1:1)
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[3],
  },
  cardTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing[1],
  },
  label: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.secondary,
    fontFamily: typography.fontFamily.sans,
  },
  value: {
    fontSize: typography.fontSize.base,
    color: colors.ink.primary,
    fontWeight: typography.fontWeight.medium,
    fontFamily: typography.fontFamily.sans,
  },
  openSlipBtn: {
    marginTop: spacing[3],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: radii.button,
    backgroundColor: colors.action.brandSubtle,
    alignSelf: 'flex-start',
  },
  openSlipLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.action.brandActive,
    fontFamily: typography.fontFamily.sans,
  },
  stopList: {
    marginTop: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.line.default,
    paddingTop: spacing[3],
    gap: spacing[2],
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing[2],
    paddingVertical: spacing[2],
  },
  stopBody: { flex: 1, minWidth: 0 },
  stopHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
  },
  stopTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
  },
  stopPartner: {
    marginTop: spacing[1],
    fontSize: typography.fontSize.sm,
    color: colors.ink.primary,
    fontWeight: typography.fontWeight.medium,
    fontFamily: typography.fontFamily.sans,
  },
  stopAddress: {
    marginTop: spacing[1],
    fontSize: typography.fontSize.xs,
    color: colors.ink.secondary,
    lineHeight: typography.fontSize.xs * typography.lineHeight.base,
    fontFamily: typography.fontFamily.sans,
  },
  stopSeq: {
    marginTop: spacing[1],
    fontSize: typography.fontSize.xs,
    color: colors.ink.tertiary,
    fontFamily: typography.fontFamily.sans,
  },
  stopEmpty: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.tertiary,
    fontFamily: typography.fontFamily.sans,
  },
  signBtn: {
    width: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.button,
    backgroundColor: colors.action.brandSubtle,
  },
  signBtnDisabled: {
    backgroundColor: colors.surface.subtle,
    borderWidth: 1,
    borderColor: colors.line.default,
  },
  signBtnText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.action.brandActive,
    fontFamily: typography.fontFamily.sans,
  },
  signBtnTextDisabled: {
    color: colors.ink.tertiary,
  },
  errorCard: {
    margin: spacing[4],
    padding: spacing[3],
    backgroundColor: colors.state.warningBg,
    borderRadius: radii.card,
    borderLeftWidth: 4,
    borderLeftColor: colors.state.warning,
  },
  errorText: { alignSelf: 'flex-start' },
  errorMessage: {
    marginTop: spacing[2],
    color: colors.ink.primary,
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily.sans,
  },
});
