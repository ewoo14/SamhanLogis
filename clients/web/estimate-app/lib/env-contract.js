'use strict';

const LEGACY_NAVER_ENV_NAMES = {
  SAMHAN_NAVER_SEARCH_CLIENT_ID: 'NAVER_SEARCH_CLIENT_ID',
  SAMHAN_NAVER_SEARCH_CLIENT_SECRET: 'NAVER_SEARCH_CLIENT_SECRET',
  SAMHAN_NCP_MAP_KEY_ID: 'NAVER_MAP_KEY_ID',
  SAMHAN_NCP_MAP_KEY: 'NAVER_MAP_KEY',
  SAMHAN_JUSO_CONFM_KEY: 'JUSO_ROAD_API_KEY',
};

/**
 * 네이버 환경변수는 선택 기능이지만, 알려진 오기 이름은 조용히 무시하지 않는다.
 * canonical 이름이 없을 때만 실패시켜 잘못된 enabled:false를 방지한다.
 */
function assertCanonicalNaverEnvironment(env) {
  const source = env || process.env;
  const mismatches = Object.entries(LEGACY_NAVER_ENV_NAMES)
    .filter(([legacyName, canonicalName]) => source[legacyName] && !source[canonicalName])
    .map(([legacyName, canonicalName]) => `${legacyName} -> ${canonicalName}`);

  if (mismatches.length) {
    throw new Error(`[env] 네이버 환경변수 이름이 코드 정본과 다릅니다: ${mismatches.join(', ')}`);
  }
}

function assertEstimateServiceEnvironment(env) {
  const source = env || process.env;
  if (!String(source.ESTIMATE_SERVICE_URL || '').trim()) {
    throw new Error(
      '[env] ESTIMATE_SERVICE_URL이 필요합니다. 내부 스냅샷은 게이트웨이 fallback 없이 slip-service에 직결해야 합니다.',
    );
  }
}

module.exports = {
  assertCanonicalNaverEnvironment,
  assertEstimateServiceEnvironment,
};
