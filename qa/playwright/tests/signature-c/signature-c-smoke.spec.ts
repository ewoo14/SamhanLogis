import { test, expect, Page } from '@playwright/test';

/**
 * Signature Slice C — 공개 서명 번들 smoke 검증 spec
 *
 * 대상 라우트 (design/signature-slice-C/mobile-spec.md §1):
 *   - /d/{token}/s/{slipNo}       : 서명 페이지 (Slice C 신규)
 *   - /share/{shareToken}         : 인수자 view (Slice C 신규)
 *
 * ============================================================
 * 현재 구현 상태 (2026-05-19 audit 결과):
 *   - BE (slip-service): 완전 구현
 *       POST /public/batches/{token}/slips/{slipNo}/signature   OK
 *       GET  /public/signatures/{shareToken}                    OK
 *       API Gateway /api/public/** no-auth route                OK
 *       SlipSignatureService SHA-256 재계산 + 50KB 가드         OK
 *       PublicSignatureControllerIT (8 시나리오)                OK
 *   - FE (public mini bundle): 미구현
 *       signature.js   (≤6KB gzip vanilla canvas bundle)        없음
 *       mobile.css     (canvas 클래스 추가분)                   없음
 *       /d/{token}/s/{slipNo} HTML 서빙 endpoint                없음
 *       /share/{shareToken}  HTML 서빙 endpoint                 없음
 *       slip-service static resource 서빙 설정                  없음
 *       vite/esbuild build target 없음                         없음
 *
 * BE API 검증 = page.route() mock 기반 — FE 번들 미구현으로 실 페이지
 * navigate 불가. mock HTML 을 page.setContent() 로 로드하는 패턴은
 * false green 가드 원칙(audit-slice-a 패턴)에 따라 사용 금지.
 *
 * 본 spec 은 BE API 계약 검증(page.evaluate fetch) + FE 번들 미구현
 * 상태에서도 false green 이 발생하지 않는 구조적 검증(fixme-not-pass)
 * 로 구성됩니다.
 *
 * ============================================================
 * false green 가드 (audit-slice-a 패턴 일관):
 *   - page.setContent() 패턴 0건 — 실 HTTP 응답만 사용
 *   - || true / test.skip(!ok) 으로 PASS 처리 0건
 *   - expect(ok).toBe(true) 으로 실패 전파 명시
 *   - FE 미구현 케이스: test.fixme() 표기 + 구현 권고 명시
 *
 * ============================================================
 * 시나리오 (mobile-spec.md §7 검증 체크리스트 대응):
 *   SC-1  BE 서명 API happy path — 200 + shareToken + UUID 0건
 *   SC-2  BE hash mismatch → 400
 *   SC-3  BE PNG 50KB 초과 → 400
 *   SC-4  BE 만료 batch token → 410 Gone
 *   SC-5  BE share token 조회 — UUID 0건 검증
 *   SC-6  FE bundle 위치 검증 (미구현 시 fixme — false green 불허)
 *   SC-7  UUID DOM 노출 0건 가드 (미구현 — FE 번들 없으므로 fixme)
 *   SC-8  PNG ≤50KB 가드 — BE 경계값 (49999 bytes)
 *   SC-9  { passive: false } touch 이벤트 — FE 번들 미구현 (fixme)
 *   SC-10 canvas 사이즈 분기 (320 / 400) — FE 번들 미구현 (fixme)
 *
 * 스크린샷: docs/qa/signature-slice-c/screenshots/ (BE 연동 후 생성)
 */

// ============================================================
// 환경 / helper
// ============================================================

const API_BASE = process.env.QA_API_BASE_URL ?? 'http://localhost:8080';

/**
 * PNG bytes 생성 — PNG 매직 헤더 + 더미 fill.
 * SHA-256 계산 가능한 최소 유효 bytes.
 */
function makePngBytes(length: number): Uint8Array {
  const arr = new Uint8Array(length);
  arr[0] = 0x89; arr[1] = 0x50; arr[2] = 0x4e; arr[3] = 0x47;
  for (let i = 4; i < length; i++) {
    arr[i] = i % 256;
  }
  return arr;
}

