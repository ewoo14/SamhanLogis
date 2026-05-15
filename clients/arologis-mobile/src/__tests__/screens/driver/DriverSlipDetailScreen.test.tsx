import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

jest.mock('../../../api/arologis', () => ({
  ArologisApiError: class ArologisApiError extends Error {
    public readonly status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
      this.name = 'ArologisApiError';
    }
  },
  fetchStopSlipDetail: jest.fn(),
  fetchTodayDispatches: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => {
  const ReactActual = jest.requireActual('react');
  const RN = jest.requireActual('react-native');

  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => ReactActual.createElement(RN.View, null, children),
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => ReactActual.createElement(RN.View, null, children),
  };
});

jest.mock('../../../screens/driver/DriverPhotoScreen', () => {
  const ReactActual = jest.requireActual('react');
  const RN = jest.requireActual('react-native');

  return {
    __esModule: true,
    default: () => ReactActual.createElement(RN.Text, null, '사진 화면'),
  };
});

jest.mock('../../../screens/driver/DriverSignatureScreen', () => {
  const ReactActual = jest.requireActual('react');
  const RN = jest.requireActual('react-native');

  return {
    __esModule: true,
    default: () => ReactActual.createElement(RN.Text, null, '서명 화면'),
  };
});

import { ArologisApiError, fetchStopSlipDetail, fetchTodayDispatches } from '../../../api/arologis';
import DriverSlipDetailScreen from '../../../screens/driver/DriverSlipDetailScreen';
import DriverTabNavigator from '../../../screens/driver/DriverTabNavigator';

const target = {
  dispatchType: 'NIGHT' as const,
  vehicleSequence: 7,
  stopSequence: 3,
  parsedKakaoSeq: 4567,
  stopLabel: '테스트상사 / 서울 강남구 테스트로 1 / 카톡 순번 4567',
  partnerName: '테스트상사',
};

const detail = {
  dispatchType: 'NIGHT' as const,
  vehicleSequence: 7,
  stopSequence: 3,
  parsedKakaoSeq: 4567,
  stopLabel: '테스트상사 / 서울 강남구 테스트로 1 / 카톡 순번 4567',
  slipDate: '2026-05-15',
  slipNo: 'SL-20260515-001',
  partnerName: '테스트상사',
  deliveryAddress: '서울 강남구 테스트로 1',
  sourceWarehouseName: '삼한 본창고',
  totalSupply: 30000,
  vat: 3000,
  total: 33000,
  lines: [
    {
      productName: '테스트 품목',
      specification: '10kg',
      quantity: 2,
      unitPrice: 15000,
      lineTotal: 30000,
    },
  ],
};

