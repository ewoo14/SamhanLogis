/**
 * BizGateScreen — 사업자번호 입력 게이트.
 *
 * legacy 출처: migration/source/scripts/partner-order/index.html
 *   - `#pageBizGate` (566) — 어두운 배경 #020617
 *   - `.biz-box` 카드 (#0b1120, color #e5e7eb)
 *   - `.biz-buttons .btn` (#3b82f6)
 *
 * F1 (a) legacy 100% 보존 — 색감/spacing/radius RN 변환 (View/Text/Pressable).
 * UUID 미노출 — 사업자번호 (10자리) + 거래처명 만 노출.
 *
 * status 분기:
 *   - OK → BottomTab 진입
 *   - REQUIRES_PASSWORD → TempPassword screen
 *   - REQUIRES_REGISTRATION → Register screen
 *   - LOCKED → 잠금 메시지
 *   - UNKNOWN → 미등록 안내
 */

import { CommonActions, useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { checkBizGate } from '@/api/auth';
import { RNButton } from '@/components/RNButton';
import { RNFormField } from '@/components/RNFormField';
import { useAuthStore } from '@/stores/authStore';
import { colors, fontSize, fontWeight, radii, spacing } from '@/tokens/tokens';
import type { AuthStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'BizGate'>;

export function BizGateScreen({ navigation }: Props): JSX.Element {
  const [bizNo, setBizNo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const login = useAuthStore((s) => s.login);
  const rootNav = useNavigation();

  const isValid = bizNo.replace(/[^0-9]/g, '').length === 10;

  const handleSubmit = async (): Promise<void> => {
    if (!isValid) {
      setError('사업자번호 10자리를 입력해 주세요.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await checkBizGate(bizNo);
      switch (res.status) {
        case 'OK':
          if (res.token && res.partnerCode && res.partnerName) {
            await login(res.partnerCode, res.partnerName, res.token);
            rootNav.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Main' }] }));
          }
          break;
        case 'REQUIRES_PASSWORD':
          navigation.navigate('TempPassword', {
            partnerCode: res.partnerCode ?? bizNo,
            partnerName: res.partnerName ?? '',
          });
          break;
        case 'REQUIRES_REGISTRATION':
          navigation.navigate('Register', { partnerCode: bizNo });
          break;
        case 'LOCKED':
          Alert.alert('잠금', res.lockReason ?? '연속 3회 실패로 잠금되었습니다. 관리자에게 문의해 주세요.');
          break;
        case 'UNKNOWN':
        default:
          setError('등록되지 않은 사업자번호 입니다.');
      }
    } catch (e) {
      setError('서버 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.gate} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View style={styles.center}>
          <View style={styles.bizBox}>
            <Text style={styles.title}>SamhanLogis 주문</Text>
            <Text style={styles.subtitle}>사업자등록번호로 시작합니다</Text>

            <View style={styles.spacer} />

            <RNFormField
              variant="dark"
              label="사업자등록번호"
              placeholder="0000000000"
              keyboardType="number-pad"
              maxLength={12}
              value={bizNo}
              onChangeText={setBizNo}
              error={error ?? undefined}
              required
              autoFocus
              testID="biz-no-input"
            />

            <RNButton
              variant="dark"
              label={loading ? '확인 중...' : '확인'}
              onPress={handleSubmit}
              disabled={!isValid || loading}
              loading={loading}
              fullWidth
              testID="biz-submit"
            />

            <View style={styles.helperRow}>
              <Text style={styles.helperText}>최초 사용시 가입 후 승인이 필요합니다.</Text>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gate: {
    flex: 1,
    backgroundColor: colors.gateBg, // legacy #020617
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  bizBox: {
    backgroundColor: colors.bizBoxBg, // legacy #0b1120
    borderRadius: radii.xl + 4, // legacy 16px
    padding: spacing.xl,
    width: '100%',
    maxWidth: 420,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    color: colors.bizText,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.neutral400,
    textAlign: 'center',
  },
  spacer: { height: spacing.xl },
  helperRow: {
    marginTop: spacing.base,
    alignItems: 'center',
  },
  helperText: {
    fontSize: fontSize.xs,
    color: colors.neutral400,
  },
});
