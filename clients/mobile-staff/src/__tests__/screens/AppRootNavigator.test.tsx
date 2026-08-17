import React from 'react';
import { render } from '@testing-library/react-native';
import Constants from 'expo-constants';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { appVariant: 'staff' } } },
}));
jest.mock('expo-camera', () => ({}), { virtual: true });

jest.mock('../../screens/EstimateWebViewScreen', () => ({
  __esModule: true,
  default: () => {
    const ReactActual = jest.requireActual('react');
    const RN = jest.requireActual('react-native');
    return ReactActual.createElement(RN.Text, { testID: 'estimate-webview-screen' }, 'Estimate WebView');
  },
}));

jest.mock('../../screens/QrScanScreen', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../../screens/sales/SalesTabNavigator', () => ({
  __esModule: true,
  default: (props: { token: string | null }) => {
    const ReactActual = jest.requireActual('react');
    const RN = jest.requireActual('react-native');
    return ReactActual.createElement(RN.Text, { testID: 'sales-tab-navigator' }, props.token ?? '토큰 없음');
  },
}));

const AppRootNavigator = require('../../screens/AppRootNavigator').default;

describe('AppRootNavigator — D-AX-19 기사 모드 은퇴', () => {
  it('renders estimate WebView only and does not expose the driver switch', () => {
    Constants.expoConfig!.extra!.appVariant = 'staff';
    const utils = render(<AppRootNavigator />);

    expect(utils.getByTestId('estimate-webview-screen')).toBeTruthy();
    expect(utils.queryByTestId('mode-driver')).toBeNull();
    expect(utils.queryByText('배송기사')).toBeNull();
  });

  it('reaches SalesTabNavigator for the sales app variant and calls the real mobile dashboard contract', async () => {
    Constants.expoConfig!.extra!.appVariant = 'sales';
    process.env.EXPO_PUBLIC_SALES_ACCESS_TOKEN = 'runtime-sales-token';
    const utils = render(<AppRootNavigator />);

    expect(utils.getByTestId('sales-tab-navigator')).toBeTruthy();
    expect(utils.getByText('runtime-sales-token')).toBeTruthy();
    expect(utils.queryByTestId('estimate-webview-screen')).toBeNull();
    delete process.env.EXPO_PUBLIC_SALES_ACCESS_TOKEN;

    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            fromDate: '2026-07-17',
            toDate: '2026-08-16',
            totalSalesAmount: 1234567,
            totalOutstanding: 890000,
            estimateDraftCount: 2,
            estimateSentCount: 3,
            estimateAcceptedCount: 4,
            requesterId: 'staff-1',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const { getSalesDashboard } = require('../../api/sales');
    await expect(getSalesDashboard('real-access-token')).resolves.toEqual({
      fromDate: '2026-07-17',
      toDate: '2026-08-16',
      totalSalesAmount: 1234567,
      totalOutstanding: 890000,
      estimateDraftCount: 2,
      estimateSentCount: 3,
      estimateAcceptedCount: 4,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/mobile/sales/dashboard',
      expect.objectContaining({
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer real-access-token',
        },
      }),
    );
    fetchMock.mockRestore();
  });
});
