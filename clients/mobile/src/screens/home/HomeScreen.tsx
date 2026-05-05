/**
 * HomeScreen v4 — legacy 4 카테고리 진입 + 추가 메뉴 (모두 LegacyOrder WebView 로 진입).
 *
 * DECISIONS Phase 6 v4 — legacy index.html 임베드.
 *
 * v3 → v4 변경:
 *   - 4 카테고리 버튼 클릭 → `OrderTab/LegacyOrder` 진입 + `initialCategory` 전달.
 *   - 추가 메뉴 (분기계산 / 견적·주문 / 과거 발송내역 / 주문저장 / 저장내역) — 모두 LegacyOrder 진입 통일.
 *     (legacy index.html 의 `enterMobile`/`btnSendOrder`/`btnHistory`/`btnSaveDraft`/`btnDraftList` 가
 *      WebView 안에서 처리)
 *   - draftStore 직접 호출 폐기 — legacy 가 localStorage 또는 partner-order-service API 로 임시저장 처리.
 *
 * legacy 출처 (`migration/source/scripts/partner-order/index.html`):
 *   - line 119  : `.mobile-gate { display:flex; flex-direction:column; gap:16px; margin:20px 0 12px }`
 *   - line 121  : `.select-big { width:100%; height:150px; ... }`
 *   - line 685~689 : `<div class="mobile-gate"><button class="select-big select-home">홈멀티</button>...</div>`
 *   - JS line 4467~4469 : `el('#btnEnterHome').addEventListener('click', ()=>enterMobile('home'))`
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
import { colors, fontSize, fontWeight } from '@/tokens/tokens';
import type { LegacyCategory, OrderStackParamList, RootTabParamList } from '@/navigation/types';

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
  { key: 'home', label: '홈멀티', styleKey: 'selectHome', textColor: '#111827' },
  { key: 'single', label: '싱글 세트', styleKey: 'selectSingle', textColor: '#111827' },
  { key: 'comm', label: '상업멀티', styleKey: 'selectComm', textColor: '#111827' },
  { key: 'old', label: '구형', styleKey: 'selectOld', textColor: '#111827' },
];

export function HomeScreen(): JSX.Element {
  const nav = useNavigation<Nav>();
  const partnerName = useAuthStore((s) => s.partnerName);
  const partnerCode = useAuthStore((s) => s.partnerCode);
  const dcConfig = useDcConfigStore((s) => s.config);
  const dcError = useDcConfigStore((s) => s.error);

  /** legacy `enterMobile(which)` → WebView 안에서 카테고리 사전 진입. */
  const handleEnter = (key: LegacyCategory): void => {
    nav.navigate('OrderTab', { screen: 'LegacyOrder', params: { initialCategory: key } });
  };

  /** v4: 추가 메뉴 5개 모두 단일 LegacyOrder 진입 — WebView 안 legacy 가 분기 처리. */
  const handleOpenLegacy = (): void => {
    nav.navigate('OrderTab', { screen: 'LegacyOrder', params: undefined });
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

        {/* [정정 PR #60 회고] DC 안내 표시 삭제 — 거래처 입장에서 부적절 (사용자 명시).
            DC 자동 적용 자체는 backend (calcDcPrice) 에서 그대로 동작. 거래처는 최종가만 표시. */}
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

        {/* 정정 #17 — legacy partner-order 모바일 분기 추가 5 메뉴 */}
        <View style={styles.extraMenuSection}>
          <Text style={styles.extraMenuHeader}>추가 메뉴</Text>

          <Pressable
            style={({ pressed }) => [styles.menuButton, styles.menuBranch, pressed && styles.pressed]}
            onPress={handleOpenLegacy}
            testID="menu-branch-calc"
          >
            <Text style={styles.menuButtonLabel}>임의 분기계산</Text>
            <Text style={styles.menuButtonHint}>WebView 진입 후 legacy `pageBranch` 자동</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.menuButton, styles.menuSendOrder, pressed && styles.pressed]}
            onPress={handleOpenLegacy}
            testID="menu-send-order"
          >
            <Text style={styles.menuButtonLabel}>견적·주문하기</Text>
            <Text style={styles.menuButtonHint}>WebView 안 legacy 견적/주문 모달</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.menuButton, styles.menuHistory, pressed && styles.pressed]}
            onPress={handleOpenLegacy}
            testID="menu-history"
          >
            <Text style={styles.menuButtonLabel}>과거 발송내역 확인</Text>
            <Text style={styles.menuButtonHint}>WebView 안 legacy `pageHistory`</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.menuButton, styles.menuSaveDraft, pressed && styles.pressed]}
            onPress={handleOpenLegacy}
            testID="menu-save-draft"
          >
            <Text style={styles.menuButtonLabel}>주문저장</Text>
            <Text style={styles.menuButtonHint}>WebView 안 legacy `btnSaveDraft`</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.menuButton, styles.menuDraftList, pressed && styles.pressed]}
            onPress={handleOpenLegacy}
            testID="menu-draft-list"
          >
            <Text style={styles.menuButtonLabel}>저장내역</Text>
            <Text style={styles.menuButtonHint}>WebView 안 legacy `btnDraftList`</Text>
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

  extraMenuSection: {
    paddingHorizontal: 16,
    paddingTop: 4,
    gap: 10,
  },
  extraMenuHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: legacyVars.cMuted,
    paddingTop: 8,
    paddingBottom: 4,
  },
  menuButton: {
    minHeight: 64,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 2,
  },
  menuButtonLabel: {
    fontSize: 18,
    fontWeight: '800',
    color: legacyVars.cStrong,
  },
  menuButtonHint: {
    fontSize: 12,
    color: legacyVars.cMuted,
  },
  // legacy `#btnOpenBranch` (line 668) — 분기계산 (보라 배경)
  menuBranch: {
    backgroundColor: '#F5F3FF',
    borderColor: '#C4B5FD',
  },
  // legacy `#btnSendOrder` (line 1086) — 견적/주문 (강조 brand)
  menuSendOrder: {
    backgroundColor: '#ECFEFF',
    borderColor: '#67E8F9',
  },
  // legacy `#btnHistory` (line 671) — 과거 발송내역
  menuHistory: {
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC',
  },
  // legacy `#btnSaveDraft` (mobile) — 주문저장
  menuSaveDraft: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FCD34D',
  },
  // legacy `#btnDraftList` (mobile) — 저장내역
  menuDraftList: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FDBA74',
  },
});
