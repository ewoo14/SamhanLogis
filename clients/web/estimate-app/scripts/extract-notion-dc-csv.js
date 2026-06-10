/**
 * #29 — 레거시 Notion '거래처별 DC리스트' → DcConfigImportService CSV 추출.
 *
 * 사용:
 *   NOTION_TOKEN=<ntn_...> node scripts/extract-notion-dc-csv.js [출력경로]
 *   (NOTION_TOKEN 미설정 시 tools/legacy-gas/종합견적서-live/Code.js 의
 *    NOTION_TOKEN 상수를 런타임 파싱 — 해당 파일은 gitignored 로컬 전용)
 *
 * 출력 기본값: <repo>/.claude/tmp/dc-config-notion.csv (gitignored)
 * ⚠️ 출력 CSV 는 거래처 할인 영업 데이터 — 레포(PUBLIC) 커밋 절대 금지.
 *    적재는 dc-config-service POST /api/v1/dc-config/admin/import 런타임 호출로만.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const DB_ID = '193a1006d6588161a02cc8f196d7102b'; // 거래처별 DC리스트 (식별자 — 비밀 아님)
// 다중 data source DB 라 2025-09-03 data_sources 방식 필수 (라이브 getAllNotionDcConfigs_ 동일)
const NOTION_VER = '2025-09-03';

function resolveToken() {
  if (process.env.NOTION_TOKEN) return process.env.NOTION_TOKEN.trim();
  const livePath = path.join(__dirname, '..', '..', '..', '..',
    'tools', 'legacy-gas', '종합견적서-live', 'Code.js');
  if (fs.existsSync(livePath)) {
    const src = fs.readFileSync(livePath, 'utf8');
    const m = src.match(/var NOTION_TOKEN = '([^']+)'/);
    if (m && m[1].startsWith('ntn_')) return m[1];
  }
  throw new Error('NOTION_TOKEN 미확보 — env 또는 종합견적서-live/Code.js 필요');
}

const plain = (rich) => (Array.isArray(rich) ? rich.map((t) => t.plain_text || '').join('') : '');
const csvCell = (v) => {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function main() {
  const token = resolveToken();
  const outPath = process.argv[2]
    || path.join(__dirname, '..', '..', '..', '..', '.claude', 'tmp', 'dc-config-notion.csv');

  const headers = { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VER };

  // data_source 해석 (라이브 getAllNotionDcConfigs_ 동일 패턴)
  const dbResp = await axios.get(`https://api.notion.com/v1/databases/${DB_ID}`, { headers });
  const sources = dbResp.data.data_sources || [];
  if (!sources.length) throw new Error('data_sources 없음');
  const dsId = sources[0].id;
  console.log(`data_source: ${dsId} (총 ${sources.length}개 중 1번째)`);

  const rows = [];
  let cursor = null;
  let pages = 0;
  do {
    const resp = await axios.post(
      `https://api.notion.com/v1/data_sources/${dsId}/query`,
      cursor ? { page_size: 100, start_cursor: cursor } : { page_size: 100 },
      { headers },
    );
    const body = resp.data;
    for (const page of body.results || []) {
      const p = page.properties || {};
      const num = (n) => (p[n] && typeof p[n].number === 'number' ? p[n].number : null);
      const chk = (n) => (p[n] && p[n].checkbox === true);
      const sel = (n) => (p[n] && p[n].select ? String(p[n].select.name || '').trim() : '');
      const codeNum = num('거래처코드');
      rows.push({
        code: codeNum == null ? '' : String(Math.trunc(codeNum)),
        name: plain(p['업체명'] && p['업체명'].title),
        homeDc: num('홈멀티DC'),
        commDc: num('상업멀티DC'),
        iHose: chk('유연호스I형') ? 'Yes' : 'No',
        d360: num('360'),
        d4way: num('4way'),
        d1way: num('1way'),
        stand: num('스탠드'),
        deluxe: num('디럭스'),
        firstGrade: num('1등급'),
        unitProc: sel('단위처리'),
        note: plain(p['특이사항'] && p['특이사항'].rich_text),
      });
    }
    cursor = body.has_more ? body.next_cursor : null;
    pages++;
  } while (cursor);

  const pct = (v) => {
    if (v == null) return '';
    const n = Math.round(v * 10000) / 100; // 소수 2자리 정밀
    return `${n}%`;
  };
  const won = (v) => (v == null ? '' : String(Math.trunc(v)));

  // 정합 가드 — 사업자번호는 10자리 (Notion number 타입의 leading-zero 손실은
  // 구조적으로 비발현: 세무서코드(앞 3자리)는 0 시작 불가 + 레거시도 number 운영.
  // 그래도 10자리 미만 발견 시 경고로 드러낸다 — silent 적재 금지).
  const badCodes = rows.filter((r) => r.code && r.code.length !== 10).map((r) => `${r.code}(${r.name})`);
  if (badCodes.length) {
    console.warn(`⚠️ 10자리 아닌 거래처코드 ${badCodes.length}건 — 수동 확인 필요: ${badCodes.slice(0, 10).join(', ')}`);
  }

  const header = ['거래처코드', '업체명', '홈멀티DC', '상업멀티DC', '유연호스I형',
    '360', '4way', '1way', '스탠드', '디럭스', '1등급', '단위처리', '특이사항'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      r.code, r.name, pct(r.homeDc), pct(r.commDc), r.iHose,
      won(r.d360), won(r.d4way), won(r.d1way), won(r.stand), won(r.deluxe), won(r.firstGrade),
      r.unitProc, r.note,
    ].map(csvCell).join(','));
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `﻿${lines.join('\n')}\n`, 'utf8');

  const withCode = rows.filter((r) => r.code).length;
  const unitDist = {};
  rows.forEach((r) => { if (r.unitProc) unitDist[r.unitProc] = (unitDist[r.unitProc] || 0) + 1; });
  console.log(`총 ${rows.length}행 (API ${pages}페이지) | 거래처코드 보유 ${withCode} | 단위처리 분포 ${JSON.stringify(unitDist)}`);
  console.log(`출력: ${outPath}`);
}

main().catch((e) => { console.error('추출 실패:', e.response ? `${e.response.status} ${JSON.stringify(e.response.data).slice(0, 300)}` : e.message); process.exit(1); });
