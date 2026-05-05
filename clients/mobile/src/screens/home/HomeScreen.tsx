/**
 * HomeScreen — 홈 (Bottom Tab 진입 첫 화면).
 *
 * 거래처명 환영 + 빠른 액션 (새 주문, 주문 목록, 알림).
 *
 * legacy 출처: partner-order Code.js #mobileGate welcomeAnimation "OOO 님 환영합니다."
 */

import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StyleSheet, Text, View } from 'react-native';
import { RNButton } from '@/components/RNButton';
import { RNCard } from '@/components/RNCard';
import { ScreenContainer } from '@/components/ScreenContainer';
import { useAuthStore } from '@/stores/authStore';
import { colors, fontSize, fontWeight, spacing } from '@/tokens/tokens';
import type { OrderStackParamList, RootTabParamList } from '@/navigation/types';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<RootTabParamList, 'HomeTab'>,
  NativeStackNavigationProp<OrderStackParamList>
>;

export function HomeScreen(): JSX.Element {
  const nav = useNavigation<Nav>();
  const partnerName = useAuthStore((s) => s.partnerName);
  const partnerCode = useAuthStore((s) => s.partnerCode);

  return (
    <ScreenContainer>
      <RNCard elevation="md">
        <Text style={styles.welcomeLabel}>환영합니다</Text>
        <Text style={styles.partnerName}>{partnerName ?? '거래처'} 님</Text>
        {partnerCode ? <Text style={styles.partnerCode}>사업자번호 {partnerCode}</Text> : null}
      </RNCard>

      <RNCard>
        <Text style={styles.sectionTitle}>빠른 액션</Text>
        <View style={styles.actionGroup}>
          <RNButton
            variant="primary"
            label="새 주문 작성"
            onPress={() => nav.navigate('OrderTab', { screen: 'OrderForm' })}
            fullWidth
            testID="quick-new-order"
          />
          <RNButton
            variant="secondary"
            label="주문 목록 보기"
            onPress={() => nav.navigate('OrderTab', { screen: 'OrderList' })}
            fullWidth
          />
          <RNButton
            variant="ghost"
            label="알림 확인"
            onPress={() => nav.navigate('NotificationsTab')}
            fullWidth
          />
        </View>
      </RNCard>

      <RNCard>
        <Text style={styles.sectionTitle}>안내</Text>
        <View style={styles.infoList}>
          <Text style={styles.infoText}>· 주문은 평일 오후 3시 이전 접수 시 당일 출고됩니다.</Text>
          <Text style={styles.infoText}>· 임시저장한 주문은 30일간 보관됩니다.</Text>
          <Text style={styles.infoText}>· 비밀번호 분실 시 관리자에게 문의해 주세요.</Text>
        </View>
      </RNCard>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  welcomeLabel: { fontSize: fontSize.sm, color: colors.textMuted },
  partnerName: { fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, color: colors.text, marginTop: spacing.xs },
  partnerCode: { fontSize: fontSize.sm, color: colors.textSubtle, marginTop: spacing.xs },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.sm },
  actionGroup: { gap: spacing.sm },
  infoList: { gap: spacing.xs },
  infoText: { fontSize: fontSize.sm, color: colors.textMuted, lineHeight: fontSize.sm * 1.5 },
});
