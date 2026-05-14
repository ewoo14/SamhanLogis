/**
 * PhoneLoginScreen — F6 (D-AX-09 passwordless) + D-AX-14 (자동 폰번호 인식 + 1-tap 로그인).
 *
 * 흐름:
 * 1) 첫 마운트 — `usePhoneNumberAutoFill` 가 SecureStore → Android `READ_PHONE_NUMBERS` 권한
 *    → `react-native-device-info.getPhoneNumber()` 순으로 본인 번호 자동 인식 시도.
 *    iOS / 권한 거부 / native 미가용 = 수동 입력 fallback.
 *
 * 2) 자동 인식 성공 시 — "010-1234-5678 로 로그인" 대형 버튼 1-tap.
 *    다른 번호 사용 시 "다른 번호로 로그인" 링크 → 수동 입력 모드.
 *
 * 3) 수동 입력 — 기존 NumPad TextInput 흐름 (D-AX-09 passwordless).
 *
 * 4) 성공 (사전 등록된 기사) → `setAuth(...)` + `saveAutoFillNumber(value)` (다음 실행 1-tap).
 *
 * 5) 401 (미등록) → Alert + SecureStore clear (잘못된 번호 저장 회피) + 수동 입력 모드 복귀.
 *
 * UUID 비공개 가드 — driverCode 만 표시, 내부 UUID 는 token 안에만.
 */
import * as React from 'react';
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
import {
  usePhoneNumberAutoFill,
  saveAutoFillNumber,
  clearAutoFillNumber,
} from '../hooks/usePhoneNumberAutoFill';
import { colors, radii, spacing, typography } from '../theme/tokens';

export default function PhoneLoginScreen(): React.ReactElement {
  const { result, loading, override } = usePhoneNumberAutoFill();
  const [manualValue, setManualValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [manualMode, setManualMode] = useState(false);

  const showAutoCard = !loading && result.autoFilled && !manualMode;
  const showManualCard = !loading && (!result.autoFilled || manualMode);

  const performLogin = async (value: string): Promise<void> => {
    setSubmitting(true);
    try {
      const response = await driverLogin(value);
      await saveAutoFillNumber(value);
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
        Alert.alert(
          '로그인 실패',
          '등록되지 않은 번호입니다. 관리자에게 문의하세요.',
        );
        await clearAutoFillNumber();
        setManualMode(true);
      } else {
        Alert.alert(
          '로그인 실패',
          '로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const onAutoTap = (): void => {
    void performLogin(result.phoneNumber);
  };

  const onManualSubmit = (): void => {
    const value = manualValue.trim();
    if (!value) {
      Alert.alert('휴대번호를 입력해 주세요.');
      return;
    }
    void performLogin(value);
  };

  const onUseDifferent = (): void => {
    override(result.phoneNumber);
    setManualValue(result.phoneNumber);
    setManualMode(true);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.heading}>아로로지스 기사</Text>
          <Text style={styles.body}>본인 번호를 자동으로 인식하는 중입니다…</Text>
          <ActivityIndicator size="large" color={colors.action.brand} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.heading}>아로로지스 기사</Text>

        {showAutoCard ? (
          <>
            <Text style={styles.body}>본인 번호로 바로 접속하세요.</Text>
            <Text style={styles.phoneNumber} testID="auto-phone-display">
              {result.phoneNumber}
            </Text>
            <TouchableOpacity
              style={[styles.button, submitting && styles.buttonDisabled]}
              onPress={onAutoTap}
              disabled={submitting}
              accessibilityRole="button"
              testID="phone-auto-submit"
            >
              {submitting ? (
                <ActivityIndicator color={colors.ink.onPrimary} />
              ) : (
                <Text style={styles.buttonText}>본인 번호로 로그인</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onUseDifferent}
              disabled={submitting}
              accessibilityRole="link"
              testID="use-different-number"
            >
              <Text style={styles.linkText}>다른 번호로 로그인</Text>
            </TouchableOpacity>
            <Text style={styles.hint}>
              {result.source === 'secure-store'
                ? '이전 로그인 번호로 자동 입력되었습니다.'
                : '휴대전화 번호 권한으로 본인 번호를 자동 인식했습니다.'}
            </Text>
          </>
        ) : null}

        {showManualCard ? (
          <>
            <Text style={styles.body}>본인 휴대번호로 로그인합니다.</Text>
            <TextInput
              style={styles.input}
              value={manualValue}
              onChangeText={setManualValue}
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
              onPress={onManualSubmit}
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
              {result.permissionAsked
                ? '휴대전화 번호 권한이 거부되어 수동 입력합니다.\n관리자가 사전 등록한 번호로만 로그인됩니다.'
                : '비밀번호 없이 본인 휴대번호만으로 로그인됩니다.\n미등록 시 관리자가 사전 등록한 뒤 사용 가능합니다.'}
            </Text>
          </>
        ) : null}
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
  phoneNumber: {
    fontFamily: typography.fontFamily.sans,
    fontSize: 32,
    fontWeight: typography.fontWeight.bold,
    color: colors.action.brand,
    textAlign: 'center',
    marginVertical: spacing[3],
    letterSpacing: 1,
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
    paddingVertical: spacing[4],
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
  linkText: {
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.fontSize.base,
    color: colors.action.brand,
    textAlign: 'center',
    textDecorationLine: 'underline',
    paddingVertical: spacing[2],
  },
  hint: {
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.fontSize.sm,
    color: colors.ink.tertiary,
    textAlign: 'center',
    marginTop: spacing[2],
  },
});
