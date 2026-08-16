/**
 * Apps Script 호환 shim — Node.js 환경에서 legacy Code.js 가 의존하는
 * Google Apps Script global API 들을 1:1 흉내낸다.
 *
 * 데이터 출처 (개발책임자 결정 2026-05-05):
 *  - 품목/추천/단가 데이터 → product-service DB 벌크 endpoint (lib/db-catalog.js)
 *  - **출고전표 발송 (sendOrderFromUi)** → SamhanLogis slip-service POST 위임
 *    (lib/slip-bridge.js). e-Count proxy 직접 호출은 폐기.
 *  - **외부 노출 API 호출 (Notion 등)** → noop + warn (SamhanLogis MS DB 가 흡수).
 *
 * 본 모듈은 legacy Code.js (2837 라인) 의 logic 을 변경하지 않고도
 * Node.js 에서 그대로 require 가능하게 만들기 위한 호환 layer 다.
 *
 * 다루는 API:
 *  - SpreadsheetApp / Sheet — 테스트·레거시 함수 호환용 로컬 모형만 제공하며 외부 read 없음
 *  - DriveApp.getFolderById — noop + warn (legacy 가 logo/gate 이미지 폴더 read;
 *    public/assets 자산 사용 권장).
 *  - UrlFetchApp.fetch — axios 위임 (e-Count URL 식별 시 noop+warn → slip-bridge 로 우회)
 *  - HtmlService.createTemplateFromFile — Express EJS 가 직접 처리하므로 본 shim 은 noop stub 만 제공
 *  - HtmlService.createHtmlOutputFromFile — include() 보조용 (public/ 자산 read)
 *  - CacheService — in-memory Map
 *  - PropertiesService — process.env 위임
 *  - Session.getActiveUser / getScriptTimeZone — env / 'Asia/Seoul'
 *  - Utilities.base64Encode / formatDate — Node Buffer / 자체 구현
 *  - Logger.log — console.log 위임
 *
 * 환경변수:
 *  - SAMHAN_API_BASE_URL    : SamhanLogis MS endpoint base URL (slip-bridge 만 사용)
 *  - DEFAULT_USER_EMAIL     : Session.getActiveUser().getEmail() 대체
 *
 * Phase 6 backend (PR #76) 머지 후 USE_MOCK_FALLBACK 환경변수는 폐기되었으며
 * 모든 SamhanLogis MS 호출은 실 endpoint 를 호출한다.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const BASE_URL = process.env.SAMHAN_API_BASE_URL || 'http://localhost:8080';
const DEFAULT_EMAIL = process.env.DEFAULT_USER_EMAIL || 'dev@samhan-air.com';

/* ─────────────────────────────────────────────────────────────────────────
 * Logger — Apps Script Logger.log 1:1 (level prefix 만 추가)
 * ──────────────────────────────────────────────────────────────────────── */
const Logger = {
  log: (...args) => {
    const msg = args
      .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
      .join(' ');
    console.log('[AppsScript]', msg);
  },
};

/* ─────────────────────────────────────────────────────────────────────────
 * Utilities — formatDate / base64Encode
 * ──────────────────────────────────────────────────────────────────────── */
const Utilities = {
  /**
   * Apps Script Utilities.formatDate(date, tz, pattern) 의 부분 호환.
   * 지원 패턴: yyyy, MM, dd, HH, mm, ss
   */
  formatDate(date, tz, pattern) {
    const d = date instanceof Date ? date : new Date(date);
    const yyyy = String(d.getFullYear());
    const MM = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const HH = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return String(pattern)
      .replace(/yyyy/g, yyyy)
      .replace(/MM/g, MM)
      .replace(/dd/g, dd)
      .replace(/HH/g, HH)
      .replace(/mm/g, mm)
      .replace(/ss/g, ss);
  },
  base64Encode(input) {
    if (Buffer.isBuffer(input)) return input.toString('base64');
    if (Array.isArray(input)) return Buffer.from(input).toString('base64');
    return Buffer.from(String(input), 'utf8').toString('base64');
  },
  base64Decode(s) {
    return Array.from(Buffer.from(String(s), 'base64'));
  },
};

/* ─────────────────────────────────────────────────────────────────────────
 * Session — getActiveUser / getScriptTimeZone
 * ──────────────────────────────────────────────────────────────────────── */
const Session = {
  getActiveUser() {
    return { getEmail: () => DEFAULT_EMAIL };
  },
  getScriptTimeZone() {
    return 'Asia/Seoul';
  },
};

