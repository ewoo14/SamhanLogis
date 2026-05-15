import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

jest.mock('../../../hooks/useGpsPermission', () => ({
  useGpsPermission: () => ({
    status: 'granted',
    foregroundGranted: true,
    backgroundGranted: false,
    blocked: false,
  }),
}));

jest.mock('react-native-safe-area-context', () => {
  const ReactActual = jest.requireActual('react');
  const RN = jest.requireActual('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => ReactActual.createElement(RN.View, null, children),
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => ReactActual.createElement(RN.View, null, children),
  };
});

jest.mock('../../../screens/driver/DriverDashboardScreen', () => {
  const ReactActual = jest.requireActual('react');
  const RN = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: ({
      onOpenSlipDetail,
    }: {
      onOpenSlipDetail?: (params: { slipId: string; slipNo?: string; partnerName?: string | null }) => void;
    }) =>
      ReactActual.createElement(
        RN.View,
        { testID: 'driver-dashboard-screen-mock' },
        ReactActual.createElement(
          RN.TouchableOpacity,
          {
            testID: 'mock-open-driver-slip',
            onPress: () =>
              onOpenSlipDetail?.({
                slipId: 'slip-1',
                slipNo: '2026-05-15-001',
                partnerName: 'Samhan Test',
              }),
          },
          ReactActual.createElement(RN.Text, null, 'open slip'),
        ),
      ),
  };
});

jest.mock('../../../screens/SlipDetailScreen', () => {
  const ReactActual = jest.requireActual('react');
  const RN = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: () => ReactActual.createElement(RN.View, { testID: 'samhan-slip-detail-screen-mock' }),
  };
});

jest.mock('../../../screens/driver/DriverLocationTrackingScreen', () => {
  const ReactActual = jest.requireActual('react');
  const RN = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: () => ReactActual.createElement(RN.View, { testID: 'driver-tracking-screen-mock' }),
  };
});

jest.mock('../../../screens/driver/DriverSignatureScreen', () => {
  const ReactActual = jest.requireActual('react');
  const RN = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: () => ReactActual.createElement(RN.View, { testID: 'driver-signature-screen-mock' }),
  };
});

jest.mock('../../../screens/driver/InspectionPhotoScreen', () => {
  const ReactActual = jest.requireActual('react');
  const RN = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: () => ReactActual.createElement(RN.View, { testID: 'driver-inspection-screen-mock' }),
  };
});

jest.mock('../../../screens/driver/SignaturePhotoScreen', () => {
  const ReactActual = jest.requireActual('react');
  const RN = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: () => ReactActual.createElement(RN.View, { testID: 'signature-photo-screen-mock' }),
  };
});

jest.mock('../../../screens/driver/GpsBlockedScreen', () => {
  const ReactActual = jest.requireActual('react');
  const RN = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: () => ReactActual.createElement(RN.View, { testID: 'gps-blocked-screen-mock' }),
  };
});

import DriverTabNavigator from '../../../screens/driver/DriverTabNavigator';

describe('DriverTabNavigator slip detail boundary (D-AX-12)', () => {
  it('opens the driver-owned slip detail route and returns to dashboard', async () => {
    const utils = render(<DriverTabNavigator token="jwt-x" />);

    fireEvent.press(utils.getByTestId('mock-open-driver-slip'));

    await waitFor(() => expect(utils.getByTestId('driver-slip-detail-entry-mobile')).toBeTruthy());
    expect(utils.getByText('전표 상세 연결 준비 중')).toBeTruthy();
    expect(utils.queryByTestId('samhan-slip-detail-screen-mock')).toBeNull();

    fireEvent.press(utils.getByTestId('driver-slip-detail-entry-back-mobile'));

    await waitFor(() => expect(utils.getByTestId('driver-dashboard-screen-mock')).toBeTruthy());
    expect(utils.queryByTestId('driver-slip-detail-entry-mobile')).toBeNull();
  });
});
