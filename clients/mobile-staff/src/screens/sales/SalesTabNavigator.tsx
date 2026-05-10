/**
 * SalesTabNavigator — P1-4 영업 native 앱 탭 내비게이터.
 *
 * 사용자 결정 (P1-4) — mobile-staff 내부 'sales' mode 채택 (별도 mobile-sales 신규 X).
 * AppRootNavigator 에서 mode === 'sales' 로 분기 시 진입.
 *
 * 탭 구성:
 *   - 대시보드 (SalesHomeScreen)
 *   - 견적 작성 (QuotationCreateScreen)
 *   - 주문 등록 (PartnerOrderCreateScreen)
 *   - 거래처 검색 (CustomerSearchScreen — standalone)
 *
 * react-navigation 미설치 환경에서도 동작하도록 자체 minimal tab 구현
 * (driver tab navigator 패턴 동등 적용).
 *
 * @PreAuthorize SALES / MANAGER / MASTER — API 레이어에서 공통 검증.
 * RoleGuard: AppRootNavigator 에서 ROLE_SALES 확인 후 mode='sales' 진입하므로
 * 본 navigator 에서 별도 role 검증 불필요.
 */

import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import CustomerSearchScreen from './CustomerSearchScreen';
import PartnerOrderCreateScreen from './PartnerOrderCreateScreen';
import QuotationCreateScreen from './QuotationCreateScreen';
import SalesHomeScreen from './SalesHomeScreen';

type Tab = 'home' | 'quotation' | 'order' | 'customer';

interface Props {
  /** JWT access token — sales API 호출 시 사용. */
  token: string | null;
}

export default function SalesTabNavigator({ token }: Props): JSX.Element {
  const [tab, setTab] = useState<Tab>('home');

  // 견적/주문 화면은 멀티스텝(거래처 선택 → 라인 → 완료)이므로
  // 완료/뒤로가기 시 home 탭으로 복귀 처리.
  const handleBack = () => setTab('home');

  return (
    <View style={styles.container}>
      <View style={styles.screen}>
        {tab === 'home' && (
          <SalesHomeScreen
            token={token}
            onNavigate={(dest) => setTab(dest)}
          />
        )}
        {tab === 'quotation' && (
          <QuotationCreateScreen token={token} onBack={handleBack} />
        )}
        {tab === 'order' && (
          <PartnerOrderCreateScreen token={token} onBack={handleBack} />
        )}
        {tab === 'customer' && (
          <CustomerSearchScreen token={token} standalone />
        )}
      </View>

      {/* 하단 탭 바 (견적/주문 화면 = 멀티스텝 중에도 탭 이동 허용) */}
      <View style={styles.tabBar}>
        <TabButton
          label="대시보드"
          active={tab === 'home'}
          onPress={() => setTab('home')}
          testID="sales-tab-home"
        />
        <TabButton
          label="견적"
          active={tab === 'quotation'}
          onPress={() => setTab('quotation')}
          testID="sales-tab-quotation"
        />
        <TabButton
          label="주문"
          active={tab === 'order'}
          onPress={() => setTab('order')}
          testID="sales-tab-order"
        />
        <TabButton
          label="거래처"
          active={tab === 'customer'}
          onPress={() => setTab('customer')}
          testID="sales-tab-customer"
        />
      </View>
    </View>
  );
}

// -----------------------------------------------------------------------
// 서브 컴포넌트
// -----------------------------------------------------------------------

interface TabButtonProps {
  label: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
}

function TabButton({ label, active, onPress, testID }: TabButtonProps): JSX.Element {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.tabBtn, active && styles.tabBtnActive]}
      testID={testID}
    >
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

// -----------------------------------------------------------------------
// 스타일
// -----------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.app },
  screen: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface.card,
    borderTopWidth: 1,
    borderTopColor: colors.line.default,
    paddingVertical: spacing[2],
  },
  tabBtn: {
    flex: 1,
    paddingVertical: spacing[3],
    alignItems: 'center',
    marginHorizontal: spacing[1],
    borderRadius: radii.button,
  },
  tabBtnActive: {
    backgroundColor: colors.action.brandSubtle,
  },
  tabLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.ink.secondary,
    fontWeight: typography.fontWeight.medium,
    fontFamily: typography.fontFamily.sans,
  },
  tabLabelActive: {
    color: colors.action.brandActive,
    fontWeight: typography.fontWeight.semibold,
  },
});
