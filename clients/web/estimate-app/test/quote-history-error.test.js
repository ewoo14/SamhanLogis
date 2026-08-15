const mockSnapshotGet = jest.fn();

jest.mock('axios', () => ({
  create: jest.fn(() => ({ get: mockSnapshotGet })),
}));

const code = require('../lib/code');

describe('견적 저장본 조회 결과 계약', () => {
  beforeEach(() => mockSnapshotGet.mockReset());

  test('snapshot endpoint 404는 빈 배열이 아니라 실패로 드러난다', async () => {
    mockSnapshotGet.mockResolvedValue({ status: 404, data: { path: '/internal/estimates/snapshots' } });

    await expect(code.getQuoteHistory('2026-08-09', '2026-08-15'))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  test('정상 endpoint 응답의 최근 저장본 2건은 그대로 화면 계약으로 전달된다', async () => {
    const rows = [
      { id: 'snapshot-1', data: { summary: { custName: 'A' } } },
      { id: 'snapshot-2', data: { summary: { custName: 'B' } } },
    ];
    mockSnapshotGet.mockResolvedValue({ status: 200, data: { success: true, data: rows } });

    await expect(code.getQuoteHistory('2026-08-09', '2026-08-15')).resolves.toEqual(rows);
  });
});
