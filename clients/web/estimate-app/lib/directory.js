/**
 * G2 — estimate-app 거래처/담당자 directory DB 소스 레이어.
 *
 * Google Sheets 의 '거래처'/'담당자' 탭을 직접 읽지 않고 partner-service/user-service 의
 * X-Internal-Token endpoint 를 호출해 legacy getter shape 로 변환한다.
 */

'use strict';

const axios = require('axios');

// 실제 partner-service(거래처 마스터, /internal/partners/list, 기본 8095).
// ⚠️ estimate-app 의 PARTNER_SERVICE_URL 은 레거시상 dc-config-service(:8089,
// /internal/partners/by-bizno)를 가리키므로(code.js 참조), 거래처 directory 는 인프라 표준
// SAMHAN_PARTNER_SERVICE_URL(서비스간 http://partner-service:8095)을 사용한다.
const PARTNER_BASE =
  process.env.SAMHAN_PARTNER_SERVICE_URL ||
  process.env.PARTNER_DIRECTORY_URL ||
  'http://localhost:8095';
const USER_BASE = process.env.USER_SERVICE_URL || 'http://localhost:8083';
const INTERNAL_TOKEN =
  process.env.SAMHAN_INTERNAL_TOKEN ||
  process.env.INTERNAL_AUTH_TOKEN ||
  'CHANGE_ME_LOCAL_ONLY';

const ax = axios.create({ timeout: 15000, validateStatus: () => true });
const PARTNER_PAGE_LIMIT = 5000;
const PARTNER_MAX_PAGES = 20;

function digits(v) {
  return String(v == null ? '' : v).replace(/[^\d]/g, '');
}

function str(v) {
  return String(v == null ? '' : v).trim();
}

async function getDirectory(url, params, label) {
  try {
    const resp = await ax.get(url, {
      params,
      headers: { 'X-Internal-Token': INTERNAL_TOKEN },
    });
    if (resp.status !== 200) {
      console.warn(`[directory] ${label} HTTP ${resp.status} → 빈 배열`);
      return [];
    }
    const data = resp.data && resp.data.data;
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn(`[directory] ${label} 조회 예외 → 빈 배열 (${e && e.message})`);
    return [];
  }
}

async function fetchPartners(q) {
  const rows = [];
  const query = str(q);
  for (let page = 0; page < PARTNER_MAX_PAGES; page += 1) {
    // partner DB 는 7천 건 이상일 수 있어 1페이지만 읽으면 조용히 누락된다.
    // internal endpoint 의 page 계약으로 끝 페이지까지 순차 조회한다.
    const pageRows = await getDirectory(
      `${PARTNER_BASE}/internal/partners/list`,
      { q: query, limit: PARTNER_PAGE_LIMIT, page },
      'partners',
    );
    rows.push(...pageRows);
    if (pageRows.length < PARTNER_PAGE_LIMIT) break;
    if (page === PARTNER_MAX_PAGES - 1) {
      console.warn(`[directory] partners ${PARTNER_MAX_PAGES}페이지 초과 가능성 → ${rows.length}건까지만 사용`);
    }
  }
  return rows.map((r) => ({
    code: str(r.partnerCode),
    name: str(r.name),
    bizno: digits(r.bizNo),
    manager: '',
    managerTel: '',
    rep: str(r.representative),
    addr: str(r.address),
    tel: str(r.phone),
    note: str(r.note),
    group: str(r.group),
    singleDiscount: 0,
  }));
}

async function fetchManagers(q) {
  const rows = await getDirectory(
    `${USER_BASE}/internal/users/employees`,
    { q: str(q), limit: 500 },
    'managers',
  );
  return rows.map((r) => {
    const fullName = str(r.fullName);
    const ecountCode = str(r.ecountCode);
    return {
      '담당자명': fullName,
      '담당자코드': ecountCode,
      manager: fullName,
      empCd: ecountCode,
    };
  });
}

module.exports = {
  fetchPartners,
  fetchManagers,
  PARTNER_PAGE_LIMIT,
};
