/**
 * 견적 finalize → SamhanLogis slip-service 즉시 출고전표 생성 bridge.
 *
 * legacy estimate Code.js sendOrderFromUi (line 1762-1967) 가 e-Count proxy
 * (`http://152.69.228.109:3000/proxy/ecount/sale`) 호출로 SaleList POST 했던
 * 동작을 slip-service 발행 endpoint 호출로 1:1 대체한다.
 *
 * P0-B (2026-06-10, 개발책임자 결정 ②): 대상 = `POST /internal/slips/from-estimate`
 * (slip-service InternalSlipPublishController). estimate-app 은 자체 로그인 체계가
 * 없는 server-to-server 호출자이므로 **X-Internal-Token** 헤더로 인증
 * (permitAll 금지). 계약은 공개 /api/v1/slips/from-estimate 의
 * PublishFromEstimateRequest 와 동일.
 *
 * 환경변수:
 *   - SLIP_SERVICE_URL: slip-service base URL (기본 http://localhost:8086)
 *   - SAMHAN_API_BASE_URL: gateway URL (SLIP_SERVICE_URL 미지정시 fallback —
 *     단, /internal/** 는 게이트웨이 비노출이므로 운영은 slip-service 직결 필수)
 *   - SAMHAN_INTERNAL_TOKEN: X-Internal-Token 값 (slip-service 와 동일 값,
 *     INTERNAL_AUTH_TOKEN legacy fallback)
 *
 * USE_MOCK_FALLBACK 분기는 폐기 — non-2xx / 네트워크 오류는 호출자에게
 * 그대로 전파해 사용자 alert 로 처리한다.
 */

'use strict';

const axios = require('axios');
const { Logger } = require('./apps-script-shim');

const SLIP_BASE =
  process.env.SLIP_SERVICE_URL ||
  process.env.SAMHAN_API_BASE_URL ||
  'http://localhost:8086';

const INTERNAL_TOKEN =
  process.env.SAMHAN_INTERNAL_TOKEN ||
  process.env.INTERNAL_AUTH_TOKEN ||
  'CHANGE_ME_LOCAL_ONLY';

// 운영 가드 — slip-service 쪽은 InternalTokenGuard 가 dev 토큰 prod 부팅을 차단하므로
// dev 기본값으로는 운영 발행이 어차피 401 이지만, 미설정을 조기에 드러낸다.
if (process.env.NODE_ENV === 'production'
  && INTERNAL_TOKEN === 'CHANGE_ME_LOCAL_ONLY') {
  Logger.log('[slip-bridge] ⚠️ SAMHAN_INTERNAL_TOKEN 미설정 (운영) — 출고전표 발행이 401 로 거부됩니다. .env 설정 필요');
}

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || '';

/**
 * Slack incoming webhook POST — slip-service 5xx 발생 시 운영 alert.
 *
 * SLACK_WEBHOOK_URL 미설정 시 silent no-op (정상 동작 영향 X).
 * Phase 7 2차 — 실 webhook 등록 후 운영 alert 활성화.
 *
 * @param {string} text — Slack 메시지 본문
 * @returns {Promise<void>}
 */
async function postSlackAlert(text) {
  if (!SLACK_WEBHOOK_URL) return;
  try {
    await axios.post(
      SLACK_WEBHOOK_URL,
      { text },
      { timeout: 5000, validateStatus: () => true },
    );
  } catch (err) {
    Logger.log(`[slip-bridge] slack webhook 실패 (silent): ${err.message}`);
  }
}

/**
 * legacy SaleList[].BulkDatas 형태의 row 들을 slip-service POST body 로 변환.
 *
 * legacy 단일 row 필드 → slip-service line 필드 매핑:
 *   PROD_CD     → productCode      (모델 코드)
 *   PROD_DES    → productName      (선택)
 *   SIZE_DES    → spec             (스펙 표기)
 *   QTY         → qty              (수량)
 *   PRICE       → unitPriceExVat   (VAT 제외 단가)
 *   USER_PRICE_VAT → unitPriceVat  (VAT 포함 단가)
 *   SUPPLY_AMT  → supplyAmount
 *   VAT_AMT     → vatAmount
 *   REMARKS     → remarks
 *
 * legacy header (BulkDatas 첫 row 의 IO_DATE/CUST/EMP_CD/WH_CD 등) 은
 * slip-service 의 root level 필드로 승격한다 — slip-service Slip entity 가
 * 단일 출고전표를 표현하므로 동일 IO_DATE/CUST 의 모든 line 은 한 slip 에 묶인다.
 *
 * @param {object} legacyOrder — sendOrderFromUi(data) 의 raw input
 * @param {Array<object>} saleList — legacy 가 만든 SaleList (BulkDatas 배열)
 * @returns {object} slip-service POST body
 */
