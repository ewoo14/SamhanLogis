const mockSnapshotGet = jest.fn();

jest.mock('axios', () => ({
  create: jest.fn(() => ({ get: mockSnapshotGet })),
}));

const code = require('../lib/code');
const express = require('express');
const http = require('http');
const rpcRouter = require('../routes/rpc');
const { cookieHeader } = require('../lib/auth-context');

function postRpc(fnName, body, headers = {}) {
  const app = express();
  app.use(express.json());
  app.use('/rpc', rpcRouter);
  const server = http.createServer(app);
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const request = http.request({
        hostname: '127.0.0.1',
        port,
        path: `/rpc/${fnName}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
      }, (response) => {
        let raw = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => { raw += chunk; });
        response.on('end', () => {
          server.close(() => resolve({ status: response.statusCode, body: JSON.parse(raw) }));
        });
      });
      request.on('error', (error) => server.close(() => reject(error)));
      request.end(JSON.stringify(body));
    });
  });
}
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

describe('종합견적서 발송내역 로그인 식별자 연결', () => {
  const historyCall = () => mockSnapshotGet.mock.calls.at(-1);

  beforeEach(() => {
    mockSnapshotGet.mockImplementation(async (_url, config) => {
      const headers = config?.headers || {};
      if (!headers.authorization || !headers['x-user-id']) {
        return { status: 401, data: { message: '인증 필요' } };
      }
      if (headers['x-is-partner'] === 'true') {
        return { status: 403, data: { message: '[SP-PO-1] 동적 권한 deny — page=sales.partner-order.history action=VIEW' } };
      }
      return { status: 200, data: { success: true, data: { content: [{ slipNo: 'H-1' }] } } };
    });
  });

  test('RPC 배선은 직원 인증을 upstream에 전달하고 attestation 계약명을 보존한다', async () => {
    const response = await postRpc('getNotionHistory', {
      args: ['2000-01-01', '2100-01-01', '출고일', '211-87-12345'],
    }, {
      Cookie: cookieHeader('employee@example.com'),
      Authorization: 'Bearer employee-jwt',
      'X-User-Id': 'employee-001',
      'X-Is-Partner': 'false',
      'X-Partner-Code': '2118712345',
      'X-Samhan-Gateway-Attestation': 'gateway-attestation',
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, result: [{ slipNo: 'H-1', date: '', custName: '' }] });
    expect(historyCall()[1].headers).toEqual(expect.objectContaining({
      authorization: 'Bearer employee-jwt',
      'x-user-id': 'employee-001',
      'x-is-partner': 'false',
      'x-partner-code': '2118712345',
      'x-samhan-gateway-attestation': 'gateway-attestation',
    }));
    expect(historyCall()[1].headers).not.toHaveProperty('cookie');
    expect(historyCall()[1].headers).not.toHaveProperty('x-gateway-attestation');
  });

  test('일반 RPC에는 identity 헤더를 전달하지 않는다', async () => {
    mockSnapshotGet.mockResolvedValue({ status: 200, data: { success: true, data: [] } });

    const response = await postRpc('getQuoteHistory', {
      args: ['2000-01-01', '2100-01-01'],
    }, {
      Cookie: cookieHeader('employee@example.com'),
      Authorization: 'Bearer employee-jwt',
      'X-User-Id': 'employee-001',
      'X-Samhan-Gateway-Attestation': 'gateway-attestation',
    });

    expect(response.status).toBe(200);
    expect(mockSnapshotGet.mock.calls.at(-1)[1].headers).toEqual({
      'X-Internal-Token': expect.any(String),
    });
  });
});

describe('종합견적서 발송내역 로그인 식별자 연결', () => {
  test('인증 응답에서 사업자번호를 선택해 CURRENT_BIZNO를 채울 수 있다', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '../views/index.ejs'), 'utf8');
    const start = source.indexOf('function resolveCurrentBizno');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = source.indexOf('\n}', start) + 2;
    const vm = require('vm');
    const context = {};
    vm.createContext(context);
    vm.runInContext(source.slice(start, end), context);
    expect(context.resolveCurrentBizno({ bizNo: '211-87-12345', partnerCode: '2118712345' }))
      .toBe('211-87-12345');
  });

  test('발송내역 식별자는 인증 직원이 아니라 화면에서 선택한 거래처의 bizno를 사용한다', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '../views/index.ejs'), 'utf8');
    const start = source.indexOf('function resolveHistoryBizno');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = source.indexOf('\n}', start) + 2;
    const vm = require('vm');
    const context = {};
    vm.createContext(context);
    vm.runInContext(source.slice(start, end), context);
    expect(context.resolveHistoryBizno({ bizno: '211-87-12345', code: 'P-211' }))
      .toBe('211-87-12345');
    expect(context.resolveHistoryBizno({ bizno: '334-26-10558', code: 'P-334' }))
      .not.toBe('211-87-12345');
  });

  test('발송내역 조회 호출은 선택 거래처 식별자를 전달한다', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '../views/index.ejs'), 'utf8');
    expect(source).toContain('resolveHistoryBizno(selectedCustomer)');
    expect(source).toContain('.getNotionHistory(sDate, eDate, dateField, CURRENT_HISTORY_BIZNO)');
  });

  test('선택 거래처가 바뀌면 history 요청도 그 거래처 키로만 바뀐다', async () => {
    mockSnapshotGet.mockClear();
    mockSnapshotGet.mockResolvedValue({ status: 200, data: { success: true, data: { content: [] } } });

    await code.getNotionHistory('2026-08-01', '2026-08-16', '출고일', '211-87-12345');
    await code.getNotionHistory('2026-08-01', '2026-08-16', '출고일', '334-26-10558');

    expect(mockSnapshotGet).toHaveBeenNthCalledWith(1,
      expect.stringContaining('/api/v1/partner-orders/history'),
      expect.objectContaining({ params: expect.objectContaining({ bizCode: '211-87-12345' }) }));
    expect(mockSnapshotGet).toHaveBeenNthCalledWith(2,
      expect.stringContaining('/api/v1/partner-orders/history'),
      expect.objectContaining({ params: expect.objectContaining({ bizCode: '334-26-10558' }) }));
  });

  test('partner-order history ApiResponse 안의 Page content를 화면 행으로 언래핑한다', async () => {
    const rows = [{ date: '2026-08-16', slipNo: '2026/08/16-1', custName: '', isDeleted: true }];
    mockSnapshotGet.mockResolvedValue({ status: 200, data: { success: true, data: { content: rows } } });

    await expect(code.getNotionHistory(
      '2026-08-01', '2026-08-16', '출고일', '211-87-12345',
    )).resolves.toEqual(rows);
  });

  describe('history upstream 직원 인증 전달 — 적대검증 RED', () => {
    const historyCall = () => mockSnapshotGet.mock.calls.at(-1);

    beforeEach(() => {
      mockSnapshotGet.mockImplementation(async (_url, config) => {
        const headers = config?.headers || {};
        if (!headers.Authorization || !headers['X-User-Id']) {
          return { status: 401, data: { message: '인증 필요' } };
        }
        if (headers['X-Is-Partner'] === 'true') {
          return { status: 403, data: { message: '[SP-PO-1] 동적 권한 deny — page=sales.partner-order.history action=VIEW' } };
        }
        return { status: 200, data: { success: true, data: { content: [{ slipNo: 'H-1' }] } } };
      });
    });

    test('인증된 직원은 history upstream에서 200을 받고 목록을 받는다', async () => {
      await expect(code.getNotionHistory(
        '2000-01-01', '2100-01-01', '출고일', '211-87-12345',
        {
          Authorization: 'Bearer employee-jwt',
          'X-User-Id': 'employee-001',
          'X-Is-Partner': 'false',
          'X-Partner-Code': '2118712345',
        },
      )).resolves.toEqual([{ slipNo: 'H-1', date: '', custName: '' }]);
      expect(historyCall()[1].headers).toEqual(expect.objectContaining({
        Authorization: 'Bearer employee-jwt',
        'X-User-Id': 'employee-001',
        'X-Is-Partner': 'false',
        'X-Partner-Code': '2118712345',
      }));
    });

    test('권한 없는 직원은 history upstream의 403 계약을 그대로 받는다', async () => {
      await expect(code.getNotionHistory(
        '2000-01-01', '2100-01-01', '출고일', '211-87-12345',
        {
          Authorization: 'Bearer employee-jwt',
          'X-User-Id': 'employee-002',
          'X-Is-Partner': 'true',
          'X-Partner-Code': '2118712345',
        },
      )).rejects.toMatchObject({
        statusCode: 403,
        message: expect.stringContaining('[SP-PO-1] 동적 권한 deny'),
      });
    });
  });
});