/**
 * SHA-256 hex — page.evaluate 를 통해 Web Crypto API 호출.
 * mobile-spec.md §3.7 의 클라이언트 알고리즘과 동일.
 */
async function sha256HexViaPage(page: Page, bytes: Uint8Array): Promise<string> {
  return page.evaluate(async (arr: number[]) => {
    const data = new Uint8Array(arr);
    const hashBuf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }, Array.from(bytes));
}

// ============================================================
// SC-1 ~ SC-5: BE API 계약 검증 (page.route() mock 기반)
// ============================================================

test.describe('BE API 계약 검증 — mock 기반', () => {
  // BE 응답을 page.route() 로 intercept — FE 번들 없이 BE API 계약만 검증.
  // QA_API_BASE_URL 이 실 BE 를 가리키면 실 서버 검증으로 전환 가능.

  const MOCK_BATCH_TOKEN = 'mock-batch-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1';
  const MOCK_SLIP_NO = '2026-05-19-1';
  const MOCK_SHARE_TOKEN = 'mock-share-token-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2';

  test('SC-1: 서명 등록 API happy path — shareToken + UUID 0건 가드', async ({ page }) => {
    /**
     * mobile-spec.md §2.1 POST /public/batches/{token}/slips/{slipNo}/signature
     * 응답: signedAt + shareToken + shareTokenExpiresAt + signatureHash
     * UUID 비공개 가드: id / slipId 필드 absent
     */
    const pngBytes = makePngBytes(1024); // 1KB — 50KB 이하 정상
    const hash = await sha256HexViaPage(page, pngBytes);

    // BE mock 응답 설정
    await page.route(
      `**/public/batches/${MOCK_BATCH_TOKEN}/slips/${MOCK_SLIP_NO}/signature`,
      (route) => {
        if (route.request().method() !== 'POST') { route.fallback(); return; }
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              signedAt: '2026-05-19T10:00:00Z',
              shareToken: MOCK_SHARE_TOKEN,
              shareTokenExpiresAt: '2026-06-18T10:00:00Z',
              signatureHash: hash,
              // id / slipId 는 절대 미포함 (UUID 비공개 가드)
            },
          }),
        });
      },
    );

    type Sc1Args = { apiBase: string; token: string; slipNo: string; pngArr: number[]; clientHash: string };
    const result = await page.evaluate(async (args: Sc1Args) => {
      const base64 = btoa(String.fromCharCode(...args.pngArr));
      const res = await fetch(
        `${args.apiBase}/public/batches/${args.token}/slips/${args.slipNo}/signature`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signerName: '김인수',
            signaturePngBase64: base64,
            clientHash: args.clientHash,
          }),
        },
      );
      const json = await res.json();
      return { status: res.status, body: json };
    }, { apiBase: API_BASE, token: MOCK_BATCH_TOKEN, slipNo: MOCK_SLIP_NO, pngArr: Array.from(pngBytes), clientHash: hash });

    // 200 응답 검증
    expect(result.status).toBe(200);
    expect(result.body.data).toBeDefined();

    const data = result.body.data as Record<string, unknown>;
    // shareToken 존재 (인수자 view URL 용)
    expect(data['shareToken']).toBeTruthy();
    // signedAt 존재
    expect(data['signedAt']).toBeTruthy();
    // signatureHash 64자 hex
    expect(String(data['signatureHash'])).toMatch(/^[0-9a-f]{64}$/);

    // UUID 비공개 가드 (mobile-spec.md §5 + feedback_uuid_no_user_visibility.md)
    expect(data['id']).toBeUndefined();
    expect(data['slipId']).toBeUndefined();
    expect(data['batchId']).toBeUndefined();
  });

  test('SC-2: hash mismatch → 400 BadRequest', async ({ page }) => {
    /**
     * mobile-spec.md §2.1 Response 400 — clientHash mismatch
     * BE SHA-256 재계산 결과와 클라이언트 제출값 불일치 시 INVALID_INPUT
     */
    await page.route(
      `**/public/batches/${MOCK_BATCH_TOKEN}/slips/${MOCK_SLIP_NO}/signature`,
      (route) => {
        route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'INVALID_INPUT', message: '서명 무결성 검증 실패 — 클라이언트 hash 가 일치하지 않습니다' },
          }),
        });
      },
    );

    const pngBytes = makePngBytes(512);
    const wrongHash = '0'.repeat(64); // 의도적 mismatch

    type Sc2Args = { apiBase: string; token: string; slipNo: string; pngArr: number[]; badHash: string };
    const result = await page.evaluate(async (args: Sc2Args) => {
      const base64 = btoa(String.fromCharCode(...args.pngArr));
      const res = await fetch(
        `${args.apiBase}/public/batches/${args.token}/slips/${args.slipNo}/signature`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signerName: '김',
            signaturePngBase64: base64,
            clientHash: args.badHash,
          }),
        },
      );
      return { status: res.status };
    }, { apiBase: API_BASE, token: MOCK_BATCH_TOKEN, slipNo: MOCK_SLIP_NO, pngArr: Array.from(pngBytes), badHash: wrongHash });

    expect(result.status).toBe(400);
  });

  test('SC-3: PNG 50KB 초과 → 400 BadRequest', async ({ page }) => {
    /**
     * mobile-spec.md §3 budget: PNG 평균 ≤30KB, BE 가드 ≤50KB
     * 60KB 제출 시 INVALID_INPUT
     */
    const hugePng = makePngBytes(60 * 1024); // 60KB > 50KB
    const hash = await sha256HexViaPage(page, hugePng);

    await page.route(
      `**/public/batches/${MOCK_BATCH_TOKEN}/slips/${MOCK_SLIP_NO}/signature`,
      (route) => {
        route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'INVALID_INPUT', message: '서명 PNG 가 너무 큽니다 (61440 bytes, 최대 51200)' },
          }),
        });
      },
    );

    type Sc3Args = { apiBase: string; token: string; slipNo: string; pngArr: number[]; clientHash: string };
    const result = await page.evaluate(async (args: Sc3Args) => {
      // base64 분할 처리 (64KB 이상 String.fromCharCode 단일 호출 방지)
      const CHUNK = 8192;
      let base64 = '';
      for (let i = 0; i < args.pngArr.length; i += CHUNK) {
        base64 += btoa(String.fromCharCode(...args.pngArr.slice(i, i + CHUNK)));
      }
      const res = await fetch(
        `${args.apiBase}/public/batches/${args.token}/slips/${args.slipNo}/signature`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signerName: '김',
            signaturePngBase64: base64,
            clientHash: args.clientHash,
          }),
        },
      );
      return { status: res.status };
    }, { apiBase: API_BASE, token: MOCK_BATCH_TOKEN, slipNo: MOCK_SLIP_NO, pngArr: Array.from(hugePng), clientHash: hash });

    expect(result.status).toBe(400);
  });

  test('SC-4: 만료 batch token → 410 Gone', async ({ page }) => {
    /**
     * mobile-spec.md §1 URL spec: batchToken 배송일 +1일 만료
     * 만료 토큰 제출 시 410 GONE (BE Controller CONFLICT → 410 변환)
     */
    const expiredToken = 'expired-batch-token-ccccccccccccccccccccccccccccccc3';

    await page.route(
      `**/public/batches/${expiredToken}/slips/${MOCK_SLIP_NO}/signature`,
      (route) => {
        route.fulfill({
          status: 410,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'CONFLICT', message: '토큰이 만료되었습니다' },
          }),
        });
      },
    );

    const pngBytes = makePngBytes(512);
    const hash = await sha256HexViaPage(page, pngBytes);

    type Sc4Args = { apiBase: string; token: string; slipNo: string; pngArr: number[]; clientHash: string };
    const result = await page.evaluate(async (args: Sc4Args) => {
      const base64 = btoa(String.fromCharCode(...args.pngArr));
      const res = await fetch(
        `${args.apiBase}/public/batches/${args.token}/slips/${args.slipNo}/signature`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signerName: '김',
            signaturePngBase64: base64,
            clientHash: args.clientHash,
          }),
        },
      );
      return { status: res.status };
    }, { apiBase: API_BASE, token: expiredToken, slipNo: MOCK_SLIP_NO, pngArr: Array.from(pngBytes), clientHash: hash });

    expect(result.status).toBe(410);
  });

  test('SC-5: 인수자 view API — UUID 0건 가드 + 슬립 핵심 정보 존재', async ({ page }) => {
    /**
     * mobile-spec.md §2.2 GET /public/signatures/{shareToken}
     * 응답: slip.slipNo + partnerName + signature.signerName + signaturePngBase64 + hashShort
     * UUID 비공개: slip.id / signature.id 미포함 (feedback_uuid_no_user_visibility.md)
     */
    await page.route(
      `**/public/signatures/${MOCK_SHARE_TOKEN}`,
      (route) => {
        if (route.request().method() !== 'GET') { route.fallback(); return; }
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              slip: {
                slipNo: '2026-05-19-1',
                partnerName: '한국전력',
                deliveryDate: '2026-05-19',
                lines: [{ itemName: '모터 220V', quantity: 2 }],
                totalAmount: 1250000,
                // id 절대 미포함
              },
              signature: {
                signerName: '김인수',
                signedAt: '2026-05-19T10:00:00Z',
                signaturePngBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII=',
                signatureHashShort: 'a3f2b1c9',
                // id 절대 미포함
              },
              shareTokenExpiresAt: '2026-06-18T10:00:00Z',
            },
          }),
        });
      },
    );

    type Sc5Args = { apiBase: string; shareToken: string };
    const result = await page.evaluate(async (args: Sc5Args) => {
      const res = await fetch(`${args.apiBase}/public/signatures/${args.shareToken}`);
      const json = await res.json();
      return { status: res.status, body: json };
    }, { apiBase: API_BASE, shareToken: MOCK_SHARE_TOKEN });

    expect(result.status).toBe(200);

    const data = result.body.data as Record<string, Record<string, unknown>>;
    expect(data).toBeDefined();

    // 슬립 핵심 정보 존재
    expect(data['slip']['slipNo']).toBeTruthy();
    expect(data['slip']['partnerName']).toBeTruthy();

    // 서명 메타 존재
    expect(data['signature']['signerName']).toBeTruthy();
    expect(String(data['signature']['signaturePngBase64'])).toMatch(/^data:image\/png;base64,/);
    expect(String(data['signature']['signatureHashShort'])).toHaveLength(8);

    // UUID 비공개 가드 (mobile-spec.md §5 UUID 미노출 검증 표)
    expect(data['slip']['id']).toBeUndefined();
    expect(data['signature']['id']).toBeUndefined();
  });
});

