/**
 * DriverTabNavigator — Phase 10 W10-3 신규 (mobile-staff 내부 driver tab).
 *
 * 사용자 결정 (2026-05-07) — `clients/mobile-staff` 내부 driver tab 채택 (별도 mobile-driver 신규 X).
 *
 * 본 navigator 는 react-navigation 의존성 미설치 환경에서도 동작하도록 자체 minimal tab 구현 — 5 화면
 * (Dashboard / LocationTracking / Signature / Inspection-photo / Signature-photo) state-machine 으로 분기.
 *
 * Phase F (D-DF-13) — W10-4 deep link 활성:
 *   - signature-photo 탭 진입 → 사진 첨부 + 일괄 업로드 → onUploaded callback → signature 탭 자동 이동.
 *   - 사진은 slip-service attachment 로만 저장 (사본 PNG 와 분리, 분쟁 증빙용).
 *
 * 후속 (선택):
 *   - `@react-navigation/native` + `@react-navigation/bottom-tabs` 정식 도입 시 본 파일을
 *     `createBottomTabNavigator` 로 치환 — 인터페이스 동등.
 *
 * 가드:
 *   - GPS 권한 거부 / 미가용 → `<GpsBlockedScreen>` 노출 (driver 화면 진입 차단).
 *   - foreground 권한 OK → 5 tab 활성.
 */

import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useGpsPermission } from '../../hooks/useGpsPermission';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import DriverDashboardScreen from './DriverDashboardScreen';
import DriverLocationTrackingScreen from './DriverLocationTrackingScreen';
import DriverSignatureScreen from './DriverSignatureScreen';
import GpsBlockedScreen from './GpsBlockedScreen';
import InspectionPhotoScreen from './InspectionPhotoScreen';
import SignaturePhotoScreen from './SignaturePhotoScreen';
import DriverSlipDetailEntry from './DriverSlipDetailEntry';

type Tab = 'dashboard' | 'tracking' | 'signature' | 'inspection-photo' | 'signature-photo';

interface Props {
  /** JWT access token — driver tab 진입 직전 user-service `/auth/me` 로 ROLE_DRIVER 확인 후 보관. */
  token: string | null;
  /**
   * 서명 캡처 대상 (Dashboard 에서 vehicle/stop 선택 후 라우팅하는 흐름이 정식 — 본 PR 단계는
   * Mock dispatchId 사용. 정식 navigation library 도입 시 deeplink param 전달).
   */
  selectedStop?: {
    dispatchId: string;
    vehicleSeq: number;
    stopSeq: number;
    label?: string;
  };
}

/**
 * mock 정차 식별자 — 본 PR 진입 시점 backend 응답 = vehicleSequence + tonnage + status (W10-1
 * 단순화). dispatchId / stopSeq 는 후속 W10-3 backend 확장 시 dashboard → signature deeplink
 * 으로 전달. 본 PR 단계는 placeholder UUID + seq=1 로 화면 동작 검증만.
 */
const MOCK_STOP_FOR_PR = {
  dispatchId: '00000000-0000-0000-0000-000000000000',
  vehicleSeq: 1,
  stopSeq: 1,
  label: 'mock 정차 (W10-3 진입 시점 placeholder, 실 deeplink = 후속)',
};

interface SlipDetailRoute {
  slipId: string;
  slipNo?: string;
  partnerName?: string | null;
}

