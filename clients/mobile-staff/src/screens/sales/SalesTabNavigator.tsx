/**
 * SalesTabNavigator — P1-4 영업 native 앱 탭 내비게이터.
 *
 * 사용자 결정 (P1-4) — mobile-staff 내부 영업 native 탭 후보 (별도 mobile-sales 신규 X).
 * D-AX-19 현재 root 는 estimate WebView 단일 진입이며, 본 navigator 는 후속 native 영업 모드 후보로 보존.
 *
 * 탭 구성:
 *   - 대시보드 (SalesHomeScreen)
 *   - 견적 작성 (QuotationCreateScreen)
 *   - 주문 등록 (PartnerOrderCreateScreen)
 *   - 거래처 검색 (CustomerSearchScreen — standalone)
 *   - [P1] 방문 사진 (VisitPhotoScreen — 거래처 선택 후 사진 첨부)
 *
 * react-navigation 미설치 환경에서도 동작하도록 자체 minimal tab 구현
 * (react-navigation 미도입 minimal tab 패턴).
 *
 * @PreAuthorize SALES / MANAGER / MASTER — API 레이어에서 공통 검증.
 * RoleGuard: 후속 root 연결 시 ROLE_SALES 확인 후 진입한다.
 */

import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import CustomerSearchScreen from './CustomerSearchScreen';
import PartnerOrderCreateScreen from './PartnerOrderCreateScreen';
import QuotationCreateScreen from './QuotationCreateScreen';
import SalesHomeScreen from './SalesHomeScreen';
import VisitPhotoScreen from './VisitPhotoScreen';

type Tab = 'home' | 'quotation' | 'order' | 'customer' | 'visit-photo';

interface Props {
  /** JWT access token — sales API 호출 시 사용. */
  token: string | null;
}

/**
 * 방문 사진 탭 진입 시 사용할 거래처 context.
 * CustomerSearchScreen 에서 거래처 선택 후 방문 사진으로 이동하는 흐름에서 사용.
 * 진입 시점(P1)은 stub 거래처 — 정식은 CustomerSearchScreen 의 onSelect callback 연결.
 */
interface VisitPhotoContext {
  partnerId: string | null;
  partnerCode: string;
  partnerName: string;
}

const VISIT_PHOTO_STUB: VisitPhotoContext = {
  partnerId: null, // 현재 stub — 거래처 선택 후 채워짐
  partnerCode: '—',
  partnerName: '거래처를 먼저 검색해주세요',
};

export default function SalesTabNavigator({ token }: Props): JSX.Element {
  const [tab, setTab] = useState<Tab>('home');
  const [visitCtx, setVisitCtx] = useState<VisitPhotoContext>(VISIT_PHOTO_STUB);

  // 견적/주문 화면은 멀티스텝(거래처 선택 → 라인 → 완료)이므로
  // 완료/뒤로가기 시 home 탭으로 복귀 처리.
  const handleBack = () => setTab('home');

  return (
    <View style={styles.container}>
      <View style={styles.screen}>
        <View style={[styles.tabScreen, tab !== 'home' && styles.hidden]}>
          <SalesHomeScreen
            token={token}
            onNavigate={(dest) => {
              if (dest === 'quotation' || dest === 'order' || dest === 'customer') {
                setTab(dest);
              }
            }}
          />
        </View>
        <View style={[styles.tabScreen, tab !== 'quotation' && styles.hidden]}>
          <QuotationCreateScreen token={token} onBack={handleBack} />
        </View>
        <View style={[styles.tabScreen, tab !== 'order' && styles.hidden]}>
          <PartnerOrderCreateScreen token={token} onBack={handleBack} />
        </View>
        <View style={[styles.tabScreen, tab !== 'customer' && styles.hidden]}>
          <CustomerSearchScreen token={token} standalone />
        </View>
        <View style={[styles.tabScreen, tab !== 'visit-photo' && styles.hidden]}>
          <VisitPhotoScreen
            partnerId={visitCtx.partnerId}
            partnerCode={visitCtx.partnerCode}
            partnerName={visitCtx.partnerName}
            token={token}
            onUploaded={() => setTab('home')}
            onBack={() => setTab('home')}
          />
        </View>
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
        <TabButton
          label="방문사진"
          active={tab === 'visit-photo'}
          onPress={() => {
            setVisitCtx(VISIT_PHOTO_STUB);
            setTab('visit-photo');
          }}
          testID="sales-tab-visit-photo"
        />
      </View>
    </View>
  );
}

// 내부 export — CustomerSearchScreen 이 거래처 선택 시 방문 사진 화면으로 이동하는
// 향후 연결 포인트. 현재(P1)는 stub 거래처만 지원.
export type { VisitPhotoContext };

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
  tabScreen: { ...StyleSheet.absoluteFillObject },
  hidden: { display: 'none' },
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
