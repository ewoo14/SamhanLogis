/**
 * BranchCalcScreen v3 — 임의 분기계산 placeholder (정정 #17).
 *
 * legacy 출처 (`migration/source/scripts/partner-order/index.html`):
 *   - line 668 : `<button id="btnOpenBranch" class="btn" disabled>임의 분기계산</button>`
 *   - line 923 : `<section id="pageBranch" class="branch">` — 분기계산 전용 page
 *   - line 132 : `body.branch-active #pageBranch{ display:block !important }` — 모드 토글
 *   - line 6378 : `el('#btnOpenBranch')?.addEventListener('click', ...)` — page 진입
 *   - line 6609~6721 : pageBranch 동적 build (분기 계산 로직 — 상업멀티 라인업 산출)
 *
 * v3 단계 (Phase 6 frontend) 에서는 placeholder 만 노출.
 * 본격 구현은 Phase M3 (legacy 분기 알고리즘 + product/spec 시드 통합) 에서 진행.
 */

import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { legacyVars } from '@/styles/legacyMobile';
import type { OrderStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<OrderStackParamList, 'BranchCalc'>;

export function BranchCalcScreen(): JSX.Element {
  const nav = useNavigation<Nav>();

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.titleBar}>
          <Text style={styles.titleText}>임의 분기계산</Text>
        </View>

        <View style={styles.placeholderCard} testID="branch-placeholder">
          <Text style={styles.placeholderHeader}>준비 중</Text>
          <Text style={styles.placeholderBody}>
            상업멀티 라인업 자동 산출 기능은 다음 마이그레이션 단계 (M3 — 분기 알고리즘 통합) 에서 제공됩니다.
            {'\n\n'}
            현재는 legacy partner-order index.html line 923~ pageBranch 의 시각 1:1 변환 placeholder 입니다.
          </Text>
        </View>

        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          onPress={() => nav.goBack()}
          testID="branch-back"
        >
          <Text style={styles.backBtnText}>뒤로 가기</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: legacyVars.cBg },
  scroll: { padding: 12, gap: 12, paddingBottom: 60 },
  titleBar: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  titleText: {
    fontSize: 22,
    fontWeight: '800',
    color: legacyVars.cStrong,
  },
  placeholderCard: {
    borderWidth: 1,
    borderColor: '#C4B5FD',
    backgroundColor: '#F5F3FF',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  placeholderHeader: {
    fontSize: 18,
    fontWeight: '800',
    color: '#5B21B6',
  },
  placeholderBody: {
    fontSize: 13,
    color: '#4C1D95',
    lineHeight: 18,
  },
  backBtn: {
    height: 48,
    borderRadius: 12,
    backgroundColor: legacyVars.bizButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  pressed: { opacity: 0.85 },
});
