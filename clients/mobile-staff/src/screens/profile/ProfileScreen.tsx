/**
 * ProfileScreen v1 — 영업직원 프로필 + 로그아웃.
 *
 * Mobile v4 의 ProfileScreen (거래처 — partnerCode + DC율) 와 분리.
 * mobile-staff = employeeCode + employeeName + 권한 + 로그아웃.
 *
 * UUID 미노출 — 사번 (employeeCode) + 이름 만 노출, employeeId UUID 는 내부.
 */

import { CommonActions, useNavigation } from '@react-navigation/native';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/authStore';
import { colors, fontSize, fontWeight, radii, spacing } from '@/tokens/tokens';

export function ProfileScreen(): JSX.Element {
  const employeeName = useAuthStore((s) => s.employeeName);
  const employeeCode = useAuthStore((s) => s.employeeCode);
  const logout = useAuthStore((s) => s.logout);
  const rootNav = useNavigation();

  const handleLogout = (): void => {
    Alert.alert(
      '로그아웃',
      '정말 로그아웃 하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '로그아웃',
          style: 'destructive',
          onPress: async () => {
            await logout();
            rootNav.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Auth' }] }));
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* 헤더 */}
        <View style={styles.titleBar}>
          <Text style={styles.titleText}>내 정보</Text>
        </View>

        {/* 영업직원 정보 카드 */}
        <View style={styles.card}>
          <Text style={styles.staffName}>{employeeName ?? '영업직원'}</Text>
          <Text style={styles.staffCode}>사번 {employeeCode ?? '-'}</Text>
        </View>

        {/* 영업직원 정보 상세 */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>영업직원 정보</Text>
          <KV label="이름" value={employeeName ?? '-'} />
          <KV label="사번" value={employeeCode ?? '-'} />
          <KV label="권한" value="영업직원 (STAFF)" />
        </View>

        {/* 앱 정보 */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>앱 정보</Text>
          <KV label="앱 이름" value="삼한공조 견적" />
          <KV label="앱 버전" value="0.1.0 (mobile-staff v1)" />
          <KV label="대상" value="(주)삼한공조시스템 영업직원 전용" />
        </View>

        {/* 로그아웃 */}
        <View style={styles.card}>
          <Pressable
            style={({ pressed }) => [styles.logoutBtn, pressed && styles.pressed]}
            onPress={handleLogout}
            testID="staff-logout"
          >
            <Text style={styles.logoutBtnLabel}>로그아웃</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
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
  safe: { flex: 1, backgroundColor: colors.bgSubtle },
  scroll: {
    paddingBottom: spacing['2xl'],
    gap: spacing.base,
  },

  titleBar: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.neutral0,
    marginBottom: spacing.base,
  },
  titleText: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    color: colors.text,
  },

  card: {
    marginHorizontal: spacing.base,
    padding: spacing.base,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.neutral0,
  },

  staffName: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  staffCode: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },

  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  kvRow: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  kvLabel: { width: 96, fontSize: fontSize.sm, color: colors.textMuted },
  kvValue: { flex: 1, fontSize: fontSize.sm, color: colors.text },

  logoutBtn: {
    minHeight: 48,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger,
  },
  logoutBtnLabel: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.neutral0,
  },
  pressed: { opacity: 0.85 },
});
