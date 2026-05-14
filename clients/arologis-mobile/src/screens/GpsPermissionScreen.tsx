/**
 * GpsPermissionScreen — F7 — foreground GPS 권한 거부 시 차단 화면.
 *
 * 사용자 결정 4 GPS 하이브리드 (2026-05-07): foreground 거부 시 어플 사용 불가.
 *
 * RootNavigator 가 useGpsPermission().blocked 일 때 본 화면을 노출 — 다른 화면은 진입 차단.
 *
 * UX:
 * - 권한 거부 안내 텍스트.
 * - "다시 시도" 버튼 → hook 의 retry() 호출 (사용자가 OS 설정에서 허용 후 재시도).
 * - "OS 설정 열기" 안내 (Expo Linking — 본 PR scope 외, hint 텍스트로만 노출).
 */
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radii, spacing, typography } from '../theme/tokens';

interface Props {
  status: 'denied' | 'unavailable';
  onRetry: () => void;
}

export default function GpsPermissionScreen({ status, onRetry }: Props): JSX.Element {
  const isUnavailable = status === 'unavailable';
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.heading}>GPS 권한이 필요합니다</Text>
        <Text style={styles.body}>
          {isUnavailable
            ? '이 기기에서는 위치 서비스를 사용할 수 없습니다. 다른 기기에서 다시 시도해 주세요.'
            : '배송 도중 위치를 보고하기 위해 위치 권한이 반드시 필요합니다. 권한이 없으면 아로로지스 기사 어플을 사용할 수 없습니다.'}
        </Text>
        <Text style={styles.hint}>
          OS 설정 {'>'} 위치 {'>'} 아로로지스 기사 {'>'} 허용 으로 설정한 뒤 다시 시도해 주세요.
        </Text>
        <TouchableOpacity
          style={styles.button}
          onPress={onRetry}
          accessibilityRole="button"
          testID="gps-retry"
        >
          <Text style={styles.buttonText}>다시 시도</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.app,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[4],
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface.card,
    borderRadius: radii.lg,
    padding: spacing[6],
    gap: spacing[3],
    borderWidth: 1,
    borderColor: colors.state.danger,
  },
  heading: {
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.state.danger,
    textAlign: 'center',
  },
  body: {
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.fontSize.base,
    color: colors.ink.primary,
    lineHeight: 22,
  },
  hint: {
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.fontSize.sm,
    color: colors.ink.secondary,
    backgroundColor: colors.surface.subtle,
    padding: spacing[3],
    borderRadius: radii.md,
  },
  button: {
    backgroundColor: colors.action.brand,
    borderRadius: radii.md,
    paddingVertical: spacing[3],
    alignItems: 'center',
    marginTop: spacing[2],
  },
  buttonText: {
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.ink.onPrimary,
  },
});
