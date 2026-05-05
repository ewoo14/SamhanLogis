/**
 * HomeScreen v3 — legacy partner-order 모바일 분기 9 메뉴 (정정 #17).
 *
 * DECISIONS Phase 6 정정 #17 — legacy partner-order index.html 모바일 분기의 모든 메뉴 노출.
 *
 * legacy 출처 (`migration/source/scripts/partner-order/index.html`):
 *   - line 119  : `.mobile-gate { display:flex; flex-direction:column; gap:16px; margin:20px 0 12px }`
 *   - line 121  : `.select-big { width:100%; height:150px; border:1px solid; border-radius:18px; font-weight:800; font-size:36px }`
 *   - line 685~689 : `<div class="mobile-gate"><button class="select-big select-home">홈멀티</button>...</div>`
 *   - JS line 4467~4469 : `el('#btnEnterHome').addEventListener('click', ()=>enterMobile('home'))`
 *
 *   - line 666 : `<button class="btn-mini" id="btnGoOld">구형 보기</button>` — old-active body class
 *   - line 668 : `<button id="btnOpenBranch" class="btn" disabled>임의 분기계산</button>` — pageBranch 진입
 *   - line 671 : `<button id="btnHistory" class="btn">과거 발송내역 확인</button>` — pageHistory 진입
 *   - line 1086 : `<button class="btn" id="btnSendOrder" disabled>전송목록 확인</button>` — 견적/주문 모달 진입
 *
 * v3 추가 (v2 base 4 카테고리 보존 + 추가 5 메뉴 = 9 메뉴):
 *   1. 4 카테고리 큰 진입 버튼 (홈멀티 / 싱글 세트 / 상업멀티 / 구형) — legacy `.mobile-gate` 1:1
 *   2. 임의 분기계산 (`btnOpenBranch` mobile) — placeholder, M3 통합 예정
 *   3. 견적/주문하기 (`btnSendOrder` mobile) — OrderForm 직진입 (카테고리 미지정)
 *   4. 과거 발송내역 확인 (`btnHistory` mobile) — OrderListScreen + filter=ALL
 *   5. 주문저장 (`btnSaveDraft` mobile) — orderDraftStore.saveCurrentDraft() 호출
 *   6. 저장내역 (`btnDraftList` mobile) — DraftListScreen 진입
 *
 * UUID 미노출 — partnerName + partnerCode 만 노출.
 */

import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/authStore';
import { useDcConfigStore } from '@/stores/dcConfigStore';
import { useOrderDraftStore } from '@/stores/orderDraftStore';
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
  const draftLines = useOrderDraftStore((s) => s.lines);
  const draftSnapshot = useOrderDraftStore((s) => s.snapshot);

  const handleEnter = (key: 'home' | 'single' | 'comm' | 'old'): void => {
    // legacy enterMobile(which) → 카테고리 사전 선택 후 OrderForm 진입.
    nav.navigate('OrderTab', { screen: 'OrderForm', params: { initialCategory: key } });
  };

  /** legacy `#btnOpenBranch` mobile (line 668) — 임의 분기계산 placeholder */
  const handleBranchCalc = (): void => {
    nav.navigate('OrderTab', { screen: 'BranchCalc' });
  };

  /** legacy `#btnSendOrder` mobile (line 1086) — 견적/주문 모달 → OrderForm */
  const handleSendOrder = (): void => {
    nav.navigate('OrderTab', { screen: 'OrderForm', params: undefined });
  };

  /** legacy `#btnHistory` mobile (line 671) — pageHistory → OrderList */
  const handleHistory = (): void => {
    nav.navigate('OrderTab', { screen: 'OrderList' });
  };

  /** legacy `#btnSaveDraft` mobile — orderDraftStore.snapshot 으로 임시 저장 */
  const handleSaveDraft = (): void => {
    if (draftLines.length === 0) {
      Alert.alert('저장 불가', '먼저 주문 라인을 1건 이상 추가해 주세요.');
      return;
    }
    draftSnapshot();
    Alert.alert('주문 저장', `현재 작성중인 주문 ${draftLines.length}건이 저장내역에 보관되었습니다.`);
  };

  /** legacy `#btnDraftList` mobile — 저장내역 (PartnerOrderDraft 목록) */
  const handleDraftList = (): void => {
    nav.navigate('OrderTab', { screen: 'DraftList' });
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

        {/* 정정 #17 — legacy partner-order 모바일 분기 추가 5 메뉴 */}
        <View style={styles.extraMenuSection}>
          <Text style={styles.extraMenuHeader}>추가 메뉴</Text>

          <Pressable
            style={({ pressed }) => [styles.menuButton, styles.menuBranch, pressed && styles.pressed]}
            onPress={handleBranchCalc}
            testID="menu-branch-calc"
          >
            <Text style={styles.menuButtonLabel}>임의 분기계산</Text>
            <Text style={styles.menuButtonHint}>상업멀티 분기 자동 산출</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.menuButton, styles.menuSendOrder, pressed && styles.pressed]}
            onPress={handleSendOrder}
            testID="menu-send-order"
          >
            <Text style={styles.menuButtonLabel}>견적·주문하기</Text>
            <Text style={styles.menuButtonHint}>새 주문 작성으로 이동</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.menuButton, styles.menuHistory, pressed && styles.pressed]}
            onPress={handleHistory}
            testID="menu-history"
          >
            <Text style={styles.menuButtonLabel}>과거 발송내역 확인</Text>
            <Text style={styles.menuButtonHint}>지난 주문 조회</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.menuButton, styles.menuSaveDraft, pressed && styles.pressed]}
            onPress={handleSaveDraft}
            testID="menu-save-draft"
          >
            <Text style={styles.menuButtonLabel}>주문저장</Text>
            <Text style={styles.menuButtonHint}>
              {draftLines.length > 0
                ? `현재 작성중인 주문 ${draftLines.length}건 저장`
                : '작성중인 주문 없음'}
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.menuButton, styles.menuDraftList, pressed && styles.pressed]}
            onPress={handleDraftList}
            testID="menu-draft-list"
          >
            <Text style={styles.menuButtonLabel}>저장내역</Text>
            <Text style={styles.menuButtonHint}>임시저장된 주문 목록</Text>
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
