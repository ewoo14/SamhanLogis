/**
 * HomeScreen v2 — legacy `.mobile-gate` 4 카테고리 큰 진입 버튼 1:1.
 *
 * DECISIONS Phase 6 정정 #16 — partner-order index.html 모바일 viewport 분기 1:1 모방.
 *
 * legacy 출처: migration/source/scripts/partner-order/index.html
 *   - line 119  : `.mobile-gate { display:flex; flex-direction:column; gap:16px; margin:20px 0 12px }`
 *   - line 121  : `.select-big { width:100%; height:150px; border:1px solid var(--c-line); border-radius:18px; font-weight:800; font-size:36px }`
 *   - line 122  : `.select-home/single/comm/old { background/border-color }`
 *   - line 685~689 : `<div class="mobile-gate"><button class="select-big select-home">홈멀티</button>...</div>`
 *   - JS line 4467~4469 : `el('#btnEnterHome').addEventListener('click', ()=>enterMobile('home'))`
 *
 * 본 v2 는 4 카테고리 클릭 → OrderForm 진입 (해당 category 사전 선택).
 * legacy 의 enterMobile('home') 동작 (해당 cardHome 만 노출 + grid 1col) 을 RN navigation 으로 대체.
 *
 * UUID 미노출 — partnerName + partnerCode 만 노출.
 */

import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/authStore';
import { useDcConfigStore } from '@/stores/dcConfigStore';
import { legacyMobileGateStyles, legacyVars } from '@/styles/legacyMobile';
import { colors, fontSize, fontWeight, spacing } from '@/tokens/tokens';
import type { OrderStackParamList, RootTabParamList } from '@/navigation/types';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<RootTabParamList, 'HomeTab'>,
  NativeStackNavigationProp<OrderStackParamList>
>;

/** legacy 4 카테고리 button label (index.html line 686~689) */
const CATEGORIES: Array<{
  key: 'home' | 'single' | 'comm' | 'old';
  label: string;
  styleKey: 'selectHome' | 'selectSingle' | 'selectComm' | 'selectOld';
  textColor: string;
}> = [
  { key: 'home', label: '홈멀티', styleKey: 'selectHome', textColor: '#3730A3' },
  { key: 'single', label: '싱글 세트', styleKey: 'selectSingle', textColor: '#0E7490' },
  { key: 'comm', label: '상업멀티', styleKey: 'selectComm', textColor: '#9A3412' },
  { key: 'old', label: '구형', styleKey: 'selectOld', textColor: '#6B21A8' },
];

export function HomeScreen(): JSX.Element {
  const nav = useNavigation<Nav>();
  const partnerName = useAuthStore((s) => s.partnerName);
  const partnerCode = useAuthStore((s) => s.partnerCode);
  const dcConfig = useDcConfigStore((s) => s.config);
  const dcError = useDcConfigStore((s) => s.error);

  const handleEnter = (key: 'home' | 'single' | 'comm' | 'old'): void => {
    // legacy enterMobile(which) → 카테고리 사전 선택 후 OrderForm 진입.
    nav.navigate('OrderTab', { screen: 'OrderForm', params: { initialCategory: key } });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* legacy `.top .title` (line 1006) — 주문서 타이틀 */}
        <View style={styles.titleBar}>
          <Text style={styles.titleText}>주문서</Text>
          {partnerCode ? (
            <Text style={styles.partnerCode} testID="partner-code">
              {partnerName ?? '거래처'} ({partnerCode})
            </Text>
          ) : null}
        </View>

        {/* DC 적용 알림 (정정 #12) */}
        {dcConfig && (dcConfig.homeMultiDc || dcConfig.commercialMultiDc) ? (
          <View style={styles.dcNotice} testID="dc-notice">
            <Text style={styles.dcNoticeText}>
              거래처 DC 자동 적용 — 홈멀티 {((dcConfig.homeMultiDc ?? 0) * 100).toFixed(0)}% / 상업멀티{' '}
              {((dcConfig.commercialMultiDc ?? 0) * 100).toFixed(0)}%
            </Text>
          </View>
        ) : null}
        {dcError ? (
          <View style={styles.dcErrorBox}>
            <Text style={styles.dcErrorText}>{dcError}</Text>
          </View>
        ) : null}

        {/* legacy `.mobile-gate` 4 카테고리 큰 진입 버튼 (line 685~689) */}
        <View style={legacyMobileGateStyles.mobileGate} testID="mobile-gate">
          {CATEGORIES.map((cat) => (
            <Pressable
              key={cat.key}
              style={({ pressed }) => [
                legacyMobileGateStyles.selectBig,
                legacyMobileGateStyles[cat.styleKey],
                pressed && styles.pressed,
              ]}
              onPress={() => handleEnter(cat.key)}
              testID={`enter-${cat.key}`}
            >
              <Text style={[legacyMobileGateStyles.selectBigText, { color: cat.textColor }]}>{cat.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* 보조 진입 (주문 목록 / 알림 / 과거 발송내역) — legacy `.spec-history-group` (line 1019) */}
        <View style={styles.subActions}>
          <Pressable
            style={({ pressed }) => [styles.subButton, pressed && styles.pressed]}
            onPress={() => nav.navigate('OrderTab', { screen: 'OrderList' })}
            testID="enter-orders"
          >
            <Text style={styles.subButtonText}>주문 목록 보기</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.subButton, pressed && styles.pressed]}
            onPress={() => nav.navigate('NotificationsTab')}
            testID="enter-notifications"
          >
            <Text style={styles.subButtonText}>알림 확인</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: legacyVars.cBg },
  scroll: { paddingBottom: 30 },
  titleBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  titleText: {
    fontSize: 22,
    fontWeight: '800',
    color: legacyVars.cStrong,
  },
  partnerCode: {
    marginTop: 4,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  dcNotice: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  dcNoticeText: {
    fontSize: fontSize.sm,
    color: '#9A3412',
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
  dcErrorBox: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  dcErrorText: { fontSize: fontSize.sm, color: '#991B1B', textAlign: 'center' },
  pressed: { opacity: 0.85 },
  subActions: {
    paddingHorizontal: 16,
    gap: 10,
    marginTop: 4,
  },
  subButton: {
    height: 48,
    borderRadius: 8,
    backgroundColor: legacyVars.bizButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
