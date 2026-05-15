/**
 * SignaturePhotoScreen → DriverSignatureScreen chain Jest 1건 (D-DF-13).
 *
 * 시나리오: 사진 업로드 완료 시 SignaturePhotoScreen.onUploaded callback 이 호출되고,
 * DriverTabNavigator 가 'signature' 탭으로 자동 이동한다 (W10-4 deep link 활성).
 *
 * Mock 전략:
 *   - SignaturePhotoScreen 을 mock 하여 onUploaded 를 즉시 호출하는 버튼을 노출.
 *   - DriverSignatureScreen 도 mock — 'driver-signature-screen-mock' testID 노출.
 *   - GpsPermission granted 강제.
 *   - DriverTabNavigator 진입 후 'signature-photo' 탭 → mock 버튼 press → 'signature' 탭 자동 이동 확인.
 */

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

jest.mock('../../../hooks/useGpsPermission', () => ({
  useGpsPermission: () => ({
    status: 'granted',
    foregroundGranted: true,
    backgroundGranted: false,
    blocked: false,
  }),
  getCurrentPositionAsync: jest.fn().mockResolvedValue({
    latitude: 37.0,
    longitude: 127.0,
    capturedAt: '2026-05-15T14:00:00.000Z',
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

// 자식 화면 mock — onUploaded 즉시 호출 버튼만 노출.
jest.mock('../../../screens/driver/SignaturePhotoScreen', () => {
  const ReactActual = jest.requireActual('react');
  const RN = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: ({ onUploaded }: { onUploaded?: (results: unknown[]) => void }) =>
      ReactActual.createElement(
        RN.View,
        { testID: 'signature-photo-screen-mock' },
        ReactActual.createElement(
          RN.TouchableOpacity,
          {
            testID: 'mock-trigger-uploaded',
            onPress: () => onUploaded?.([{ id: 'att-1', fileName: 'photo.jpg', uploadedAt: '2026-05-15T14:00:00' }]),
          },
          ReactActual.createElement(RN.Text, null, 'mock 업로드 완료 trigger'),
        ),
      ),
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

jest.mock('../../../screens/driver/DriverDashboardScreen', () => {
  const ReactActual = jest.requireActual('react');
  const RN = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: () => ReactActual.createElement(RN.View, { testID: 'driver-dashboard-screen-mock' }),
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

jest.mock('../../../screens/driver/InspectionPhotoScreen', () => {
  const ReactActual = jest.requireActual('react');
  const RN = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: () => ReactActual.createElement(RN.View, { testID: 'driver-inspection-screen-mock' }),
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

jest.mock('../../../screens/driver/DriverSlipDetailEntry', () => {
  const ReactActual = jest.requireActual('react');
  const RN = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: () => ReactActual.createElement(RN.View, { testID: 'driver-slip-detail-entry-mock' }),
  };
});

import DriverTabNavigator from '../../../screens/driver/DriverTabNavigator';

describe('SignaturePhotoScreen → DriverSignature chain (D-DF-13)', () => {
  it('사진 업로드 완료 시 DriverSignatureScreen 으로 자동 이동 (W10-4 deep link 활성)', async () => {
    const utils = render(<DriverTabNavigator token="jwt-x" />);

    // 'signature-photo' 탭으로 이동
    fireEvent.press(utils.getByTestId('driver-tab-signature-photo'));
    await waitFor(() => expect(utils.getByTestId('signature-photo-screen-mock')).toBeTruthy());

    // mock 업로드 완료 trigger
    fireEvent.press(utils.getByTestId('mock-trigger-uploaded'));

    // chain — 'signature' 탭의 DriverSignatureScreen 으로 자동 이동 확인
    await waitFor(() => {
      expect(utils.getByTestId('driver-signature-screen-mock')).toBeTruthy();
    });
    expect(utils.queryByTestId('signature-photo-screen-mock')).toBeNull();
  });
});