/* ─────────────────────────────────────────────────────────────────────────
 * CacheService — in-memory Map (TTL ms 단위)
 * ──────────────────────────────────────────────────────────────────────── */
const _cacheStore = new Map();

function _cacheNow() {
  return Date.now();
}

const _scriptCache = {
  get(key) {
    const ent = _cacheStore.get(key);
    if (!ent) return null;
    if (ent.expireAt && ent.expireAt < _cacheNow()) {
      _cacheStore.delete(key);
      return null;
    }
    return ent.value;
  },
  put(key, value, ttlSec) {
    _cacheStore.set(key, {
      value: String(value),
      expireAt: ttlSec ? _cacheNow() + ttlSec * 1000 : null,
    });
  },
  remove(key) {
    _cacheStore.delete(key);
  },
};

const CacheService = {
  getScriptCache: () => _scriptCache,
  getUserCache: () => _scriptCache,
  getDocumentCache: () => _scriptCache,
};

/* ─────────────────────────────────────────────────────────────────────────
 * PropertiesService — process.env 위임 (legacy 가 e-Count creds 등 사용)
 * ──────────────────────────────────────────────────────────────────────── */
const _propsApi = {
  getProperty(key) {
    return process.env[key] || null;
  },
  getProperties() {
    return { ...process.env };
  },
  setProperty() {
    /* no-op (Node.js 에서 env 변경 금지) */
  },
};

const PropertiesService = {
  getScriptProperties: () => _propsApi,
  getUserProperties: () => _propsApi,
};

/* ─────────────────────────────────────────────────────────────────────────
 * UrlFetchApp — axios sync wrapper
 *
 * legacy 가 호출하는 외부 endpoint 분류:
 *  1. e-Count proxy (http://152.69.228.109:3000/proxy/ecount/*) → noop + warn
 *     실 비즈니스 (sale 생성) 는 lib/slip-bridge.js 에서 SamhanLogis MS 호출로 우회
 *  2. Notion API (https://api.notion.com/*) → noop + warn (SamhanLogis MS DB 가 흡수)
 *  3. SamhanLogis MS endpoint (/api/v1/*) → axios 위임
 * ──────────────────────────────────────────────────────────────────────── */

const ECOUNT_HOSTS = ['152.69.228.109', 'oapi'];
const NOTION_HOSTS = ['api.notion.com'];

function _isExternalDeprecated(url) {
  return (
    ECOUNT_HOSTS.some((h) => url.includes(h)) ||
    NOTION_HOSTS.some((h) => url.includes(h))
  );
}

/**
 * Sync-style axios wrapper — Apps Script UrlFetchApp.fetch 의 동기 시그니처와
 * 호환되도록 Node.js 환경에서는 deasync 대신, 호출 위치를 async/await 로 감싸도록
 * legacy Code.js 의 fetch 호출부만 refactor 한다 (lib/code.js 참조).
 *
 * 본 함수 자체는 Promise 를 반환하지만, 결과 객체는 Apps Script HTTPResponse
 * 와 동일한 메서드 (getResponseCode, getContentText, getBlob 등) 를 제공한다.
 */
async function _doFetch(url, options = {}) {
  if (_isExternalDeprecated(url)) {
    Logger.log(
      `[shim] DEPRECATED external host blocked → noop: ${url}\n  → Use SamhanLogis MS (slip-service / partner-service / etc.) instead.`,
    );
    const fakeBody = JSON.stringify({
      ok: false,
      deprecated: true,
      message: 'External Google/e-Count/Notion endpoint deprecated by B2 migration. See lib/slip-bridge.js for slip-service integration.',
    });
    return _wrapResponse(200, fakeBody);
  }

  const method = (options.method || 'get').toLowerCase();
  const headers = options.headers || {};
  if (options.contentType) headers['Content-Type'] = options.contentType;
  const data = options.payload;

  try {
    const resp = await axios.request({
      url,
      method,
      headers,
      data,
      validateStatus: () => true, // legacy muteHttpExceptions 대응
      timeout: 15000,
    });
    const text = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
    return _wrapResponse(resp.status, text);
  } catch (err) {
    Logger.log(`[shim] fetch error ${url}: ${err.message}`);
    return _wrapResponse(599, JSON.stringify({ ok: false, error: err.message }));
  }
}

function _wrapResponse(code, text) {
  return {
    getResponseCode: () => code,
    getContentText: () => text,
    getBlob: () => ({
      getBytes: () => Array.from(Buffer.from(text, 'utf8')),
      getContentType: () => 'application/json',
    }),
    getHeaders: () => ({}),
  };
}

