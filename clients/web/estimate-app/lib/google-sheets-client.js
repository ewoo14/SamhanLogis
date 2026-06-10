/**
 * Google Sheets 직접 read 클라이언트 (estimate-app v2 전용).
 *
 * 개발책임자 결정 (2026-05-05):
 *   "견적서와 주문서의 경우에만 기존 구글 스크립트처럼 구글 스프레드 시트에서
 *    그대로 가져오는 것으로 하자"
 *
 * 본 모듈은 legacy Apps Script 의 다음 호출과 동등 결과를 반환한다:
 *   SpreadsheetApp.openById(SRC_SHEET_ID)
 *     .getSheetByName(name)
 *     .getDataRange()
 *     .getValues()
 *
 * 구현은 estimate-legacy 의 동명 모듈 (PR #67) 과 동등 — Service Account JWT
 * 인증 + in-memory cache (TTL 5분).
 *
 * 환경변수:
 *  - GOOGLE_SERVICE_ACCOUNT_KEY: Service Account JSON 키 파일 절대 경로 (권장)
 *  - GOOGLE_SA_KEY_JSON_BASE64 : 옵션 — JSON 전체를 base64 단일 문자열
 *  - SHEET_CACHE_TTL_SEC      : 시트 caching TTL 초 (기본 300 = 5분)
 *
 * 캐시 정책:
 *  - TTL 5분 (단가 / 품목은 분 단위 변경 빈도 낮음)
 *  - 메모리 한계: 시트 27탭 * 평균 1MB ≈ 30MB (카페24 1G 한도 안전)
 *  - 무효화: clearCache() (POST /rpc/clearSheetCache)
 *
 * 운영 주의:
 *  - Service Account 키 미설정 시 readSheet() 호출이 throw → 호출자가 catch
 *    하여 빈 [[]] 반환 또는 graceful 에러 메시지 처리해야 한다.
 *  - 본 PR scope: legacy 1:1 시트 read 환원만. 부분 시트 read / range API 등
 *    legacy 가 사용하지 않는 호출은 후속 PR.
 */

'use strict';

const fs = require('fs');
const { google } = require('googleapis');

const TTL_MS = (parseInt(process.env.SHEET_CACHE_TTL_SEC || '300', 10) || 300) * 1000;

const cache = new Map(); // key=`${spreadsheetId}!${range}` → { value, expireAt }
let _sheetsClient = null;
let _authClient = null;

/**
 * Service Account JWT 인증 클라이언트 (singleton).
 * 우선순위: GOOGLE_SERVICE_ACCOUNT_KEY (파일 path) → GOOGLE_SA_KEY_JSON_BASE64.
 */
function _getAuth() {
  if (_authClient) return _authClient;

  let credentials;
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const keyB64 = process.env.GOOGLE_SA_KEY_JSON_BASE64;

  if (keyPath && fs.existsSync(keyPath)) {
    credentials = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  } else if (keyB64) {
    credentials = JSON.parse(Buffer.from(keyB64, 'base64').toString('utf8'));
  } else {
    throw new Error(
      '[google-sheets-client] Service Account 키 미설정 — GOOGLE_SERVICE_ACCOUNT_KEY 또는 GOOGLE_SA_KEY_JSON_BASE64 필요',
    );
  }

  _authClient = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return _authClient;
}

function _getSheets() {
  if (_sheetsClient) return _sheetsClient;
  _sheetsClient = google.sheets({ version: 'v4', auth: _getAuth() });
  return _sheetsClient;
}

/**
 * 시트 read — `getDataRange().getValues()` 와 동등.
 *
 * @param {string} spreadsheetId Google Sheet ID (URL `/d/<id>/`).
 * @param {string} sheetName     탭 이름 (legacy 의 SheetByName 인자).
 * @returns {Promise<Array<Array<any>>>} 2차원 배열 (legacy values 와 shape 동일).
 */
async function readSheet(spreadsheetId, sheetName) {
  const range = `'${sheetName}'!A1:ZZ`;
  const cacheKey = `${spreadsheetId}!${range}`;
  const now = Date.now();

  const hit = cache.get(cacheKey);
  if (hit && hit.expireAt > now) return hit.value;

  const sheets = _getSheets();
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING',
  });
  const values = resp.data.values || [[]];

  cache.set(cacheKey, { value: values, expireAt: now + TTL_MS });
  return values;
}

/**
 * 시트 read (값 + 수식) — `getDataRange().getValues()` + `.getFormulas()` 동등.
 *
 * legacy Apps Script 의 getFormulas() 는 수식 셀만 수식 문자열, 그 외 '' 를
 * 반환한다. Sheets API 의 valueRenderOption=FORMULA 는 수식 셀은 수식, 일반
 * 셀은 literal 값을 반환하므로 `=` 시작 셀만 보존하여 GAS 시맨틱에 맞춘다.
 * (종합견적서 수식분기: 납품가 `$L$2` useK2 / `$D$7`·`$D$8` matKey / 구형 `$I$1` isDisc)
 *
 * @param {string} spreadsheetId
 * @param {string} sheetName
 * @returns {Promise<{values:Array<Array<any>>, formulas:Array<Array<string>>}>}
 */
async function readSheetGrid(spreadsheetId, sheetName) {
  const range = `'${sheetName}'!A1:ZZ`;
  const cacheKey = `${spreadsheetId}!${range}#grid`;
  const now = Date.now();

  const hit = cache.get(cacheKey);
  if (hit && hit.expireAt > now) return hit.value;

  const sheets = _getSheets();
  const [valResp, formResp] = await Promise.all([
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING',
    }),
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
      valueRenderOption: 'FORMULA',
      dateTimeRenderOption: 'FORMATTED_STRING',
    }),
  ]);
  const values = valResp.data.values || [[]];
  const rawFormulas = formResp.data.values || [[]];
  // Sheets API 는 trailing 빈 셀을 절단(ragged rows)하므로 값 행이 수식 행보다
  // 짧을 수 있다(수식 결과가 '' 인 셀 등). 행별 union 폭으로 순회해 수식 유실 방지.
  const numRows = Math.max(values.length, rawFormulas.length);
  const formulas = [];
  for (let r = 0; r < numRows; r++) {
    const fRow = rawFormulas[r] || [];
    const width = Math.max((values[r] || []).length, fRow.length);
    const out = [];
    for (let c = 0; c < width; c++) {
      const f = fRow[c];
      out.push(typeof f === 'string' && f.startsWith('=') ? f : '');
    }
    formulas.push(out);
  }

  const grid = { values, formulas };
  cache.set(cacheKey, { value: grid, expireAt: now + TTL_MS });
  return grid;
}

/**
 * 캐시 전체 무효화 (sheet schema 변경 시).
 */
function clearCache() {
  cache.clear();
}

/**
 * 헬스체크 — Service Account 키 존재 여부 + 클라이언트 초기화 가능 여부.
 *
 * @returns {{ok:boolean, cacheSize?:number, ttlMs?:number, error?:string}}
 */
function healthz() {
  try {
    _getAuth();
    return { ok: true, cacheSize: cache.size, ttlMs: TTL_MS };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

module.exports = { readSheet, readSheetGrid, clearCache, healthz };
