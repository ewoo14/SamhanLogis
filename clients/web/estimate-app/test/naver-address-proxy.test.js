const fs = require('fs');
const path = require('path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const order = fs.readFileSync(
  path.join(__dirname, '..', '..', 'order-app', 'index.html'),
  'utf8',
);
const api = fs.readFileSync(
  path.join(__dirname, '..', '..', 'order-app', 'src', 'samhanApi.ts'),
  'utf8',
);
const main = fs.readFileSync(
  path.join(__dirname, '..', '..', 'order-app', 'src', 'main.ts'),
  'utf8',
);
const code = fs.readFileSync(path.join(__dirname, '..', 'lib', 'code.js'), 'utf8');

describe('네이버 주소검색 서버 프록시', () => {
  test('Express 서버가 키 상태와 검색 endpoint를 제공한다', () => {
    expect(server).toContain("app.get('/address-search/status'");
    expect(server).toContain("app.post('/address-search'");
  });

  test('정적 주문 앱에는 네이버 비밀키가 없고 서버 endpoint만 호출한다', () => {
    expect(order).toContain('btnAddrShipNaver');
    expect(order).toContain('btnAddrAuditNaver');
    expect(api).toContain('searchNaverAddress');
    expect(order).not.toMatch(/X-Naver-Client-Secret|NAVER_SEARCH_SECRET|NAVER_MAP_KEY/);
  });

  test('카카오 주소검색 버튼은 별도 경로로 계속 남는다', () => {
    expect(order).toContain('btnAddrShipKakao');
    expect(order).toContain('btnAddrAuditKakao');
    expect(order).toContain('openPostcode()');
  });

  test('키 미설정은 버튼 숨김 또는 명확한 안내 계약을 갖는다', () => {
    expect(main).toContain('address-search-capability');
    expect(code).toContain('주소검색 자격(env) 미설정입니다.');
  });
});
