/**
 * AppRootNavigator — D-AX-19 기사 모드 은퇴.
 *
 * mobile-staff 는 영업직원 견적 WebView 를 보존하는 앱으로 되돌리고,
 * 배송기사 기능은 `clients/arologis-mobile` 이 전담한다.
 */

import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import EstimateWebViewScreen from './EstimateWebViewScreen';
import { colors } from '../theme/tokens';
import QrScanScreen from './QrScanScreen';
import SalesTabNavigator from './sales/SalesTabNavigator';
import { getSalesAccessToken } from '../auth/salesAuth';

export default function AppRootNavigator(): JSX.Element {
  const appVariant = Constants.expoConfig?.extra?.appVariant ?? 'staff';

  if (appVariant === 'sales') {
    return <SalesTabNavigator token={getSalesAccessToken()} />;
  }

  if (process.env.EXPO_PUBLIC_WAREHOUSE_SCAN === '1') {
    return <QrScanScreen />;
  }
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.body}>
        <EstimateWebViewScreen />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface.card },
  body: { flex: 1 },
});
