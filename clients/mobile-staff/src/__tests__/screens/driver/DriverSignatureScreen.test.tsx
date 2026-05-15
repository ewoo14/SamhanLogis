/**
 * DriverSignatureScreen Jest 단위 — Phase F (D-DF-07/12).
 *
 * 6 시나리오:
 *  1. 두 서명 후 완료 버튼 클릭 → POST + Share Sheet 호출 + success toast
 *  2. RECIPIENT_PHONE_MISSING — Admin 재발송 toast + 재시도 버튼 미표시
 *  3. RENDERER_TIMEOUT — fail toast + 재시도 버튼 표시
 *  4. 409 duplicate — 이미 발송됨 toast
 *  5. 422 bridge fail — 다시 시도 toast + 재시도 버튼
 *  6. 서명 미완료 시 완료 버튼 disabled
 *
 * Mock 전략:
 *  - expo-sharing / expo-file-system / api/arologis 모듈 jest.mock
 *  - useGpsPermission.getCurrentPositionAsync mock (GPS 비호출)
 *  - AuditOverlay / SafeAreaView 등 RN 컴포넌트는 jest-expo preset 처리
 */

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

// ---- mocks (반드시 import 보다 먼저 jest.mock 호출) ----
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-file-system', () => ({
  cacheDirectory: 'file:///cache/',
  EncodingType: { Base64: 'base64', UTF8: 'utf8' },
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../api/arologis', () => ({
  signAndSendCopy: jest.fn(),
  // 필요한 type re-export 대비 (런타임 미사용)
}));

jest.mock('../../../hooks/useGpsPermission', () => ({
  getCurrentPositionAsync: jest.fn().mockResolvedValue({
    latitude: 37.1234567,
    longitude: 127.7654321,
    capturedAt: '2026-05-15T14:00:00.000Z',
  }),
  useGpsPermission: () => ({
    status: 'granted',
    foregroundGranted: true,
    backgroundGranted: false,
    blocked: false,
  }),
}));

// SafeAreaView wrapper 단순화 — view 로 대체
jest.mock('react-native-safe-area-context', () => {
  const ReactActual = jest.requireActual('react');
  const RN = jest.requireActual('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => ReactActual.createElement(RN.View, null, children),
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => ReactActual.createElement(RN.View, null, children),
  };
});

// AuditOverlay 단순 mock — 자식 컴포넌트 의존 차단
jest.mock('../../../components/AuditOverlay', () => {
  const ReactActual = jest.requireActual('react');
  const RN = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: () => ReactActual.createElement(RN.View, { testID: 'audit-overlay-mock' }),
  };
});

import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import * as api from '../../../api/arologis';
import DriverSignatureScreen from '../../../screens/driver/DriverSignatureScreen';

const defaultProps = {
  token: 'jwt-x',
  dispatchId: 'dispatch-1',
  vehicleSeq: 1,
  stopSeq: 1,
  stopLabel: 'SL-001 대구공조',
  recipientPhoneMasked: '010-****-5678',
};

const captureBothSignatures = async (utils: ReturnType<typeof render>) => {
  fireEvent.press(utils.getByTestId('sig-driver'));
  fireEvent.press(utils.getByTestId('sig-recipient'));
  // 기사 서명은 async (await getCurrentPositionAsync) — state 반영 대기.
  await waitFor(() => {
    const btn = utils.getByTestId('btn-complete-and-share');
    expect(btn.props.accessibilityState?.disabled).toBe(false);
  });
};

/**
 * toast View 의 자식 Text 의 실제 문자열을 추출.
 * 구조: <View testID="toast-result"><Text>{state.toast}</Text></View>
 */
const getToastText = (toastView: { props: { children: { props: { children: unknown } } } }): string => {
  const inner = toastView.props.children;
  const text = inner?.props?.children;
  return typeof text === 'string' ? text : String(text ?? '');
};

