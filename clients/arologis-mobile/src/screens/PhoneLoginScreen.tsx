/**
 * PhoneLoginScreen — F6 — 휴대번호 passwordless 로그인 (D-AX-09).
 *
 * 흐름:
 * 1) 사용자가 본인 휴대번호 입력 (010-XXXX-XXXX).
 * 2) "로그인" 버튼 → `driverLogin(phoneNumber)` 호출.
 * 3) 성공 (사전 등록된 기사) → `setAuth(...)` → RootNavigator 가 DispatchList 로 분기.
 * 4) 401 (미등록) → Alert "등록되지 않은 번호입니다. 관리자에게 문의하세요."
 * 5) 그 외 오류 → Alert "로그인 중 오류가 발생했습니다."
 *
 * UUID 비공개 — driverCode 는 응답에 포함되어 RootNavigator 에서 표시 가능,
 * BE 내부 식별자 (UUID) 는 token 안에만 존재 + 화면 표시 X.
 */
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { driverLogin } from '../api/auth';
import { ApiError } from '../api/client';
import { setAuth } from '../stores/authStore';
import { colors, radii, spacing, typography } from '../theme/tokens';

export default function PhoneLoginScreen(): JSX.Element {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (): Promise<void> => {
    const value = phoneNumber.trim();
    if (!value) {
      Alert.alert('휴대번호를 입력해 주세요.');
      return;
    }
    setSubmitting(true);
    try {
      const response = await driverLogin(value);
      setAuth({
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
        role: response.role,
        driverCode: response.driverCode,
        phoneNumber: response.phoneNumber,
        expiresAt: response.expiresAt,
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        Alert.alert('로그인 실패', '등록되지 않은 번호입니다. 관리자에게 문의하세요.');
      } else {
        Alert.alert('로그인 실패', '로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.heading}>아로로지스 기사</Text>
        <Text style={styles.body}>본인 휴대번호로 로그인합니다.</Text>
        <TextInput
          style={styles.input}
          value={phoneNumber}
          onChangeText={setPhoneNumber}
          placeholder="010-0000-0000"
          placeholderTextColor={colors.ink.tertiary}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          editable={!submitting}
          testID="phone-input"
        />
        <TouchableOpacity
          style={[styles.button, submitting && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
          accessibilityRole="button"
          testID="phone-submit"
        >
          {submitting ? (
            <ActivityIndicator color={colors.ink.onPrimary} />
          ) : (
            <Text style={styles.buttonText}>로그인</Text>
          )}
        </TouchableOpacity>
        <Text style={styles.hint}>
          비밀번호 없이 본인 휴대번호만으로 로그인됩니다.
          {'\n'}
          미등록 시 관리자가 사전 등록한 뒤 사용 가능합니다.
        </Text>
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
    borderColor: colors.line.default,
  },
  heading: {
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.ink.primary,
    textAlign: 'center',
  },
  body: {
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.fontSize.base,
    color: colors.ink.secondary,
    textAlign: 'center',
    marginBottom: spacing[2],
  },
  input: {
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.fontSize.lg,
    color: colors.ink.primary,
    borderWidth: 1,
    borderColor: colors.line.default,
    borderRadius: radii.md,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    textAlign: 'center',
  },
  button: {
    backgroundColor: colors.action.brand,
    borderRadius: radii.md,
    paddingVertical: spacing[3],
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.ink.onPrimary,
  },
  hint: {
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.fontSize.sm,
    color: colors.ink.tertiary,
    textAlign: 'center',
    marginTop: spacing[2],
  },
});