const UrlFetchApp = {
  fetch: _doFetch,
  fetchAll: async (requests) => Promise.all(requests.map((r) => _doFetch(r.url, r))),
};

/* ─────────────────────────────────────────────────────────────────────────
 * SpreadsheetApp / Sheet — 외부 read 없는 로컬 호환 모형
 *
 * 개발책임자 결정 (2026-05-05):
 *   "견적서와 주문서의 경우에만 기존 구글 스크립트처럼 구글 스프레드 시트에서
 *    그대로 가져오는 것으로 하자"
 *
 * legacy 의 SpreadsheetApp.openById(SRC_SHEET_ID).getSheetByName(name)
 *   .getDataRange().getValues() 는 Apps Script 에서 동기 호출이지만,
 *   Node.js 에서는 sheet read 가 비동기.
 *
 * 외부 스프레드시트 read는 제거되었다. 값은 injectSheet()로만 주입된다.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Apps Script `Sheet` 호환 모형. 테스트가 주입한 2D 배열을 보관.
 *
 * 지원 메서드:
 *  - getName / getDataRange / getRange / getLastRow / getLastColumn
 *  - getDataRange().getValues() / .getDisplayValues() (legacy 가 모두 사용)
 *  - getDataRange().getFormulas() — 실 수식 그리드 (readSheetGrid 의
 *    valueRenderOption=FORMULA 결과; 미제공 시 '' 그리드 fallback).
 *    legacy 수식분기 (납품가 `$L$2` useK2 / `$D$7`·`$D$8` matKey / 구형 `$I$1`
 *    isDisc) 가 GAS 와 동일하게 작동한다.
 */
class FakeSheet {
  constructor(name, values, formulas) {
    this._name = name;
    this._values = values && values.length ? values : [[]];
    // GAS getFormulas() 는 직사각형 그리드를 보장한다. Sheets API ragged rows
    // (trailing 빈 셀 절단) 로 값 행이 수식 행보다 짧아도 수식 인덱스가
    // 유실되지 않도록 행별 union 폭으로 정규화해 보관한다.
    const base = (formulas && formulas.length) ? formulas : [];
    this._formulas = this._values.map((row, i) => {
      const fRow = base[i] || [];
      const width = Math.max(row.length, fRow.length);
      return Array.from({ length: width }, (_, j) => fRow[j] || '');
    });
  }
  getName() { return this._name; }
  getDataRange() {
    const vals = this._values;
    const forms = this._formulas;
    const numCols = Math.max(
      vals.reduce((m, r) => Math.max(m, r.length), 0),
      forms.reduce((m, r) => Math.max(m, r.length), 0),
    );
    return {
      getValues: () => vals,
      // legacy 는 getDisplayValues 로 string 형 결과를 기대 — 시트 client 가 이미
      // FORMATTED_STRING/UNFORMATTED_VALUE 혼용으로 받지만, 본 호출 사이트는
      // 모두 문자열 trim/정규화를 다시 수행하므로 raw getValues 와 동등.
      getDisplayValues: () => vals.map((r) => r.map((v) => (v == null ? '' : String(v)))),
      // GAS 직사각형 불변식: 모든 행을 numCols 폭으로 패딩해 반환.
      getFormulas: () => forms.map((fr) => Array.from({ length: numCols }, (_, j) => fr[j] || '')),
      getNumRows: () => vals.length,
      getNumColumns: () => vals.reduce((m, r) => Math.max(m, r.length), 0),
    };
  }
  getRange(r1, c1, rows, cols) {
    const slice = [];
    const formSlice = [];
    const _rows = rows || 1;
    const _cols = cols || 1;
    for (let i = 0; i < _rows; i++) {
      const row = this._values[r1 - 1 + i] || [];
      const formRow = this._formulas[r1 - 1 + i] || [];
      const out = [];
      const formOut = [];
      for (let j = 0; j < _cols; j++) {
        out.push(row[c1 - 1 + j]);
        formOut.push(formRow[c1 - 1 + j] || '');
      }
      slice.push(out);
      formSlice.push(formOut);
    }
    return {
      getValues: () => slice,
      getDisplayValues: () => slice.map((r) => r.map((v) => (v == null ? '' : String(v)))),
      getValue: () => (slice[0] ? slice[0][0] : null),
      getFormulas: () => formSlice,
    };
  }
  getLastRow() { return this._values.length; }
  getLastColumn() {
    return this._values.reduce((m, r) => Math.max(m, r.length), 0);
  }
}