export default function DriverTabNavigator({ token, selectedStop }: Props): JSX.Element {
  const gps = useGpsPermission();
  const [tab, setTab] = useState<Tab>('dashboard');
  // PR-H1 — Dashboard slip card 에서 SlipDetailScreen 으로 push (정식 navigation library 도입 전 minimal stack).
  const [slipDetailRoute, setSlipDetailRoute] = useState<SlipDetailRoute | null>(null);

  const stopForSignature = useMemo(() => selectedStop ?? MOCK_STOP_FOR_PR, [selectedStop]);

  /**
   * Phase F (D-DF-13) W10-4 deep link — 사진 업로드 완료 → 서명 탭 자동 이동.
   * SignaturePhotoScreen.onUploaded 콜백으로 호출됨 (배송 사진은 slip-service attachment 보관).
   */
  const handleSignaturePhotoUploaded = useCallback(() => {
    setTab('signature');
  }, []);

  if (gps.blocked) {
    return <GpsBlockedScreen />;
  }

  if (gps.status === 'unknown') {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>GPS 권한 확인 중…</Text>
      </View>
    );
  }

  // D-AX-12 — Samhan Public SlipDetailScreen 직접 import 대신 driver-local entry 경계로 진입.
  if (slipDetailRoute) {
    return (
      <DriverSlipDetailEntry
        token={token}
        slipId={slipDetailRoute.slipId}
        slipNo={slipDetailRoute.slipNo}
        partnerName={slipDetailRoute.partnerName}
        onBack={() => setSlipDetailRoute(null)}
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.screen}>
        {tab === 'dashboard' && (
          <DriverDashboardScreen
            token={token}
            onOpenSlipDetail={(params) => setSlipDetailRoute(params)}
          />
        )}
        {tab === 'tracking' && (
          <DriverLocationTrackingScreen
            token={token}
            backgroundGranted={gps.backgroundGranted}
          />
        )}
        {tab === 'signature' && (
          <DriverSignatureScreen
            token={token}
            dispatchId={stopForSignature.dispatchId}
            vehicleSeq={stopForSignature.vehicleSeq}
            stopSeq={stopForSignature.stopSeq}
            stopLabel={stopForSignature.label}
          />
        )}
        {tab === 'inspection-photo' && (
          /* P1 검수 사진 — 배차/슬립 선택 시 slipId 연결 (현재 stub). */
          <InspectionPhotoScreen
            slipId={null}           // stub: dashboard → slip 선택 후 채워짐
            slipNo="전표를 배차 탭에서 선택해주세요"
            token={token}
            onUploaded={() => setTab('dashboard')}
          />
        )}
        {tab === 'signature-photo' && (
          /* Phase F (D-DF-13) — 배송 사진 첨부 → 업로드 완료 시 서명 탭 자동 이동 (W10-4 deep link 활성). */
          <SignaturePhotoScreen
            batchToken={null /* dashboard → slip 선택 후 채워짐 */}
            slipNo={stopForSignature.label ?? '전표 미선택'}
            stopLabel={stopForSignature.label}
            defaultType="DELIVERY"
            onUploaded={handleSignaturePhotoUploaded}
          />
        )}
      </View>
      <View style={styles.tabBar}>
        <TabButton label="배차" active={tab === 'dashboard'} onPress={() => setTab('dashboard')} testID="driver-tab-dashboard" />
        <TabButton label="GPS" active={tab === 'tracking'} onPress={() => setTab('tracking')} testID="driver-tab-tracking" />
        <TabButton label="배송사진" active={tab === 'signature-photo'} onPress={() => setTab('signature-photo')} testID="driver-tab-signature-photo" />
        <TabButton label="서명" active={tab === 'signature'} onPress={() => setTab('signature')} testID="driver-tab-signature" />
        <TabButton label="검수사진" active={tab === 'inspection-photo'} onPress={() => setTab('inspection-photo')} testID="driver-tab-inspection-photo" />
      </View>
    </View>
  );
}

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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.app },
  screen: { flex: 1 },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface.app,
  },
  loadingText: {
    fontSize: typography.fontSize.base,
    color: colors.ink.secondary,
    fontFamily: typography.fontFamily.sans,
  },
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
    fontSize: typography.fontSize.sm,
    color: colors.ink.secondary,
    fontWeight: typography.fontWeight.medium,
    fontFamily: typography.fontFamily.sans,
  },
  tabLabelActive: {
    color: colors.action.brandActive,
    fontWeight: typography.fontWeight.semibold,
  },
});
