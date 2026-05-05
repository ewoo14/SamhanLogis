/**
 * StaffLoginScreen v1 — 영업직원 사번 + 비밀번호 입력 게이트.
 *
 * Mobile v4 의 BizGateScreen (사업자번호 — 거래처용) 와 분리.
 * 사용자 명시 (PR #60 회고): "견적서 → 삼한 사무실 영업직원용".
 *
 * 인증:
 *   - 옵션 A (v1): 사번 + 비밀번호 (`POST /api/v1/auth/staff-login`)
 *   - 옵션 B (v2): SSO (OAuth) — 후속
 *
 * mock fallback (v1):
 *   - S001 / 1234 → 홍길동
 *   - S002 / 1234 → 김영희
 *
 * UUID 미노출 — 사번 (employeeCode) + 이름 만 노출.
 *
 * 시각 디자인:
 *   - 밝은 톤 (StaffGateBg) — Mobile v4 의 어두운 BizGate (gateBg `#020617`) 와 시각적 구분.
 *   - 영업직원 워크플로우 = 사무실/이동중 자주 진입 → 빠른 입력 + KeyboardAvoidingView.
 */

import { CommonActions, useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { loginStaff } from '@/api/auth';
import { useAuthStore } from '@/stores/authStore';
import { colors, fontSize, fontWeight, radii, spacing } from '@/tokens/tokens';
import type { AuthStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'StaffLogin'>;

export function StaffLoginScreen(_props: Props): JSX.Element {
  const [employeeCode, setEmployeeCode] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const login = useAuthStore((s) => s.login);
  const rootNav = useNavigation();

  const trimmedCode = employeeCode.trim();
  const isValid = trimmedCode.length >= 2 && password.length >= 4;

  const handleSubmit = async (): Promise<void> => {
    if (!isValid) {
      setError('사번 (2자 이상) 및 비밀번호 (4자 이상) 를 입력해 주세요.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await loginStaff(trimmedCode, password);
      switch (res.status) {
        case 'OK':
          if (res.token && res.employeeCode && res.employeeName) {
            await login(res.employeeCode, res.employeeName, res.token);
            rootNav.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Main' }] }));
          }
          break;
        case 'INVALID_CREDENTIALS':
          setError('사번 또는 비밀번호가 올바르지 않습니다.');
          break;
        case 'LOCKED':
          Alert.alert('계정 잠금', res.lockReason ?? '연속 3회 실패로 잠금되었습니다. 관리자에게 문의해 주세요.');
          break;
        case 'UNKNOWN':
        default:
          setError('등록되지 않은 사번 입니다.');
      }
    } catch (_e) {
      setError('서버 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card} testID="staff-login-card">
            {/* 로고 영역 */}
            <View style={styles.logoBox}>
              <Text style={styles.logoText}>삼한공조시스템</Text>
              <Text style={styles.logoSub}>영업직원 견적</Text>
            </View>

            {/* 사번 입력 */}
            <Text style={styles.fieldLabel}>사번</Text>
            <TextInput
              style={styles.input}
              placeholder="예) S001"
              placeholderTextColor={colors.textSubtle}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={10}
              value={employeeCode}
              onChangeText={setEmployeeCode}
              autoFocus
              testID="staff-employee-code-input"
              returnKeyType="next"
            />

            {/* 비밀번호 입력 */}
            <Text style={[styles.fieldLabel, styles.fieldLabelSpacing]}>비밀번호</Text>
            <TextInput
              style={styles.input}
              placeholder="비밀번호"
              placeholderTextColor={colors.textSubtle}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={32}
              value={password}
              onChangeText={setPassword}
              testID="staff-password-input"
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Pressable
              style={[
                styles.button,
                (!isValid || loading) && styles.buttonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!isValid || loading}
              testID="staff-submit"
            >
              <Text style={styles.buttonLabel}>{loading ? '확인 중...' : '로그인'}</Text>
            </Pressable>

            {/* 안내 영역 */}
            <View style={styles.helpBlock}>
              <Text style={styles.helpTitle}>영업직원 전용 견적 앱</Text>
              <Text style={styles.helpText}>
                본 앱은 (주)삼한공조시스템 영업직원만 사용 가능합니다.{'\n'}
                사번 / 비밀번호 분실 시 관리부에 문의해 주세요.{'\n'}
                ☎ 02-3465-1331
              </Text>
              <Text style={[styles.helpText, styles.helpTextMuted]}>
                {'\n'}거래처 (외부) 는 별도 앱 (주문) 을 사용해 주세요.
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.staffGateBg },
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: spacing.base,
    paddingHorizontal: spacing.base,
  },
  card: {
    backgroundColor: colors.staffCardBg,
    borderRadius: radii.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#0F1216',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
  },
  logoBox: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logoText: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    color: colors.brand500,
  },
  logoSub: {
    marginTop: spacing.xs,
    fontSize: fontSize.md,
    color: colors.textMuted,
    fontWeight: fontWeight.medium,
  },
  fieldLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  fieldLabelSpacing: {
    marginTop: spacing.base,
  },
  input: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.neutral0,
    fontSize: fontSize.lg,
    color: colors.text,
  },
  errorText: {
    marginTop: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.danger,
    textAlign: 'center',
  },
  button: {
    marginTop: spacing.lg,
    height: 48,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand500,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonLabel: {
    color: colors.textOnBrand,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  helpBlock: {
    marginTop: spacing.xl,
    paddingTop: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  helpTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  helpText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    lineHeight: 18,
  },
  helpTextMuted: {
    color: colors.textSubtle,
  },
});
