import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

jest.mock('expo-image-picker', () => ({}), { virtual: true });
jest.mock('expo-image-manipulator', () => ({}), { virtual: true });
jest.mock('../../api/sales', () => ({
  getSalesDashboard: jest.fn().mockResolvedValue({
    fromDate: '2026-07-17',
    toDate: '2026-08-16',
    totalSalesAmount: 0,
    totalOutstanding: 0,
    estimateDraftCount: 0,
    estimateSentCount: 0,
    estimateAcceptedCount: 0,
  }),
  quickSearchCustomer: jest.fn().mockResolvedValue([]),
  createMobileQuotation: jest.fn(),
  createMobilePartnerOrder: jest.fn(),
}));

const SalesTabNavigator = require('../../screens/sales/SalesTabNavigator').default;

describe('SalesTabNavigator 화면 도달성', () => {
  it('renders dashboard, quotation, partner order, and customer search screens through their tabs', async () => {
    const utils = render(<SalesTabNavigator token={null} />);

    await waitFor(() => expect(utils.getByText('영업 대시보드')).toBeTruthy());

    fireEvent.press(utils.getByTestId('sales-tab-quotation'));
    expect(utils.getByText('신규 견적 — 거래처 선택')).toBeTruthy();

    fireEvent.press(utils.getByTestId('sales-tab-order'));
    expect(utils.getByText('신규 주문 — 거래처 선택')).toBeTruthy();

    fireEvent.press(utils.getByTestId('sales-tab-customer'));
    expect(utils.getByTestId('customer-search-input')).toBeTruthy();

    fireEvent.changeText(utils.getByTestId('customer-search-input'), '상태보존SOL');
    fireEvent.press(utils.getByTestId('sales-tab-home'));
    fireEvent.press(utils.getByTestId('sales-tab-customer'));
    expect(utils.getByTestId('customer-search-input').props.value).toBe('상태보존SOL');

    fireEvent.press(utils.getByTestId('sales-tab-visit-photo'));
    fireEvent.changeText(utils.getByTestId('visit-photo-memo'), '상태보존 방문메모 SOL');
    fireEvent.press(utils.getByTestId('sales-tab-home'));
    fireEvent.press(utils.getByTestId('sales-tab-visit-photo'));
    expect(utils.getByTestId('visit-photo-memo').props.value).toBe('상태보존 방문메모 SOL');
  });
});