describe('DriverSignatureScreen — Phase F (sign-and-send-copy)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
    (Sharing.shareAsync as jest.Mock).mockResolvedValue(undefined);
    (FileSystem.writeAsStringAsync as jest.Mock).mockResolvedValue(undefined);
  });

  it('1. 두 서명 후 완료 버튼 클릭 → POST + Share Sheet 호출 + success toast', async () => {
    (api.signAndSendCopy as jest.Mock).mockResolvedValue({
      kind: 'success',
      pngBase64: 'iVBOR',
      signatureId: 'sig-uuid-1',
      copySentAt: '2026-05-15T14:30:00',
      copyRecipientPhoneMasked: '010-****-5678',
    });

    const utils = render(<DriverSignatureScreen {...defaultProps} />);
    await captureBothSignatures(utils);

    fireEvent.press(utils.getByTestId('btn-complete-and-share'));

    await waitFor(() => expect(api.signAndSendCopy as jest.Mock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(FileSystem.writeAsStringAsync as jest.Mock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(Sharing.shareAsync as jest.Mock).toHaveBeenCalledTimes(1));

    const toast = await utils.findByTestId('toast-result');
    expect(getToastText(toast as never)).toMatch(/010-\*\*\*\*-5678 에게 보내세요/);
  });

  it('2. RECIPIENT_PHONE_MISSING — Admin 재발송 toast + 재시도 버튼 미표시', async () => {
    (api.signAndSendCopy as jest.Mock).mockResolvedValue({
      kind: 'fail',
      json: { copySent: false, copyFailureReason: 'RECIPIENT_PHONE_MISSING' },
      status: 200,
    });

    const utils = render(<DriverSignatureScreen {...defaultProps} />);
    await captureBothSignatures(utils);
    fireEvent.press(utils.getByTestId('btn-complete-and-share'));

    const toast = await utils.findByTestId('toast-result');
    expect(getToastText(toast as never)).toMatch(/인수자 번호 미등록/);
    expect(utils.queryByTestId('btn-retry-copy')).toBeNull();
    expect(Sharing.shareAsync as jest.Mock).not.toHaveBeenCalled();
  });

  it('3. RENDERER_TIMEOUT — fail toast + 재시도 버튼 표시', async () => {
    (api.signAndSendCopy as jest.Mock).mockResolvedValue({
      kind: 'fail',
      json: { copySent: false, copyFailureReason: 'RENDERER_TIMEOUT' },
      status: 200,
    });

    const utils = render(<DriverSignatureScreen {...defaultProps} />);
    await captureBothSignatures(utils);
    fireEvent.press(utils.getByTestId('btn-complete-and-share'));

    const toast = await utils.findByTestId('toast-result');
    expect(getToastText(toast as never)).toMatch(/RENDERER_TIMEOUT/);
    expect(utils.getByTestId('btn-retry-copy')).toBeTruthy();
  });

  it('4. 409 duplicate — 이미 발송됨 toast', async () => {
    (api.signAndSendCopy as jest.Mock).mockResolvedValue({
      kind: 'duplicate',
      json: { copySent: true, previousCopySentAt: '2026-05-14T10:00:00' },
      status: 409,
    });

    const utils = render(<DriverSignatureScreen {...defaultProps} />);
    await captureBothSignatures(utils);
    fireEvent.press(utils.getByTestId('btn-complete-and-share'));

    const toast = await utils.findByTestId('toast-result');
    expect(getToastText(toast as never)).toMatch(/이미 발송됨/);
    expect(getToastText(toast as never)).toMatch(/2026-05-14T10:00:00/);
    expect(utils.queryByTestId('btn-retry-copy')).toBeNull();
  });

  it('5. 422 bridge fail — 다시 시도 toast + 재시도 버튼', async () => {
    (api.signAndSendCopy as jest.Mock).mockResolvedValue({
      kind: 'bridge',
      json: {
        copySent: false,
        error: 'SIGNATURE_BRIDGE_FAILED:SLIP_SERVICE_REJECTED',
        retryable: true,
      },
      status: 422,
    });

    const utils = render(<DriverSignatureScreen {...defaultProps} />);
    await captureBothSignatures(utils);
    fireEvent.press(utils.getByTestId('btn-complete-and-share'));

    const toast = await utils.findByTestId('toast-result');
    expect(getToastText(toast as never)).toMatch(/서명 양쪽 저장 실패/);
    expect(utils.getByTestId('btn-retry-copy')).toBeTruthy();
  });

  it('6. 서명 미완료 시 완료 버튼 disabled', () => {
    const utils = render(<DriverSignatureScreen {...defaultProps} />);
    const btn = utils.getByTestId('btn-complete-and-share');
    expect(btn.props.accessibilityState?.disabled).toBe(true);
  });
});