class FakeSpreadsheet {
  constructor(id, sheetMap) {
    this._id = id;
    this._sheets = sheetMap || {};
  }
  getId() { return this._id; }
  getSheetByName(name) {
    if (this._sheets[name]) return this._sheets[name];
    Logger.log(`[shim] SpreadsheetApp.getSheetByName(${name}) → not preloaded, returning empty sheet`);
    const empty = new FakeSheet(name, [[]]);
    this._sheets[name] = empty;
    return empty;
  }
}

const _spreadCache = new Map();

const SpreadsheetApp = {
  /**
   * Apps Script 동기 시그니처 보존. 외부 네트워크 read는 수행하지 않는다.
   */
  openById(id) {
    if (_spreadCache.has(id)) return _spreadCache.get(id);
    const ss = new FakeSpreadsheet(id, {});
    _spreadCache.set(id, ss);
    return ss;
  },
  getActiveSpreadsheet: () => null,
};

/* External sheet prefetch was removed; only local injectSheet remains. */

// No remote prefetch API: catalog bootstrap always uses product-service DB.

/**
 * 캐시 강제 무효화 — POST /rpc/clearSheetCache.
 */
function clearSheetCache() {
  _spreadCache.clear();
}

/**
 * 외부에서 시트 dump 를 직접 주입할 때 사용 (테스트 보조).
 * formulas 는 옵션 — 미지정 시 빈 수식 그리드.
 */
function injectSheet(spreadsheetId, sheetName, values, formulas) {
  let ss = _spreadCache.get(spreadsheetId);
  if (!ss) {
    ss = new FakeSpreadsheet(spreadsheetId, {});
    _spreadCache.set(spreadsheetId, ss);
  }
  ss._sheets[sheetName] = new FakeSheet(sheetName, values, formulas);
}

/* ─────────────────────────────────────────────────────────────────────────
 * DriveApp — getFolderById (파일 list + base64 변환)
 * legacy 에서는 logo / gate 이미지 폴더 read.
 * SamhanLogis files-service GET /api/v1/files/{folderKey} 위임.
 * ──────────────────────────────────────────────────────────────────────── */

class FakeFile {
  constructor(name, mime, bytes) {
    this._name = name;
    this._mime = mime;
    this._bytes = bytes || [];
  }
  getName() { return this._name; }
  getMimeType() { return this._mime; }
  getBlob() {
    return {
      getBytes: () => this._bytes,
      getContentType: () => this._mime,
    };
  }
}

class FakeFolder {
  constructor(name, files) {
    this._name = name;
    this._files = files || [];
  }
  getName() { return this._name; }
  getFiles() {
    let i = 0;
    return {
      hasNext: () => i < this._files.length,
      next: () => this._files[i++],
    };
  }
}

const DriveApp = {
  getFolderById(folderId) {
    Logger.log(`[shim] DriveApp.getFolderById(${folderId}) → mock empty folder`);
    return new FakeFolder(folderId, []);
  },
  getRootFolder() {
    return new FakeFolder('root', []);
  },
};

/* ─────────────────────────────────────────────────────────────────────────
 * HtmlService — Express EJS 가 실제 render 를 담당하므로 stub 만 제공
 * include(filename) 보조 — public/assets/<filename>.html 직접 read
 * ──────────────────────────────────────────────────────────────────────── */

const HtmlService = {
  createTemplateFromFile(filename) {
    Logger.log(`[shim] HtmlService.createTemplateFromFile(${filename}) — Express EJS handles render`);
    return {
      _filename: filename,
      evaluate() {
        return {
          setTitle: () => this,
          addMetaTag: () => this,
          getContent: () => '',
        };
      },
    };
  },
  createHtmlOutputFromFile(filename) {
    const candidates = [
      path.join(__dirname, '..', 'public', 'assets', `${filename}.html`),
      path.join(__dirname, '..', 'public', `${filename}.html`),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf8');
        return { getContent: () => content };
      }
    }
    Logger.log(`[shim] HtmlService.createHtmlOutputFromFile(${filename}) → empty`);
    return { getContent: () => '' };
  },
};

/* ─────────────────────────────────────────────────────────────────────────
 * 외부 노출
 * ──────────────────────────────────────────────────────────────────────── */
module.exports = {
  Logger,
  Utilities,
  Session,
  CacheService,
  PropertiesService,
  UrlFetchApp,
  SpreadsheetApp,
  DriveApp,
  HtmlService,
  injectSheet,
  clearSheetCache,
  // 헬퍼 (lib/code.js 안에서 직접 참조)
  _config: {
    BASE_URL,
    DEFAULT_EMAIL,
  },
};
