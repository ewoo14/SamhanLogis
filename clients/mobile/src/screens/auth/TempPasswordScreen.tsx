/**
 * TempPasswordScreen — 임시 PW 4자리 입력.
 *
 * legacy 출처: partner-order Code.js #stepAuthAction PW 입력 + 3-fail LOCKED.
 *
 * 4-fail = LOCKED → 관리자 해제 필요.
 */

import { CommonActions, useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { loginWithTempPassword } from '@/api/auth';
import { RNButton } from '@/components/RNButton';
import { RNFormField } from '@/components/RNFormField';
import { useAuthStore } from '@/stores/authStore';
import { colors, fontSize, fontWeight, radii, spacing } from '@/tokens/tokens';
import type { AuthStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'TempPassword'>;

export function TempPasswordScreen({ route, navigation }: Props): JSX.Element {
  const { partnerCode, partnerName } = route.params;
  const [pw, setPw] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failCount, setFailCount] = useState(0);
  const login = useAuthStore((s) => s.login);
  const rootNav = useNavigation();

  const handleSubmit = async (): Promise<void> => {
    if (pw.length !== 4) {
      setError('임시 비밀번호 4자리를 입력해 주세요.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await loginWithTempPassword(partnerCode, pw);
      if (res.status === 'OK' && res.token && res.partnerCode && res.partnerName) {
        await login(res.partnerCode, res.partnerName, res.token);
        rootNav.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Main' }] }));
      } else if (res.status === 'LOCKED') {
        Alert.alert('잠금', '연속 실패로 잠금되었습니다. 관리자에게 문의해 주세요.', [
          { text: '확인', onPress: () => navigation.popToTop() },
        ]);
      } else {
        const next = failCount + 1;
        setFailCount(next);
        setError(`비밀번호가 일치하지 않습니다. (${next}/3)`);
      }
    } catch (e) {
      setError('서버 연결에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.gate} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <View style={styles.center}>
          <View style={styles.bizBox}>
            <Text style={styles.title}>임시 비밀번호 입력</Text>
            <Text style={styles.subtitle}>{partnerName || partnerCode}</Text>

            <View style={styles.spacer} />

            <RNFormField
              variant="dark"
              label="비밀번호 (4자리)"
              placeholder="****"
              keyboardType="number-pad"
              maxLength={4}
              secureTextEntry
              value={pw}
              onChangeText={setPw}
              error={error ?? undefined}
              required
              autoFocus
              testID="temp-pw-input"
            />

            <RNButton
              variant="dark"
              label="로그인"
              onPress={handleSubmit}
              disabled={pw.length !== 4 || loading}
              loading={loading}
              fullWidth
              testID="temp-pw-submit"
            />

            <View style={styles.helperRow}>
              <Text style={styles.helperText}>비밀번호 분실 시 관리자에게 문의해 주세요.</Text>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gate: { flex: 1, backgroundColor: colors.gateBg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  bizBox: {
    backgroundColor: colors.bizBoxBg,
    borderRadius: radii.xl + 4,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 420,
  },
  title: { fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, color: colors.bizText, textAlign: 'center' },
  subtitle: { marginTop: spacing.sm, fontSize: fontSize.sm, color: colors.neutral400, textAlign: 'center' },
  spacer: { height: spacing.xl },
  helperRow: { marginTop: spacing.base, alignItems: 'center' },
  helperText: { fontSize: fontSize.xs, color: colors.neutral400 },
});