function buildSlipRequest(legacyOrder, saleList) {
  if (!Array.isArray(saleList) || saleList.length === 0) {
    throw new Error('slip-bridge: saleList 비어있음');
  }
  const head = saleList[0].BulkDatas || {};

  // estimateNumber 는 PublishFromEstimateRequest @NotBlank — legacy GAS UI 에는
  // 견적번호 개념이 없으므로 미전달 시 발행 단위 고유 식별자를 생성해 sourceId 로 보존.
  const estimateNumber =
    legacyOrder.estimateNumber || `WEB-${head.IO_DATE || 'NA'}-${Date.now()}`;

  return {
    estimateNumber,
    ioDate: head.IO_DATE,                 // yyyyMMdd
    timeDate: head.TIME_DATE,
    partnerCode: head.CUST,               // 거래처 코드
    partnerName: head.CUST_DES || '',
    employeeCode: head.EMP_CD,            // 담당자 코드
    manager: legacyOrder.manager || '',
    warehouseCode: head.WH_CD,
    ioType: head.IO_TYPE || '10',
    shippingAddress: head.U_TXT1 || '',
    inspectionAddress: head.ADD_TXT_01_T || '',
    receiverPhone: head.ADD_TXT_03_T || '',
    memo: head.ADD_TXT_04_T || '',
    paymentDueLabel: head.ADD_TXT_05_T || '',
    discountInfo: head.ADD_TXT_06_T || '',
    customerTel: head.U_MEMO1 || '',
    customerAddr: head.U_MEMO2 || '',
    customerRep: head.U_MEMO3 || '',

    lines: saleList.map((row, idx) => {
      const b = row.BulkDatas || {};
      return {
        lineNo: idx + 1,
        productCode: b.PROD_CD,
        productName: b.PROD_DES || '',
        spec: b.SIZE_DES || '',
        // PublishLineRequest.qty 는 String 계약 (서비스 레이어 parse)
        qty: String(Number(b.QTY) || 0),
        unitPriceExVat: Number(b.PRICE) || 0,
        unitPriceVat: Number(b.USER_PRICE_VAT) || 0,
        supplyAmount: Number(b.SUPPLY_AMT) || 0,
        vatAmount: Number(b.VAT_AMT) || 0,
        remarks: b.REMARKS || '',
      };
    }),
  };
}

/**
 * slip-service `POST /internal/slips/from-estimate` 호출 (X-Internal-Token).
 *
 * @param {object} legacyOrder — sendOrderFromUi(data) 의 input (header 필드 추출용)
 * @param {Array<object>} saleList — legacy SaleList (line per BulkDatas)
 * @returns {Promise<{ok:boolean, slipNo?:string, body:object}>}
 */
async function postSlip(legacyOrder, saleList) {
  const url = `${SLIP_BASE}/internal/slips/from-estimate`;
  let body;
  try {
    body = buildSlipRequest(legacyOrder, saleList);
  } catch (e) {
    return { ok: false, error: e.message, body: null };
  }

  Logger.log(`[slip-bridge] POST ${url} (lines=${body.lines.length})`);

  try {
    const resp = await axios.post(url, body, {
      timeout: 15000,
      validateStatus: () => true,
      headers: {
        'X-Internal-Token': INTERNAL_TOKEN,
        'X-Caller': 'estimate-app',
      },
    });
    if (resp.status >= 200 && resp.status < 300) {
      // slip-service 는 ApiResponse 봉투 { success, data: { slipId, slipNo, ... } } 반환.
      // 비봉투 응답도 방어적으로 수용. 가짜 slipNo 생성 금지 — 미수신 시 그대로 보고.
      const payload = (resp.data && resp.data.data) || resp.data || {};
      const slipNo = payload.slipNo || payload.slipNumber || '';
      return { ok: true, slipNo: String(slipNo), body: resp.data };
    }
    Logger.log(`[slip-bridge] non-2xx status=${resp.status} body=${JSON.stringify(resp.data)}`);
    if (resp.status >= 500) {
      // 5xx 만 Slack alert (4xx 는 사용자 입력 오류 — 운영 alert 불필요).
      // Phase 7 3차 정정 (BE P1) — fire-and-forget: alert 대기로 사용자 응답이 5초 지연되는 것을
      // 막기 위해 await 제거. 실패는 console.error 로 기록만 하고 호출자 응답에 영향 X.
      postSlackAlert(
        `[samhan-estimate-app] slip-service 5xx 발생\nstatus=${resp.status}\nestimate=${body.estimateNumber || 'N/A'}\nbody=${JSON.stringify(resp.data).slice(0, 500)}`,
      ).catch((err) => console.error('[slack-alert] failed', err.message));
    }
    return { ok: false, error: `HTTP ${resp.status}`, body: resp.data };
  } catch (err) {
    Logger.log(`[slip-bridge] axios error ${err.message}`);
    // fire-and-forget — 사용자 알람 차단 회피.
    postSlackAlert(
      `[samhan-estimate-app] slip-service 네트워크 오류\nerror=${err.message}\nestimate=${body.estimateNumber || 'N/A'}`,
    ).catch((slackErr) => console.error('[slack-alert] failed', slackErr.message));
    return { ok: false, error: err.message, body: null };
  }
}

module.exports = {
  buildSlipRequest,
  postSlip,
  postSlackAlert,
};
