import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-file-system', () => ({
  cacheDirectory: 'file:///cache/',
  EncodingType: { Base64: 'base64' },
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('react-native-signature-canvas', () => {
  const ReactActual = jest.requireActual('react');
  const RN = jest.requireActual('react-native');

  return {
    __esModule: true,
    default: ReactActual.forwardRef((props: { onOK: (value: string) => void; onClear?: () => void }, ref: React.Ref<unknown>) => {
      ReactActual.useImperativeHandle(ref, () => ({
        readSignature: () => props.onOK('data:image/png;base64,REAL_SIGNATURE_BASE64'),
        clearSignature: () => props.onClear?.(),
      }));

      return ReactActual.createElement(RN.View, { testID: 'signature-canvas-mock' });
    }),
  };
});

jest.mock('../../../api/arologis', () => ({
  signAndSendCopy: jest.fn(),
}));

jest.mock('../../../hooks/useGpsPermission', () => ({
  getCurrentPositionAsync: jest.fn().mockResolvedValue({
    latitude: 37.1234567,
    longitude: 127.7654321,
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

import * as api from '../../../api/arologis';
import { getCurrentPositionAsync } from '../../../hooks/useGpsPermission';
import DriverSignatureScreen from '../../../screens/driver/DriverSignatureScreen';

const target = {
  dispatchType: 'NIGHT' as const,
  vehicleSequence: 1,
  stopSequence: 1,
  parsedKakaoSeq: 1234,
  stopLabel: '테스트상사 / 서울 강남구 테스트로 1 / 카톡 순번 1234',
  partnerName: '테스트상사',
};

const defaultProps = {
  token: 'jwt-x',
  target,
  driverCode: 'DR-2026-001',
  onBackToDashboard: jest.fn(),
};

function textContent(node: unknown): string {
  if (typeof node === 'string') {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map(textContent).join('');
  }
  if (node && typeof node === 'object' && 'props' in node) {
    return textContent((node as { props: { children?: unknown } }).props.children);
  }
  return '';
}

async function captureBothSignatures(utils: ReturnType<typeof render>): Promise<void> {
  fireEvent.press(utils.getByTestId('arologis-signature-driver-capture'));
  await waitFor(() => expect(getCurrentPositionAsync as jest.Mock).toHaveBeenCalledTimes(1));

  fireEvent.press(utils.getByTestId('arologis-signature-recipient-capture'));
  await waitFor(() => {
    expect(utils.getByTestId('arologis-signature-complete-share').props.accessibilityState?.disabled).toBe(false);
  });
}

describe('DriverSignatureScreen D-AX-16', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(1770000000000);
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
    (Sharing.shareAsync as jest.Mock).mockResolvedValue(undefined);
    (FileSystem.writeAsStringAsync as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('정차 target이 없으면 배차 탭 복귀 안내만 보여준다', () => {
    const utils = render(<DriverSignatureScreen {...defaultProps} target={null} />);

    expect(utils.getByText('배차 탭에서 정차를 선택해 주세요')).toBeTruthy();
    expect(utils.queryByTestId('arologis-signature-complete-share')).toBeNull();
  });

  it('실제 서명 data URL을 base64로 정규화해 UUID-free today 경로 target으로 사본 발송한다', async () => {
    (api.signAndSendCopy as jest.Mock).mockResolvedValue({
      kind: 'success',
      pngBase64: 'PNG_BASE64',
      signatureId: '11111111-2222-3333-4444-555555555555',
      copySentAt: '2026-05-15T14:30:00',
      copyRecipientPhoneMasked: '010-****-5678',
    });

    const utils = render(<DriverSignatureScreen {...defaultProps} />);
    await captureBothSignatures(utils);

    fireEvent.press(utils.getByTestId('arologis-signature-complete-share'));

    await waitFor(() => expect(api.signAndSendCopy as jest.Mock).toHaveBeenCalledTimes(1));
    expect(api.signAndSendCopy).toHaveBeenCalledWith('jwt-x', 'NIGHT', 1, 1, {
      driverSignatureBase64: 'REAL_SIGNATURE_BASE64',
      recipientSignatureBase64: 'REAL_SIGNATURE_BASE64',
      capturedAt: '2026-05-15T14:00:00.000',
      gpsLat: 37.1234567,
      gpsLng: 127.7654321,
      parsedKakaoSeq: 1234,
    });

    await waitFor(() => expect(FileSystem.writeAsStringAsync as jest.Mock).toHaveBeenCalledTimes(1));
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      'file:///cache/arologis-signature-copy-NIGHT-v1-s1-1770000000000.png',
      'PNG_BASE64',
      { encoding: 'base64' },
    );
    expect((FileSystem.writeAsStringAsync as jest.Mock).mock.calls[0][0]).not.toContain('11111111-2222-3333-4444-555555555555');
    await waitFor(() => expect(Sharing.shareAsync as jest.Mock).toHaveBeenCalledTimes(1));

    const toast = await utils.findByTestId('arologis-signature-toast');
    expect(textContent(toast)).toContain('010-****-5678');
    expect(utils.getByText('발송 완료')).toBeTruthy();
  });

  it('인수자 전화번호 누락은 재시도 없이 관리자 재발송 안내로 종료한다', async () => {
    (api.signAndSendCopy as jest.Mock).mockResolvedValue({
      kind: 'fail',
      copyFailureReason: 'RECIPIENT_PHONE_MISSING',
      status: 200,
    });

    const utils = render(<DriverSignatureScreen {...defaultProps} />);
    await captureBothSignatures(utils);
    fireEvent.press(utils.getByTestId('arologis-signature-complete-share'));

    const toast = await utils.findByTestId('arologis-signature-toast');
    expect(textContent(toast)).toContain('인수자 번호가 없어');
    expect(utils.queryByTestId('arologis-signature-retry')).toBeNull();
    expect(Sharing.shareAsync as jest.Mock).not.toHaveBeenCalled();
    expect(utils.getByText('발송 완료')).toBeTruthy();
  });

  it('renderer timeout은 기본 CTA를 잠그고 재시도 버튼만 노출한다', async () => {
    (api.signAndSendCopy as jest.Mock).mockResolvedValue({
      kind: 'fail',
      copyFailureReason: 'RENDERER_TIMEOUT',
      status: 200,
    });

    const utils = render(<DriverSignatureScreen {...defaultProps} />);
    await captureBothSignatures(utils);
    fireEvent.press(utils.getByTestId('arologis-signature-complete-share'));

    const retry = await utils.findByTestId('arologis-signature-retry');
    const complete = utils.getByTestId('arologis-signature-complete-share');
    expect(textContent(await utils.findByTestId('arologis-signature-toast'))).toContain('재시도할 수 있습니다');
    expect(retry).toBeTruthy();
    expect(complete.props.accessibilityState?.disabled).toBe(true);
  });

  it('이미 발송된 정차는 duplicate 안내 후 재시도를 띄우지 않는다', async () => {
    (api.signAndSendCopy as jest.Mock).mockResolvedValue({
      kind: 'duplicate',
      previousCopySentAt: '2026-05-14T10:00:00',
      status: 409,
    });

    const utils = render(<DriverSignatureScreen {...defaultProps} />);
    await captureBothSignatures(utils);
    fireEvent.press(utils.getByTestId('arologis-signature-complete-share'));

    const toast = await utils.findByTestId('arologis-signature-toast');
    expect(textContent(toast)).toContain('이미 발송된 정차입니다');
    expect(textContent(toast)).toContain('2026-05-14T10:00:00');
    expect(utils.queryByTestId('arologis-signature-retry')).toBeNull();
  });

  it('bridge 실패는 재시도 가능 상태로 남긴다', async () => {
    (api.signAndSendCopy as jest.Mock).mockResolvedValue({
      kind: 'bridge',
      retryable: true,
      status: 422,
    });

    const utils = render(<DriverSignatureScreen {...defaultProps} />);
    await captureBothSignatures(utils);
    fireEvent.press(utils.getByTestId('arologis-signature-complete-share'));

    const toast = await utils.findByTestId('arologis-signature-toast');
    expect(textContent(toast)).toContain('서명 양쪽 저장 실패');
    expect(utils.getByTestId('arologis-signature-retry')).toBeTruthy();
  });
});