const defaultProps = {
  token: 'jwt-x',
  target,
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

describe('DriverSlipDetailScreen D-AX-18', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetchStopSlipDetail as jest.Mock).mockResolvedValue(detail);
    (fetchTodayDispatches as jest.Mock).mockResolvedValue([
      {
        dispatchDate: '2026-05-15',
        dispatchType: 'NIGHT',
        vehicleSequence: 7,
        tonnage: 'TONNAGE_1',
        label: '강남',
        status: 'ASSIGNED',
        stops: [
          {
            stopSequence: 3,
            rawText: '서울 강남구 테스트로 1 (테스트상사-4567)',
            parsedAddress: '서울 강남구 테스트로 1',
            parsedPartnerName: '테스트상사',
            parsedKakaoSeq: 4567,
            status: 'PENDING',
          },
        ],
      },
    ]);
  });

  it('정차 target이 없으면 배차 탭 선택 안내와 뒤로가기만 보여준다', () => {
    const utils = render(<DriverSlipDetailScreen {...defaultProps} target={null} />);

    expect(utils.getByText('배차 탭에서 정차를 선택해 주세요')).toBeTruthy();
    expect(utils.queryByTestId('arologis-slip-detail-retry')).toBeNull();
    fireEvent.press(utils.getByText('배차로 이동'));
    expect(defaultProps.onBackToDashboard).toHaveBeenCalledTimes(1);
  });

  it('로딩 후 전표번호, 거래처, 주소, 창고, 품목, 합계를 표시하고 내부 식별자를 렌더하지 않는다', async () => {
    const utils = render(<DriverSlipDetailScreen {...defaultProps} />);

    expect(utils.getByText('전표 상세 불러오는 중...')).toBeTruthy();
    await waitFor(() => expect(fetchStopSlipDetail).toHaveBeenCalledWith('jwt-x', 'NIGHT', 7, 3, { parsedKakaoSeq: 4567 }));

    expect(await utils.findByText('SL-20260515-001')).toBeTruthy();
    expect(utils.getByText('테스트상사')).toBeTruthy();
    expect(utils.getByText('2026-05-15')).toBeTruthy();
    expect(utils.getByText('서울 강남구 테스트로 1')).toBeTruthy();
    expect(utils.getByText('삼한 본창고')).toBeTruthy();
    expect(utils.getByText('테스트 품목')).toBeTruthy();
    expect(utils.getByText('33,000원')).toBeTruthy();
    expect(JSON.stringify(utils.toJSON())).not.toContain('11111111-2222-3333-4444-555555555555');
    expect(JSON.stringify(utils.toJSON())).not.toContain('downloadUrl');
  });

  it('422 매핑 실패는 재시도 없이 사무실 확인과 배차 복귀를 안내한다', async () => {
    (fetchStopSlipDetail as jest.Mock).mockRejectedValueOnce(new ArologisApiError(422, 'SLIP_MAPPING_NOT_FOUND'));

    const utils = render(<DriverSlipDetailScreen {...defaultProps} />);

    expect(await utils.findByText('정차와 연결된 전표를 찾을 수 없습니다.')).toBeTruthy();
    expect(utils.getByText('사무실에서 전표 연결 상태를 확인해야 합니다.')).toBeTruthy();
    expect(utils.queryByTestId('arologis-slip-detail-retry')).toBeNull();
    fireEvent.press(utils.getByText('배차 탭으로 돌아가기'));
    expect(defaultProps.onBackToDashboard).toHaveBeenCalledTimes(1);
    expect(fetchStopSlipDetail).toHaveBeenCalledTimes(1);
  });

  it('502 상세 조회 실패는 같은 target으로 재시도한다', async () => {
    (fetchStopSlipDetail as jest.Mock)
      .mockRejectedValueOnce(new ArologisApiError(502, 'SLIP_DETAIL_FETCH_FAILED'))
      .mockResolvedValueOnce(detail);

    const utils = render(<DriverSlipDetailScreen {...defaultProps} />);

    expect(await utils.findByText('전표 상세를 불러오지 못했습니다.')).toBeTruthy();
    expect(utils.getByText('잠시 후 다시 시도해 주세요.')).toBeTruthy();
    fireEvent.press(utils.getByTestId('arologis-slip-detail-retry'));
    expect(await utils.findByText('SL-20260515-001')).toBeTruthy();
    expect(fetchStopSlipDetail).toHaveBeenCalledTimes(2);
  });

  it('401/403 권한 오류는 재시도 없이 권한 확인을 안내한다', async () => {
    (fetchStopSlipDetail as jest.Mock).mockRejectedValueOnce(new ArologisApiError(403, 'FORBIDDEN'));

    const utils = render(<DriverSlipDetailScreen {...defaultProps} />);

    expect(await utils.findByText('기사 권한을 확인해 주세요.')).toBeTruthy();
    expect(utils.getByText('다시 로그인하거나 사무실에 문의해 주세요.')).toBeTruthy();
    expect(utils.queryByTestId('arologis-slip-detail-retry')).toBeNull();
  });

  it('dashboard 정차 행의 전표 버튼으로 하단 탭 추가 없이 상세 화면으로 진입한다', async () => {
    (fetchStopSlipDetail as jest.Mock).mockResolvedValueOnce({
      ...detail,
      id: '11111111-2222-3333-4444-555555555555',
      slipId: '22222222-3333-4444-5555-666666666666',
      downloadUrl: 'https://storage.example/slip.pdf',
    });
    const utils = render(<DriverTabNavigator token="jwt-x" driverCode="DR-2026-001" backgroundGranted />);

    await waitFor(() => expect(fetchTodayDispatches).toHaveBeenCalledTimes(1));
    expect(utils.queryByTestId('arologis-tab-detail')).toBeNull();

    fireEvent.press(await utils.findByTestId('arologis-open-slip-detail-7-3'));

    expect(await utils.findByText('SL-20260515-001')).toBeTruthy();
    expect(fetchStopSlipDetail).toHaveBeenCalledWith('jwt-x', 'NIGHT', 7, 3, { parsedKakaoSeq: 4567 });
    expect(textContent(utils.toJSON())).not.toContain('11111111-2222-3333-4444-555555555555');
    expect(textContent(utils.toJSON())).not.toContain('downloadUrl');
  });
});