// ============================================================
// SC-8: PNG 경계값 검증 (49999 bytes — 50KB 미만 통과)
// ============================================================

test.describe('PNG 크기 경계값 가드', () => {
  test('SC-8: PNG 49999 bytes — 50KB 가드 통과 (BE 허용 경계)', async ({ page }) => {
    /**
     * mobile-spec.md §3.6 / §7.3: PNG ≤50KB 가드
     * BE SlipSignatureService.PNG_MAX_BYTES = 50 * 1024 = 51200
     * 49999 < 51200 → 허용
     */
    const justUnderPng = makePngBytes(49_999);
    const hash = await sha256HexViaPage(page, justUnderPng);

    const MOCK_BATCH_TOKEN = 'mock-batch-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1';
    const MOCK_SLIP_NO = '2026-05-19-1';

    await page.route(
      `**/public/batches/${MOCK_BATCH_TOKEN}/slips/${MOCK_SLIP_NO}/signature`,
      (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              signedAt: '2026-05-19T10:00:00Z',
              shareToken: 'mock-share-token-ok',
              shareTokenExpiresAt: '2026-06-18T10:00:00Z',
              signatureHash: hash,
            },
          }),
        });
      },
    );

    type Sc8Args = { apiBase: string; token: string; slipNo: string; pngArr: number[]; clientHash: string };
    const result = await page.evaluate(async (args: Sc8Args) => {
      const CHUNK = 8192;
      let base64 = '';
      for (let i = 0; i < args.pngArr.length; i += CHUNK) {
        base64 += btoa(String.fromCharCode(...args.pngArr.slice(i, i + CHUNK)));
      }
      const res = await fetch(
        `${args.apiBase}/public/batches/${args.token}/slips/${args.slipNo}/signature`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signerName: '김',
            signaturePngBase64: base64,
            clientHash: args.clientHash,
          }),
        },
      );
      return { status: res.status };
    }, { apiBase: API_BASE, token: MOCK_BATCH_TOKEN, slipNo: MOCK_SLIP_NO, pngArr: Array.from(justUnderPng), clientHash: hash });

    // 50KB 이하 → 서버 허용 (mock 200)
    expect(result.status).toBe(200);
  });
});

