/**
 * DriverTabNavigator — D-AX-15 arologis-mobile post-login runtime.
 *
 * 이번 PR은 dashboard + GPS 두 탭만 활성화한다.
 * D-AX-16 — dashboard 정차 선택 후 전자서명 + 사본 발송 탭 활성화.
 * D-AX-17 — 배송/검수 사진 탭 활성화.
 */
import * as React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { clearAuth } from '../../stores/authStore';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import DriverDashboardScreen from './DriverDashboardScreen';
import DriverLocationTrackingScreen from './DriverLocationTrackingScreen';
import DriverPhotoScreen from './DriverPhotoScreen';
import type { PhotoTarget } from './DriverPhotoScreen';
import DriverSignatureScreen from './DriverSignatureScreen';
import type { SignatureTarget } from './DriverSignatureScreen';

type Tab = 'dashboard' | 'tracking' | 'photo' | 'signature';

interface Props {
  token: string | null;
  driverCode?: string | null;
  backgroundGranted: boolean;
}

export default function DriverTabNavigator({
  token,
  driverCode,
  backgroundGranted,
}: Props): React.ReactElement {
  const [tab, setTab] = React.useState<Tab>('dashboard');
  const [signatureTarget, setSignatureTarget] = React.useState<SignatureTarget | null>(null);
  const [photoTarget, setPhotoTarget] = React.useState<PhotoTarget | null>(null);

  const openSignature = (target: SignatureTarget) => {
    setSignatureTarget(target);
    setTab('signature');
  };

  const openPhoto = (target: PhotoTarget) => {
    setPhotoTarget(target);
    setTab('photo');
  };

  return (
    <View style={styles.container}>
      <View style={styles.screen}>
        {tab === 'dashboard' ? (
          <DriverDashboardScreen
            token={token}
            driverCode={driverCode}
            onOpenSignature={openSignature}
            onOpenPhoto={openPhoto}
          />
        ) : tab === 'tracking' ? (
          <DriverLocationTrackingScreen token={token} backgroundGranted={backgroundGranted} />
        ) : tab === 'photo' ? (
          <DriverPhotoScreen
            token={token}
            target={photoTarget}
            driverCode={driverCode}
            onBackToDashboard={() => setTab('dashboard')}
          />
        ) : (
          <DriverSignatureScreen
            token={token}
            target={signatureTarget}
            driverCode={driverCode}
            onBackToDashboard={() => setTab('dashboard')}
          />
        )}
      </View>

      <View style={styles.tabBar}>
        <TabButton
          label="배차"
          active={tab === 'dashboard'}
          onPress={() => setTab('dashboard')}
          testID="arologis-tab-dashboard"
        />
        <TabButton
          label="GPS"
          active={tab === 'tracking'}
          onPress={() => setTab('tracking')}
          testID="arologis-tab-tracking"
        />
        <TabButton
          label="사진"
          active={tab === 'photo'}
          onPress={() => setTab('photo')}
          testID="arologis-tab-photo"
        />
        <TabButton
          label="서명"
          active={tab === 'signature'}
          onPress={() => setTab('signature')}
          testID="arologis-tab-signature"
        />
        <TouchableOpacity
          onPress={clearAuth}
          style={styles.logoutBtn}
          accessibilityRole="button"
          testID="arologis-tab-logout"
        >
          <Text style={styles.logoutLabel}>로그아웃</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

interface TabButtonProps {
  label: string;
  active: boolean;
  onPress: () => void;
  testID: string;
}

function TabButton({ label, active, onPress, testID }: TabButtonProps): React.ReactElement {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.tabBtn, active && styles.tabBtnActive]}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      testID={testID}
    >
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.app },
  screen: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface.card,
    borderTopWidth: 1,
    borderTopColor: colors.line.default,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[1],
    gap: spacing[1],
  },
  tabBtn: {
    flex: 1,
    paddingVertical: spacing[3],
    alignItems: 'center',
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
  logoutBtn: {
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[2],
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.button,
    borderWidth: 1,
    borderColor: colors.line.default,
  },
  logoutLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.ink.secondary,
    fontWeight: typography.fontWeight.medium,
    fontFamily: typography.fontFamily.sans,
  },
});
