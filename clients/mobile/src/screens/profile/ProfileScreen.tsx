/**
 * ProfileScreen — 내 정보 (거래처).
 *
 * UUID 미노출 — 사업자번호 (partnerCode) + 거래처명 + 연락처 만 노출.
 */

import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StyleSheet, Text, View } from 'react-native';
import { RNButton } from '@/components/RNButton';
import { RNCard } from '@/components/RNCard';
import { ScreenContainer } from '@/components/ScreenContainer';
import { useAuthStore } from '@/stores/authStore';
import { colors, fontSize, fontWeight, spacing } from '@/tokens/tokens';
import type { ProfileStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<ProfileStackParamList, 'Profile'>;

export function ProfileScreen(): JSX.Element {
  const nav = useNavigation<Nav>();
  const partnerName = useAuthStore((s) => s.partnerName);
  const partnerCode = useAuthStore((s) => s.partnerCode);

  return (
    <ScreenContainer>
      <RNCard elevation="md">
        <Text style={styles.partnerName}>{partnerName ?? '거래처'}</Text>
        <Text style={styles.partnerCode}>사업자번호 {partnerCode ?? '-'}</Text>
      </RNCard>

      <RNCard>
        <Text style={styles.sectionTitle}>거래처 정보</Text>
        <KV label="거래처명" value={partnerName ?? '-'} />
        <KV label="사업자번호" value={partnerCode ?? '-'} />
        <KV label="권한" value="거래처 (PARTNER)" />
      </RNCard>

      <RNCard>
        <Text style={styles.sectionTitle}>설정</Text>
        <View style={styles.actionGroup}>
          <RNButton variant="secondary" label="환경설정" onPress={() => nav.navigate('Settings')} fullWidth />
        </View>
      </RNCard>
    </ScreenContainer>
  );
}

function KV({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <View style={styles.kvRow}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={styles.kvValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  partnerName: { fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, color: colors.text },
  partnerCode: { marginTop: spacing.xs, fontSize: fontSize.sm, color: colors.textMuted },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.sm },
  kvRow: { flexDirection: 'row', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  kvLabel: { width: 96, fontSize: fontSize.sm, color: colors.textMuted },
  kvValue: { flex: 1, fontSize: fontSize.sm, color: colors.text },
  actionGroup: { gap: spacing.sm },
});
