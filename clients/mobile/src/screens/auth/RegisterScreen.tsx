/**
 * RegisterScreen — 신규 거래처 가입 요청.
 *
 * legacy 출처: partner-order #pageBizGate REQUIRES_REGISTRATION → 가입 폼.
 * 백엔드: partner-service M2 → 관리자 승인 후 임시 PW 발급.
 */

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { requestRegistration } from '@/api/auth';
import { RNButton } from '@/components/RNButton';
import { RNFormField } from '@/components/RNFormField';
import { colors, fontSize, fontWeight, radii, spacing } from '@/tokens/tokens';
import type { AuthStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

export function RegisterScreen({ route, navigation }: Props): JSX.Element {
  const initialBiz = route.params?.partnerCode ?? '';
  const [bizNo, setBizNo] = useState(initialBiz);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const isValid =
    bizNo.replace(/[^0-9]/g, '').length === 10 &&
    contactName.trim().length > 0 &&
    contactPhone.replace(/[^0-9]/g, '').length >= 10;

  const handleSubmit = async (): Promise<void> => {
    setLoading(true);
    try {
      await requestRegistration(bizNo, contactName, contactPhone);
      Alert.alert('가입 요청 접수', '관리자 승인 후 임시 비밀번호가 발급됩니다. SMS 로 안내 드립니다.', [
        { text: '확인', onPress: () => navigation.popToTop() },
      ]);
    } catch (e) {
      Alert.alert('오류', '가입 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.gate} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <View style={styles.center}>
          <View style={styles.bizBox}>
            <Text style={styles.title}>신규 가입 요청</Text>
            <Text style={styles.subtitle}>관리자 승인 후 사용 가능합니다</Text>

            <View style={styles.spacer} />

            <RNFormField
              variant="dark"
              label="사업자등록번호"
              placeholder="0000000000"
              keyboardType="number-pad"
              maxLength={12}
              value={bizNo}
              onChangeText={setBizNo}
              required
            />
            <RNFormField
              variant="dark"
              label="담당자 이름"
              placeholder="홍길동"
              value={contactName}
              onChangeText={setContactName}
              required
            />
            <RNFormField
              variant="dark"
              label="연락처"
              placeholder="010-0000-0000"
              keyboardType="phone-pad"
              maxLength={13}
              value={contactPhone}
              onChangeText={setContactPhone}
              required
            />

            <RNButton
              variant="dark"
              label="가입 요청"
              onPress={handleSubmit}
              disabled={!isValid || loading}
              loading={loading}
              fullWidth
            />

            <View style={styles.helperRow}>
              <RNButton variant="ghost" label="뒤로" onPress={() => navigation.goBack()} />
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
  helperRow: { marginTop: spacing.sm, alignItems: 'center' },
});
