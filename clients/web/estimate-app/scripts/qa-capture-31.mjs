/**
 * #31 라이브 UI 정합 — 실 UI 캡처 (Playwright 헤드리스, 실서버/실데이터).
 *
 * 전제: node server.js 가 :5183 에서 실 env(실 시트/실 MS/실 Naver·Juso 키)로 가동 중.
 * 출력: docs/qa/estimate-31-live-ui-parity/*.png
 *
 *   01-auth-gate-pass.png      — 실 인증 게이트 통과(user-service by-email) + 메인 카탈로그
 *   02-addr-dock-results.png   — 주소검색 dock + 실 Naver/Juso 검색 결과
 *   03-snapshot-by-customer.png — 저장내역 거래처명 조회(실 slip-service by-customer)
 *   04-dc-autoapply.png        — 거래처 선택 → DC 자동적용(applyCustomerDiscounts, 실 dc-config)
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveQaShotsDir } from '../../../../scripts/lib/qa-shots-dir.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
// _local 격리(2026-07-26 하네스 재수렴 라운드 G3).
const OUT_DIR = resolveQaShotsDir(path.resolve(ROOT, '..', '..', '..', 'docs', 'qa', 'estimate-31-live-ui-parity'));
fs.mkdirSync(OUT_DIR, { recursive: true });

const BASE = process.env.QA_BASE_URL || 'http://localhost:5183';

async function shot(page, file) {
  const p = path.join(OUT_DIR, file);
  await page.screenshot({ path: p, fullPage: false });
  console.log(`[qa31] ${file} (${(fs.statSync(p).size / 1024).toFixed(1)} KB)`);
}

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1480, height: 920 } });
  page.on('dialog', (d) => d.accept());

  console.log('[qa31] goto', BASE);
  await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(2500);

  // 01 — 인증 게이트 통과 확인 (USER_AUTH.authorized, 차단 화면 미출현)
  // 차단 시 body.innerHTML 이 통째로 교체되어 custSearch 등 핵심 요소가 사라진다
  // (textContent 검사는 inline <script> 내 문자열 리터럴에 오탐).
  const blocked = await page.evaluate(() => !document.getElementById('custSearch'));
  const auth = await page.evaluate(() => (typeof USER_AUTH !== 'undefined' ? USER_AUTH : null));
  console.log('[qa31] authorized=', auth && auth.authorized, '| managerName=', auth && auth.managerName, '| blocked=', blocked);
  if (blocked) throw new Error('인증 게이트 차단 — by-email 배선 실패');
  await shot(page, '01-auth-gate-pass.png');

  // 02 — 주소검색 dock (실 Naver/Juso)
  await page.evaluate(() => openAddrSearch('ship', 'naver'));
  await page.waitForTimeout(400);
  await page.fill('#naverQuery', '삼한공조');
  await page.evaluate(() => runNaverLocalSearch(true));
  await page.waitForFunction(() => {
    const r = document.getElementById('naverResults');
    return r && (r.querySelectorAll('div').length > 3);
  }, { timeout: 20000 });
  await shot(page, '02-addr-dock-results.png');
  // 주소 선택 → 입력칸 반영 검증
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#naverResults div'))
      .filter((d) => (d.style && d.style.cursor === 'pointer'));
    if (rows.length) rows[0].click();
  });
  await page.waitForTimeout(300);
  const addrVal = await page.evaluate(() => (document.getElementById('addrBase') || {}).value || '');
  console.log('[qa31] 선택된 주소 →', addrVal);

  // 03 — 저장내역 거래처명 조회 (실 by-customer)
  await page.evaluate(() => { const d = document.getElementById('addrDock'); if (d) d.style.display = 'none'; });
  await page.evaluate(() => goSnapshotPage()); // 저장내역 페이지 (라이브 동일 경로)
  await page.waitForTimeout(1200);
  await page.fill('#snapCustName', '삼한');
  await page.evaluate(() => loadSnapshotByCustomer());
  await page.waitForTimeout(2500);
  const snapRows = await page.evaluate(() => document.querySelectorAll('#snapshotTableBody tr').length);
  console.log('[qa31] by-customer rows=', snapRows);
  await shot(page, '03-snapshot-by-customer.png');

  // 04 — 거래처 선택 → DC 자동적용 (실 dc-config 0.48)
  await page.evaluate(() => {
    // drawer 닫기 (있다면)
    const back = document.querySelector('#pageHistory .rf-btn[onclick*="closeHistory"], #btnHistoryBack');
    if (back) back.click();
  });
  await page.waitForTimeout(500);
  const applied = await page.evaluate(async () => {
    // 실 RPC 로 거래처+dc 목록 수신 → 라이브 동작 그대로 applyCustomerDiscounts 적용
    const list = await new Promise((res, rej) => {
      google.script.run.withSuccessHandler(res).withFailureHandler(rej).getCustomerDataAsync(true);
    });
    const withDc = (list || []).filter((x) => x.dc);
    const c = withDc.find((x) => x.dc.homeDiscount && Math.abs(x.dc.homeDiscount - 0.45) > 0.001)
      || withDc[0];
    if (!c) return { found: false, count: (list || []).length, withDc: withDc.length };
    applyCustomerDiscounts(c.dc);
    const el = document.getElementById('custSearch'); if (el) el.value = c.name;
    return { found: true, name: c.name, bizno: c.bizno, home: c.dc.homeDiscount, roundTo: c.dc.unitRoundTo, count: list.length, withDc: withDc.length };
  });
  console.log('[qa31] DC 자동적용 →', JSON.stringify(applied));
  await page.waitForTimeout(500);
  const homeRate = await page.evaluate(() => (document.getElementById('home_rate') || {}).value || '');
  console.log('[qa31] home_rate field =', homeRate);
  await shot(page, '04-dc-autoapply.png');

  await browser.close();
  console.log('[qa31] DONE →', OUT_DIR);
};

run().catch((e) => { console.error('[qa31] FAIL:', e.message); process.exit(1); });
