/**
 * estimate-app v2 — Node.js + Express + EJS bootstrap.
 *
 * Apps Script HtmlService 환경을 1:1 흉내내는 Express 서버.
 * - GET /            → views/index.ejs (legacy index.html 변환본) render
 * - GET /healthz     → 헬스체크
 * - POST /rpc/:fn    → google.script.run 호환 RPC dispatch
 * - public/*         → 정적 자산 (logo / font / stamp / samhan 인감 등)
 */

'use strict';

const path = require('path');
// 네이버 자격증명은 추적되지 않는 infrastructure/.env.local 또는 배포 환경변수에서만 읽는다.
require('dotenv').config({ path: path.resolve(__dirname, '../../../infrastructure/.env.local') });
const {
  assertCanonicalNaverEnvironment,
  assertEstimateServiceEnvironment,
} = require('./lib/env-contract');
assertCanonicalNaverEnvironment();
assertEstimateServiceEnvironment();
const express = require('express');
const helmet = require('helmet');
const code = require('./lib/code');

const app = express();

// EJS view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 보안 헤더 (Phase 7 5/6차 정식 — helmet middleware 도입).
//
// Phase 7 2~3차 의 inline CSP middleware → helmet contentSecurityPolicy directive 로 정식화.
// 효과:
//   - HSTS / CSP / X-Frame-Options / Referrer-Policy / X-Content-Type-Options /
//     Permissions-Policy / X-DNS-Prefetch-Control / X-Download-Options / X-Permitted-Cross-Domain-Policies
//     까지 helmet 기본 묶음 적용 (이전 inline middleware 보다 보강).
//   - CSP directive 는 order-app 의 _headers (Cloudflare Pages) 와 1:1 정합.
//   - script-src: 카카오 우편번호 (t1.kakaocdn.net) + html2canvas/jspdf (cdnjs.cloudflare.com).
//   - font-src 'self' data: — Phase 7 5/6차 self-host @font-face 로 외부 도메인 의존 제거.
//   - connect-src: dev 에서는 localhost API 호출 허용, production 은 *.samhan-air.com 만.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "'unsafe-eval'",
        'https://t1.kakaocdn.net',
        'https://cdnjs.cloudflare.com',
      ],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: process.env.NODE_ENV === 'production'
        ? ["'self'", 'https://*.samhan-air.com']
        : ["'self'", 'https://*.samhan-air.com', 'http://localhost:*', 'http://127.0.0.1:*'],
      frameAncestors: ["'self'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  frameguard: { action: 'sameorigin' },
  // helmet 기본값 외 추가 헤더 — 인쇄 / 카메라 / 마이크 / 위치 정보 권한 차단.
  crossOriginEmbedderPolicy: false, // legacy 외부 script (카카오/cdnjs) 호환
}));

// helmet 이 처리하지 않는 잔여 헤더 (Permissions-Policy 는 5.x 부터 지원).
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// JSON body
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 주문서 정적 앱의 네이버 주소검색 프록시. 키는 이 Express 프로세스에만 존재하며,
// 브라우저에는 enabled 상태와 주소 결과만 반환한다.
const orderAppOrigin = process.env.ORDER_APP_ORIGIN || 'https://order.samhan-air.com';
function allowOrderAppOrigin(req, res) {
  const origin = req.headers.origin;
  if (origin && (origin === orderAppOrigin || origin === 'http://localhost:5180')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
}

function allowAddressSearchCors(req, res) {
  allowOrderAppOrigin(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

app.options('/address-search', (req, res) => {
  allowAddressSearchCors(req, res);
  res.sendStatus(204);
});

app.get('/address-search/status', (req, res) => {
  allowAddressSearchCors(req, res);
  res.json({
    ok: true,
    enabled: Boolean(
      (process.env.NAVER_SEARCH_CLIENT_ID && process.env.NAVER_SEARCH_CLIENT_SECRET)
      || (process.env.NAVER_MAP_KEY_ID && process.env.NAVER_MAP_KEY)
      || process.env.JUSO_ROAD_API_KEY,
    ),
  });
});

app.post('/address-search', async (req, res, next) => {
  allowAddressSearchCors(req, res);
  try {
    const query = String(req.body && req.body.query || '').trim();
    if (!query) return res.status(400).json({ ok: false, error: '검색어가 비었습니다.', items: [] });
    const result = await code.searchNaverAddress(query);
    if (!result.ok && result.error === '주소검색 자격(env) 미설정입니다.') {
      return res.status(503).json(result);
    }
    return res.json(result);
  } catch (err) {
    return next(err);
  }
});

// 정적 자산
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  },
}));

// 라우터
app.use('/', require('./routes/index'));
app.use('/rpc', require('./routes/rpc'));

// 에러 핸들러
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('[express] 에러:', err);
  res.status(500).json({
    ok: false,
    error: String(err.message || err),
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
  });
});

const PORT = parseInt(process.env.PORT || '5183', 10);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[estimate-app] v2 listening on http://localhost:${PORT}`);
    console.log(`[estimate-app] SAMHAN_API_BASE_URL=${process.env.SAMHAN_API_BASE_URL || '(default)'}`);
    console.log(`[estimate-app] SLIP_SERVICE_URL=${process.env.SLIP_SERVICE_URL || '(default :8086)'}`);
  });
}

module.exports = app;
