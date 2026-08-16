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
  default: () => {
    const ReactActual = jest.requireActual('react');
    const RN = jest.requireActual('react-native');
    return ReactActual.createElement(RN.Text, { testID: 'sales-tab-navigator' }, '영업 탭');
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

  it('reaches SalesTabNavigator for the sales app variant', () => {
    Constants.expoConfig!.extra!.appVariant = 'sales';
    const utils = render(<AppRootNavigator />);

    expect(utils.getByTestId('sales-tab-navigator')).toBeTruthy();
    expect(utils.queryByTestId('estimate-webview-screen')).toBeNull();
  });
});
