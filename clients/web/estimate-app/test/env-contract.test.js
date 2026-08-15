const {
  assertCanonicalNaverEnvironment,
  assertEstimateServiceEnvironment,
} = require('../lib/env-contract');

describe('네이버 환경변수 계약', () => {
  test('SAMHAN_ 오기 이름만 주입되면 조용히 비활성화하지 않고 실패한다', () => {
    expect(() => assertCanonicalNaverEnvironment({
      SAMHAN_NAVER_SEARCH_CLIENT_ID: 'redacted',
      SAMHAN_NAVER_SEARCH_CLIENT_SECRET: 'redacted',
      SAMHAN_NCP_MAP_KEY_ID: 'redacted',
      SAMHAN_NCP_MAP_KEY: 'redacted',
      SAMHAN_JUSO_CONFM_KEY: 'redacted',
    })).toThrow(/NAVER_SEARCH_CLIENT_ID|JUSO_ROAD_API_KEY/);
  });

  test('코드 정본 이름이 모두 있으면 통과한다', () => {
    expect(() => assertCanonicalNaverEnvironment({
      NAVER_SEARCH_CLIENT_ID: 'redacted',
      NAVER_SEARCH_CLIENT_SECRET: 'redacted',
      NAVER_MAP_KEY_ID: 'redacted',
      NAVER_MAP_KEY: 'redacted',
      JUSO_ROAD_API_KEY: 'redacted',
    })).not.toThrow();
  });
});

describe('snapshot service environment', () => {
  test('ESTIMATE_SERVICE_URL이 없으면 게이트웨이 fallback을 허용하지 않는다', () => {
    expect(() => assertEstimateServiceEnvironment({
      SAMHAN_API_BASE_URL: 'http://gateway.example',
    })).toThrow(/ESTIMATE_SERVICE_URL/);
  });

  test('ESTIMATE_SERVICE_URL이 있으면 직결 설정으로 통과한다', () => {
    expect(() => assertEstimateServiceEnvironment({
      ESTIMATE_SERVICE_URL: 'http://slip-service.example',
    })).not.toThrow();
  });
});
