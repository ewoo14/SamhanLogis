/**
 * SalesHomeScreen — P1-4 영업 native 앱 대시보드.
 *
 * 집계 기간 매출 / 미수금 / 견적 상태별 건수를 카드 형태로 표시.
 * BE: slip-service GET /mobile/sales/dashboard (@RequirePermission VIEW).
 *
 * UUID 비공개:
 *   - 화면에 표시하는 숫자/건수는 UUID 아님. 집계 수치만 노출.
 *
 * 진입 흐름:
 *   - AppRootNavigator → mode 'sales' → SalesTabNavigator → SalesHomeScreen.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getSalesDashboard, type SalesDashboardResponse } from '../../api/sales';
import { colors, radii, spacing, typography } from '../../theme/tokens';

interface Props {
  token: string | null;
  /** 탭 이동 콜백 — 견적 / 주문 버튼 클릭 시 */
  onNavigate: (tab: 'quotation' | 'order' | 'customer') => void;
}

type LoadState = 'idle' | 'loading' | 'ok' | 'error';

export default function SalesHomeScreen({ token, onNavigate }: Props): JSX.Element {
  const [data, setData] = useState<SalesDashboardResponse | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoadState('loading');
      setErrorMsg('');
      try {
        const result = await getSalesDashboard(token);
        setData(result);
        setLoadState('ok');
      } catch (e) {
        const msg = e instanceof Error ? e.message : '대시보드 로드 중 오류가 발생했습니다.';
        setErrorMsg(msg);
        setLoadState('error');
      } finally {
        if (isRefresh) setRefreshing(false);
      }
    },
    [token],
  );

  useEffect(() => {
    void load();
  }, [load]);

  if (loadState === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.action.brand} />
        <Text style={styles.loadingText}>대시보드 로딩 중…</Text>
      </View>
    );
  }

  if (loadState === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{errorMsg}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => void load()}>
          <Text style={styles.retryBtnLabel}>다시 시도</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void load(true)}
          colors={[colors.action.brand]}
          tintColor={colors.action.brand}
        />
      }
    >
      {/* 헤더 */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>영업 대시보드</Text>
        {data && (
          <Text style={styles.headerDate}>{formatDate(data.fromDate)} ~ {formatDate(data.toDate)}</Text>
        )}
      </View>

      {/* 집계 카드 */}
      <View style={styles.cardRow}>
        <MetricCard
          label="기간 매출"
          value={data ? formatKRW(data.totalSalesAmount) : '—'}
          accent={colors.action.brand}
        />
        <MetricCard
          label="미수금"
          value={data ? formatKRW(data.totalOutstanding) : '—'}
          accent={data && data.totalOutstanding > 0 ? colors.state.danger : colors.state.success}
        />
      </View>
      <View style={styles.cardRow}>
        <MetricCard
          label="진행 견적"
          value={data ? `${data.estimateDraftCount + data.estimateSentCount}건` : '—'}
          accent={colors.state.info}
        />
        <MetricCard
          label="수주 완료 견적"
          value={data ? `${data.estimateAcceptedCount}건` : '—'}
          accent={colors.sliceAccent.success}
        />
      </View>

      {/* 빠른 이동 버튼 */}
      <View style={styles.quickActions}>
        <Text style={styles.sectionTitle}>빠른 작업</Text>
        <QuickButton
          label="신규 견적 작성"
          onPress={() => onNavigate('quotation')}
          color={colors.action.brand}
        />
        <QuickButton
          label="신규 주문 등록"
          onPress={() => onNavigate('order')}
          color={colors.state.success}
        />
        <QuickButton
          label="거래처 검색"
          onPress={() => onNavigate('customer')}
          color={colors.state.info}
        />
      </View>
    </ScrollView>
  );
}

// -----------------------------------------------------------------------
// 서브 컴포넌트
// -----------------------------------------------------------------------

interface MetricCardProps {
  label: string;
  value: string;
  sub?: string;
  subColor?: string;
  accent: string;
}

function MetricCard({ label, value, sub, subColor, accent }: MetricCardProps): JSX.Element {
  return (
    <View style={[styles.card, { borderLeftColor: accent }]}>
      <Text style={styles.cardLabel}>{label}</Text>
      <Text style={styles.cardValue}>{value}</Text>
      {sub !== undefined && (
        <Text style={[styles.cardSub, { color: subColor ?? colors.ink.tertiary }]}>{sub}</Text>
      )}
    </View>
  );
}

interface QuickButtonProps {
  label: string;
  onPress: () => void;
  color: string;
}

function QuickButton({ label, onPress, color }: QuickButtonProps): JSX.Element {
  return (
    <TouchableOpacity
      style={[styles.quickBtn, { borderColor: color }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[styles.quickBtnLabel, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// -----------------------------------------------------------------------
// 헬퍼
// -----------------------------------------------------------------------

function formatKRW(amount: number): string {
  return `${amount.toLocaleString('ko-KR')}원`;
}

function formatDate(iso: string): string {
  // ISO8601 date (YYYY-MM-DD) → 한국어 표시
  const d = new Date(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

// -----------------------------------------------------------------------
// 스타일
// -----------------------------------------------------------------------

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.surface.app },
  content: { padding: spacing[4], gap: spacing[3] },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface.app,
    padding: spacing[6],
    gap: spacing[4],
  },
  loadingText: {
    fontSize: typography.fontSize.base,
    color: colors.ink.secondary,
    fontFamily: typography.fontFamily.sans,
    marginTop: spacing[2],
  },
  errorText: {
    fontSize: typography.fontSize.base,
    color: colors.state.danger,
    fontFamily: typography.fontFamily.sans,
    textAlign: 'center',
  },
  retryBtn: {
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[6],
    backgroundColor: colors.action.brand,
    borderRadius: radii.button,
  },
  retryBtnLabel: {
    fontSize: typography.fontSize.base,
    color: colors.ink.onPrimary,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
  },
  header: {
    marginBottom: spacing[2],
  },
  headerTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
  },
  headerDate: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.tertiary,
    fontFamily: typography.fontFamily.sans,
    marginTop: spacing[1],
  },
  cardRow: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  card: {
    flex: 1,
    backgroundColor: colors.surface.card,
    borderRadius: radii.card,
    borderLeftWidth: 4,
    padding: spacing[4],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
    gap: spacing[1],
  },
  cardLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.ink.tertiary,
    fontWeight: typography.fontWeight.medium,
    fontFamily: typography.fontFamily.sans,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardValue: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
  },
  cardSub: {
    fontSize: typography.fontSize.xs,
    fontFamily: typography.fontFamily.sans,
  },
  quickActions: {
    marginTop: spacing[2],
    gap: spacing[3],
  },
  sectionTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.ink.primary,
    fontFamily: typography.fontFamily.sans,
    marginBottom: spacing[1],
  },
  quickBtn: {
    paddingVertical: spacing[4],
    paddingHorizontal: spacing[4],
    borderRadius: radii.button,
    borderWidth: 1.5,
    backgroundColor: colors.surface.card,
    alignItems: 'center',
  },
  quickBtnLabel: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
  },
});
