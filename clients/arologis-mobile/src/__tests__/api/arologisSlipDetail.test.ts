jest.mock('../../api/client', () => ({
  apiFetchRaw: jest.fn(),
}));

import { apiFetchRaw } from '../../api/client';
import { fetchStopSlipDetail } from '../../api/arologis';

describe('fetchStopSlipDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (apiFetchRaw as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        success: true,
        data: {
          id: '11111111-2222-3333-4444-555555555555',
          dispatchId: '11111111-2222-3333-4444-555555555555',
          vehicleId: '22222222-3333-4444-5555-666666666666',
          stopId: '33333333-4444-5555-6666-777777777777',
          slipId: '22222222-3333-4444-5555-666666666666',
          downloadUrl: 'https://storage.example/slip.pdf',
          dispatchType: 'NIGHT',
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
        },
      }),
    } as unknown as Response);
  });

  it('today 정차 전표 상세 경로에 Accept JSON만 전송하고 parsedKakaoSeq query를 붙인다', async () => {
    const result = await fetchStopSlipDetail('jwt-x', 'NIGHT', 7, 3, { parsedKakaoSeq: 4567 });

    expect(result.slipNo).toBe('SL-20260515-001');
    expect(result.dispatchType).toBe('NIGHT');
    expect(result.vehicleSequence).toBe(7);
    expect(result.stopSequence).toBe(3);
    expect(result.parsedKakaoSeq).toBe(4567);
    expect(result.stopLabel).toContain('테스트상사');
    expect(result.slipDate).toBe('2026-05-15');
    expect(apiFetchRaw).toHaveBeenCalledTimes(1);
    const [path, init] = (apiFetchRaw as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/driver-app/arologis/dispatches/today/NIGHT/vehicles/7/stops/3/slip-detail?parsedKakaoSeq=4567');
    expect(init.method).toBe('GET');
    expect(init.headers).toEqual({ Accept: 'application/json' });
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('parsedKakaoSeq가 없으면 query 없이 호출하고 응답에서 내부 식별자와 다운로드 URL을 제거한다', async () => {
    const result = await fetchStopSlipDetail('jwt-x', 'DAY', 2, 1, {});

    expect(apiFetchRaw).toHaveBeenCalledTimes(1);
    const [path] = (apiFetchRaw as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/driver-app/arologis/dispatches/today/DAY/vehicles/2/stops/1/slip-detail');
    expect(JSON.stringify(result)).not.toContain('11111111-2222-3333-4444-555555555555');
    expect(JSON.stringify(result)).not.toContain('22222222-3333-4444-5555-666666666666');
    expect(JSON.stringify(result)).not.toContain('33333333-4444-5555-6666-777777777777');
    expect(JSON.stringify(result)).not.toContain('downloadUrl');
  });
});