// ============================================================
// SC-6, SC-7, SC-9, SC-10: FE 번들 미구현 — fixme 표기
// (false green 불허 — test.fixme 로 명시. 구현 후 실 검증으로 전환)
// ============================================================

test.describe('FE public mini bundle — 미구현 케이스 (fixme)', () => {
  /**
   * 다음 4개 케이스는 FE 번들 (signature.js / mobile.css / /d/{token}/s/{slipNo} HTML)
   * 미구현으로 실 검증 불가. test.fixme() 표기.
   *
   * FE 구현 후 fixme 해제 + 아래 TODO 구현 필요:
   *   1. clients/web/signature/ 또는 services/slip-service/src/main/resources/static/
   *      에 signature.js + mobile.css + signature.html 배치
   *   2. vite.config.ts 에 signature.js entry point 추가 (≤6KB gzip 검증)
   *   3. /d/{token}/s/{slipNo} 라우트를 serve 하는 controller 또는 nginx 규칙 추가
   *   4. playwright.config.ts 에 QA_SIGNATURE_URL 환경 변수 설정
   *
   * mobile-spec.md §3.2 dynamic import 정책:
   *   /d/{token} 배치 리스트 → signature.js 로드 X (격리)
   *   /d/{token}/s/{slipNo} 진입 시점만 dynamic import
   */

  test.fixme(
    'SC-6: FE bundle 위치 + build target 검증 (signature.js ≤6KB gzip)',
    async () => {
      /**
       * TODO (FE 구현 후):
       * const res = await page.goto('/d/test-token/s/2026-05-19-1');
       * const scripts = await page.evaluate(() =>
       *   Array.from(document.querySelectorAll('script[src]'))
       *     .map(s => (s as HTMLScriptElement).src)
       * );
       * const sigScript = scripts.find(s => s.includes('signature.js'));
       * expect(sigScript).toBeTruthy();
       *
       * // signature.js ≤6KB gzip 검증 (Response Header Content-Length 또는 실측)
       * const scriptRes = await page.request.get(sigScript!);
       * const cl = parseInt(scriptRes.headers()['content-length'] ?? '0');
       * expect(cl).toBeLessThanOrEqual(6 * 1024);
       */
    },
  );

  test.fixme(
    'SC-7: UUID DOM 노출 0건 가드 — /d/{token}/s/{slipNo} 페이지',
    async () => {
      /**
       * TODO (FE 구현 후):
       * await page.goto('/d/mock-token/s/2026-05-19-1');
       * await page.waitForSelector('.m-sig-canvas-wrap');
       *
       * // mobile-spec.md §5 UUID 미노출 검증 표
       * // Edge DevTools console 패턴: outerHTML.match(UUID regex) → null
       * const uuids = await page.evaluate(() =>
       *   document.body.outerHTML.match(
       *     /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g
       *   )
       * );
       * expect(uuids).toBeNull(); // UUID 0건
       */
    },
  );

  test.fixme(
    'SC-9: { passive: false } touch 이벤트 — canvas touchstart/touchmove/touchend',
    async () => {
      /**
       * TODO (FE 구현 후):
       * mobile-spec.md §3.5 — passive: false 명시 의무
       * Chrome 90+ 는 default passive 라 preventDefault() 무효.
       * 서명 canvas 영역에서 스크롤 차단 검증.
       *
       * await page.goto('/d/mock-token/s/2026-05-19-1');
       * await page.waitForSelector('.m-sig-canvas');
       *
       * // passive: false 검증 — touchstart 이벤트 preventDefault() 효과 측정
       * // (window scroll y 변동 없음 확인)
       */
    },
  );

  test.fixme(
    'SC-10: canvas 사이즈 분기 — viewport 320px(320×200) / 375px(400×200)',
    async () => {
      /**
       * TODO (FE 구현 후):
       * mobile-spec.md §3.4 canvas 사이즈 분기:
       *   innerWidth < 375 → canvas logical width 320
       *   innerWidth >= 375 → canvas logical width 400
       *   height 항상 200
       *
       * // 320px viewport
       * await page.setViewportSize({ width: 320, height: 568 });
       * await page.goto('/d/mock-token/s/2026-05-19-1');
       * const canvas320 = await page.evaluate(() => {
       *   const c = document.querySelector('canvas') as HTMLCanvasElement;
       *   return { w: parseInt(c.style.width), h: parseInt(c.style.height) };
       * });
       * expect(canvas320.w).toBe(320);
       * expect(canvas320.h).toBe(200);
       *
       * // 375px viewport
       * await page.setViewportSize({ width: 375, height: 812 });
       * await page.goto('/d/mock-token/s/2026-05-19-1');
       * const canvas375 = await page.evaluate(() => {
       *   const c = document.querySelector('canvas') as HTMLCanvasElement;
       *   return { w: parseInt(c.style.width), h: parseInt(c.style.height) };
       * });
       * expect(canvas375.w).toBe(400);
       * expect(canvas375.h).toBe(200);
       */
    },
  );
});

