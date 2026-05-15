import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => {
  const ReactActual = jest.requireActual('react');
  const RN = jest.requireActual('react-native');

  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => ReactActual.createElement(RN.View, null, children),
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => ReactActual.createElement(RN.View, null, children),
  };
});

jest.mock('../../../components/PhotoAttachmentCapture', () => {
  const ReactActual = jest.requireActual('react');
  const RN = jest.requireActual('react-native');

  const samplePhoto = {
    uri: 'file:///cache/photo-1.jpg',
    fileName: 'photo-1.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 1024,
    exifGpsLat: 37.1234567,
    exifGpsLng: 127.7654321,
    capturedAt: '2026-05-15T13:00:00',
  };

  return {
    __esModule: true,
    default: ({
      value,
      onChange,
      title,
      maxItems,
      itemStatus,
    }: {
      value: typeof samplePhoto[];
      onChange: (next: typeof samplePhoto[]) => void;
      title?: string;
      maxItems?: number;
      itemStatus?: Array<{ uploading: boolean; uploaded: boolean; error?: string | null } | undefined>;
    }) => ReactActual.createElement(
      RN.View,
      { testID: 'photo-capture-mock' },
      ReactActual.createElement(RN.Text, { testID: 'photo-capture-title' }, title),
      ReactActual.createElement(RN.Text, { testID: 'photo-capture-max' }, `max-${maxItems}`),
      ReactActual.createElement(RN.Text, { testID: 'photo-capture-count' }, `count-${value.length}`),
      itemStatus?.map((status, index) => ReactActual.createElement(
        RN.Text,
        { key: index, testID: `photo-capture-status-${index}` },
        status?.uploaded ? '업로드 완료' : status?.error ?? '대기',
      )),
      ReactActual.createElement(
        RN.TouchableOpacity,
        {
          testID: 'mock-add-photo',
          onPress: () => onChange([...value, { ...samplePhoto, fileName: `photo-${value.length + 1}.jpg` }]),
        },
        ReactActual.createElement(RN.Text, null, '사진 추가'),
      ),
    ),
  };
}, { virtual: true });

jest.mock('../../../api/arologis', () => ({
  ArologisApiError: class ArologisApiError extends Error {
    public readonly status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
      this.name = 'ArologisApiError';
    }
  },
  uploadStopPhoto: jest.fn(),
}));

import { ArologisApiError, uploadStopPhoto } from '../../../api/arologis';
import DriverPhotoScreen from '../../../screens/driver/DriverPhotoScreen';

const target = {
  dispatchType: 'NIGHT' as const,
  vehicleSequence: 7,
  stopSequence: 3,
  parsedKakaoSeq: 4567,
  stopLabel: '테스트상사 / 서울 강남구 테스트로 1 / 카톡 순번 4567',
  partnerName: '테스트상사',
};

const defaultProps = {
  token: 'jwt-x',
  target,
  driverCode: 'DR-2026-001',
  onBackToDashboard: jest.fn(),
};

function textContent(node: unknown): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(textContent).join('');
  if (node && typeof node === 'object' && 'props' in node) {
    return textContent((node as { props: { children?: unknown } }).props.children);
  }
  return '';
}

describe('DriverPhotoScreen D-AX-17', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (uploadStopPhoto as jest.Mock).mockResolvedValue({
      photoType: 'DELIVERY',
      fileName: 'photo-1.jpg',
      fileSize: 1024,
      contentType: 'image/jpeg',
      uploadedAt: '2026-05-15T13:10:00',
      downloadUrl: null,
      attachmentId: '11111111-2222-3333-4444-555555555555',
    });
  });

  it('정차 target이 없으면 배차 탭 선택 안내만 보여준다', () => {
    const utils = render(<DriverPhotoScreen {...defaultProps} target={null} />);

    expect(utils.getByText('배차 탭에서 정차를 선택해 주세요')).toBeTruthy();
    expect(utils.queryByTestId('arologis-photo-upload-all')).toBeNull();
  });

  it('DELIVERY는 최대 3장, INSPECTION은 최대 5장으로 전환한다', () => {
    const utils = render(<DriverPhotoScreen {...defaultProps} />);

    expect(textContent(utils.getByTestId('photo-capture-title'))).toContain('배송 사진');
    expect(textContent(utils.getByTestId('photo-capture-max'))).toBe('max-3');

    fireEvent.press(utils.getByTestId('arologis-photo-type-inspection'));

    expect(textContent(utils.getByTestId('photo-capture-title'))).toContain('검수 사진');
    expect(textContent(utils.getByTestId('photo-capture-max'))).toBe('max-5');
  });

  it('사진 일괄 업로드가 UUID-free today 정차 target과 메타데이터를 전달한다', async () => {
    const utils = render(<DriverPhotoScreen {...defaultProps} />);

    fireEvent.press(utils.getByTestId('mock-add-photo'));
    fireEvent.press(utils.getByTestId('arologis-photo-upload-all'));

    await waitFor(() => expect(uploadStopPhoto).toHaveBeenCalledTimes(1));
    expect(uploadStopPhoto).toHaveBeenCalledWith('jwt-x', 'NIGHT', 7, 3, 'DELIVERY', {
      uri: 'file:///cache/photo-1.jpg',
      fileName: 'photo-1.jpg',
      mimeType: 'image/jpeg',
      exifGpsLat: 37.1234567,
      exifGpsLng: 127.7654321,
      capturedAt: '2026-05-15T13:00:00',
      parsedKakaoSeq: 4567,
    });

    expect(await utils.findByText('완료 1')).toBeTruthy();
    expect(utils.queryByText('11111111-2222-3333-4444-555555555555')).toBeNull();
  });

  it('업로드 실패 메시지를 한국어로 매핑하고 실패 사진만 재시도한다', async () => {
    (uploadStopPhoto as jest.Mock)
      .mockRejectedValueOnce(new ArologisApiError(413, 'payload too large'))
      .mockResolvedValueOnce({
        photoType: 'DELIVERY',
        fileName: 'photo-1.jpg',
        fileSize: 1024,
        contentType: 'image/jpeg',
        uploadedAt: '2026-05-15T13:10:00',
        downloadUrl: null,
      });
    const utils = render(<DriverPhotoScreen {...defaultProps} />);

    fireEvent.press(utils.getByTestId('mock-add-photo'));
    fireEvent.press(utils.getByTestId('arologis-photo-upload-all'));

    expect(await utils.findByText('파일이 너무 큽니다. 다시 촬영하거나 다른 사진을 선택해 주세요.')).toBeTruthy();
    fireEvent.press(utils.getByTestId('arologis-photo-retry-failed'));

    await waitFor(() => expect(uploadStopPhoto).toHaveBeenCalledTimes(2));
    expect(await utils.findByText('완료 1')).toBeTruthy();
  });
});
