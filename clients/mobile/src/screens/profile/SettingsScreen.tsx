/**
 * SettingsScreen — 환경설정 + 로그아웃.
 *
 * legacy 출처: partner-order index.html SettingsDrawer (drawer — RN 에선 stack screen).
 */

import { CommonActions, useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { RNButton } from '@/components/RNButton';
import { RNCard } from '@/components/RNCard';
import { ScreenContainer } from '@/components/ScreenContainer';
import { useAuthStore } from '@/stores/authStore';
import { useDcConfigStore } from '@/stores/dcConfigStore';
import { colors, fontSize, fontWeight, spacing } from '@/tokens/tokens';

export function SettingsScreen(): JSX.Element {
  const logout = useAuthStore((s) => s.logout);
  const clearDc = useDcConfigStore((s) => s.clear);
  const nav = useNavigation();
  const [pushEnabled, setPushEnabled] = useState(false); // F4 (b) 후속

  const handleLogout = (): void => {
    Alert.alert('로그아웃', '로그아웃 하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
        style: 'destructive',
        onPress: async () => {
          await logout();
          clearDc(); // 정정 #12 — DC 설정도 함께 초기화
          nav.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Auth' }] }));
        },
      },
    ]);
  };

  return (
    <ScreenContainer>
      <RNCard>
        <Text style={styles.sectionTitle}>알림 설정</Text>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>푸시 알림</Text>
            <Text style={styles.rowHint}>주문 상태 변경 알림 (후속 단계 적용)</Text>
          </View>
          <Switch
            value={pushEnabled}
            onValueChange={setPushEnabled}
            disabled
            trackColor={{ true: colors.brand400, false: colors.border }}
          />
        </View>
      </RNCard>

      <RNCard>
        <Text style={styles.sectionTitle}>앱 정보</Text>
        <KV label="버전" value="0.1.0" />
        <KV label="빌드" value="Expo SDK 53" />
        <KV label="API 환경" value={__DEV__ ? '개발 (localhost:8080)' : 'api.samhan-air.com'} />
      </RNCard>

      <RNCard>
        <Text style={styles.sectionTitle}>계정</Text>
        <RNButton variant="danger" label="로그아웃" onPress={handleLogout} fullWidth />
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
  sectionTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm },
  rowText: { flex: 1, marginRight: spacing.base },
  rowLabel: { fontSize: fontSize.base, color: colors.text, fontWeight: fontWeight.medium },
  rowHint: { marginTop: spacing.xs, fontSize: fontSize.xs, color: colors.textSubtle },
  kvRow: { flexDirection: 'row', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  kvLabel: { width: 96, fontSize: fontSize.sm, color: colors.textMuted },
  kvValue: { flex: 1, fontSize: fontSize.sm, color: colors.text },
});