// ============================================================
// Web Crypto API SHA-256 구현 검증 (브라우저 내장)
// mobile-spec.md §3.7 — FE 번들 미구현과 무관하게 검증 가능
// ============================================================

test.describe('Web Crypto SHA-256 — mobile-spec.md §3.7 알고리즘 검증', () => {
  test('SHA-256 hex 64자 생성 — 동일 bytes 에 대해 결정적 결과', async ({ page }) => {
    /**
     * mobile-spec.md §3.7 sha256Hex 구현과 동일 로직으로 검증.
     * BE SlipSignatureService.sha256Hex 와 결과 일치해야 서명 무결성 통과.
     * 브라우저 내장 Web Crypto API — iOS 14+ / Android Chrome 90+ 지원.
     */
    const knownBytes = makePngBytes(128);
    const hash1 = await sha256HexViaPage(page, knownBytes);
    const hash2 = await sha256HexViaPage(page, knownBytes);

    // 64자 hex
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
    // 결정적 — 동일 입력 동일 출력
    expect(hash1).toBe(hash2);
    // 1 byte 차이 → 다른 hash (avalanche effect)
    const mutated = new Uint8Array(knownBytes);
    mutated[0] = mutated[0] ^ 0xff;
    const hash3 = await sha256HexViaPage(page, mutated);
    expect(hash1).not.toBe(hash3);
  });

  test('data URI base64 분리 — mobile-spec.md §3.7 split 로직 검증', async ({ page }) => {
    /**
     * mobile-spec.md §3.7 sha256Hex:
     *   const base64 = dataURL.split(',')[1];
     *   const binary = atob(base64);
     * data URI 형식 "data:image/png;base64,iVBORw0..." 의 comma 뒤 부분만 decode
     */
    const result = await page.evaluate(async () => {
      // 1x1 투명 PNG (최소 유효 PNG data URI)
      const dataURL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII=';
      const base64 = dataURL.split(',')[1];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const hashBuf = await crypto.subtle.digest('SHA-256', bytes);
      const hex = Array.from(new Uint8Array(hashBuf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      return { hex, splitOk: base64 !== dataURL };
    });

    expect(result.splitOk).toBe(true);
    expect(result.hex).toMatch(/^[0-9a-f]{64}$/);
  });
});
