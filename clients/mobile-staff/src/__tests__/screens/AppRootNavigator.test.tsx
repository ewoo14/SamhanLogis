import React from 'react';
import { render } from '@testing-library/react-native';
import AppRootNavigator from '../../screens/AppRootNavigator';

jest.mock('../../screens/EstimateWebViewScreen', () => ({
  __esModule: true,
  default: () => {
    const ReactActual = jest.requireActual('react');
    const RN = jest.requireActual('react-native');
    return ReactActual.createElement(RN.Text, { testID: 'estimate-webview-screen' }, 'Estimate WebView');
  },
}));

describe('AppRootNavigator — D-AX-19 기사 모드 은퇴', () => {
  it('renders estimate WebView only and does not expose the driver switch', () => {
    const utils = render(<AppRootNavigator />);

    expect(utils.getByTestId('estimate-webview-screen')).toBeTruthy();
    expect(utils.queryByTestId('mode-driver')).toBeNull();
    expect(utils.queryByText('배송기사')).toBeNull();
  });
});
