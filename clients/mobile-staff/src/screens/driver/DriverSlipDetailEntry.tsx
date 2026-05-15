/**
 * DriverSlipDetailEntry — D-AX-12 driver-local slip detail boundary.
 *
 * DriverTabNavigator 가 Samhan Public SlipDetailScreen 을 직접 import 하지 않도록 막는 경계 화면.
 * 현재 driver dashboard 응답은 실제 slipId 를 제공하지 않으므로, vehicle 기반 placeholder 는 안내
 * 화면으로 처리한다. 실 slipId 연결은 아로로지스 모바일 이식 후속 PR 에서 별도 설계한다.
 */

import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radii, spacing, typography } from '../../theme/tokens';

interface Props {
  /** JWT access token — 후속 실 slip bridge 활성 시 사용. 현재 guard 화면에서는 보관만 한다. */
  token: string | null;
  /** slip 식별자 후보. 현재 driver dashboard 에서는 `vehicle-*` placeholder 가 전달된다. */
  slipId: string;
  /** 사용자 노출용 전표 번호 또는 차량 표시명. */
  slipNo?: string;
  /** 사용자 노출용 거래처명. */
  partnerName?: string | null;
  /** 후속 slip bridge 작업을 위해 기존 DriverTabNavigator role contract 를 유지. */
  currentUserRole?: 'DRIVER';
  /** driver dashboard 로 복귀. */
  onBack: () => void;
}

export default function DriverSlipDetailEntry({
  slipId,
  slipNo,
  partnerName,
  onBack,
}: Props): JSX.Element {
  const displaySlipNo = slipNo ?? '전표 미연결';
  const displayPartnerName = partnerName ?? '거래처 정보 대기';
  const isPlaceholder = slipId.startsWith('vehicle-') || slipId.length === 0;

  return (
    <View style={styles.container} testID="driver-slip-detail-entry-mobile">
      <View style={styles.card}>
        <Text style={styles.eyebrow}>D-AX-12</Text>
        <Text style={styles.title}>전표 상세 연결 준비 중</Text>
        <Text style={styles.body}>
          현재 기사 배차 응답에는 실제 전표 식별자가 포함되지 않아 Samhan Public 전표
          상세를 직접 열지 않습니다. 배차 데이터에 전표 번호가 연결되면 이 화면에서
          아로로지스 전용 상세로 이어집니다.
        </Text>

        <View style={styles.metaBox}>
          <Text style={styles.metaLabel}>선택 항목</Text>
          <Text style={styles.metaValue}>{displaySlipNo}</Text>
          <Text style={styles.metaSub}>{displayPartnerName}</Text>
          {isPlaceholder ? (
            <Text style={styles.placeholderBadge}>배차 vehicle 기준 임시 항목</Text>
          ) : null}
        </View>

        <TouchableOpacity
          onPress={onBack}
          style={styles.backButton}
          testID="driver-slip-detail-entry-back-mobile"
        >
          <Text style={styles.backLabel}>배차 목록으로 돌아가기</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.app,
    padding: spacing[4],
    justifyContent: 'center',
  },
  card: {
    backgroundColor: colors.surface.card,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line.default,
    padding: spacing[5],
    gap: spacing[3],
  },
  eyebrow: {
    fontSize: typography.fontSize.xs,
    color: colors.action.brandActive,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
  },
  title: {
    fontSize: typography.fontSize.xl,
    color: colors.ink.primary,
    fontWeight: typography.fontWeight.bold,
    fontFamily: typography.fontFamily.sans,
  },
  body: {
    fontSize: typography.fontSize.base,
    color: colors.ink.secondary,
    lineHeight: typography.fontSize.base * typography.lineHeight.base,
    fontFamily: typography.fontFamily.sans,
  },
  metaBox: {
    backgroundColor: colors.surface.subtle,
    borderRadius: radii.card,
    padding: spacing[3],
    gap: spacing[1],
  },
  metaLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.ink.tertiary,
    fontFamily: typography.fontFamily.sans,
  },
  metaValue: {
    fontSize: typography.fontSize.lg,
    color: colors.ink.primary,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
  },
  metaSub: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.secondary,
    fontFamily: typography.fontFamily.sans,
  },
  placeholderBadge: {
    alignSelf: 'flex-start',
    marginTop: spacing[2],
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    borderRadius: radii.button,
    backgroundColor: colors.state.infoBg,
    color: colors.state.info,
    fontSize: typography.fontSize.xs,
    fontFamily: typography.fontFamily.sans,
    fontWeight: typography.fontWeight.semibold,
    overflow: 'hidden',
  },
  backButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.action.brand,
    borderRadius: radii.button,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  backLabel: {
    color: colors.ink.onPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    fontFamily: typography.fontFamily.sans,
  },
});
