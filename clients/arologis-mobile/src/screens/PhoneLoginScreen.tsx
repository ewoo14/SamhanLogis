/**
 * F5 skeleton 시점의 PhoneLoginScreen placeholder.
 *
 * 실제 휴대번호 입력 + driverLogin 호출 + 401 alert ("등록되지 않은 번호입니다.")
 * 는 F6 (별도 commit) 에서 구현한다.
 */
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme/tokens';

export default function PhoneLoginScreen(): JSX.Element {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>아로로지스 기사</Text>
      <Text style={styles.body}>휴대번호 로그인 — F6 에서 구현됩니다.</Text>
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
  heading: {
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.ink.primary,
    marginBottom: spacing[2],
  },
  body: {
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.fontSize.base,
    color: colors.ink.secondary,
  },
});
