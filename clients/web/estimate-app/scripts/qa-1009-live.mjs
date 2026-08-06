/**
 * #1009 견적서 메뉴 라이브QA — 적대검증 fix 4건을 실제 화면에서 확인한다.
 *
 * 전제: dev 서버 (`node server.js`) 가 port 5183 에서 가동 중 · 로컬 스택 기동.
 *
 * 캡처 구성:
 *   01-init.png        — 진입 (승인 계정)
 *   02-home-tab.png    — 홈멀티 탭 (기존 작성·계산 경로)
 *   03-blank-row.png   — 🚨 자동 빈행: 값을 넣으면 아래에 빈행이 또 생긴다
 *   04-amount.png      — 🚨 공급가·부가세·총액
 *   05-save.png        — 🚨 견적저장 (POST · 작성자 기록)
 *   06-snapshot-list.png — 🚨 저장내역 (작성자 표시)
 *   07-reopen.png      — 🚨 다시 열었을 때 같은 금액
 *   08-edit-put.png    — 🚨 본인 수정이 화면에서 되는가 (PUT 연결)
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveQaShotsDir } from '../../../../scripts/lib/qa-shots-dir.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
// 하네스 거짓 green 가드(G3a): docs/qa 목적지는 resolveQaShotsDir 를 경유한다.
const OUT_DIR = resolveQaShotsDir(path.resolve(ROOT, '..', '..', '..', 'docs', 'qa', '1009-estimate-menu-real-qa'));
fs.mkdirSync(OUT_DIR, { recursive: true });

const BASE = process.env.QA_BASE_URL || 'http://localhost:5183';
// 기본 DEFAULT_USER_EMAIL(dev@samhan-air.com) 은 시드에 없어 미승인 처리된다.
const EMAIL = process.env.QA_EMAIL || 'dev_master@samhan-air.com';
const ENTRY = `${BASE}/?email=${encodeURIComponent(EMAIL)}`;
const log = [];

function record(step, detail) {
  const line = `[${step}] ${detail}`;
  log.push(line);
  console.log(line);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });

async function shot(file) {
  await page.screenshot({ path: path.join(OUT_DIR, file), fullPage: true });
  record('shot', file);
}

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => consoleErrors.push(String(e).slice(0, 200)));

const net = [];
page.on('response', async (r) => {
  const u = r.url();
  const m = r.request().method();
  if (m === 'GET' && !/snapshot|quote/i.test(u)) return;
  if (/localhost:5183\/?$/.test(u)) return;
  net.push(`${m} ${u.replace(BASE, '')} → ${r.status()}`);
});

page.on('dialog', async (d) => { record('dialog', `${d.type()}: ${d.message().slice(0, 160)}`); await d.accept(); });

await page.goto(ENTRY, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(4500);
const auth = await page.evaluate(() => (typeof USER_AUTH !== 'undefined' ? USER_AUTH : null));
record('인증', JSON.stringify(auth));
await shot('01-init.png');

// ── G: 기존 작성·계산 경로 — 홈멀티 탭에서 수량 입력 ─────────
await page.click('#btnGoHome');
await page.waitForTimeout(2000);
await shot('02-home-tab.png');

const qtyResult = await page.evaluate(() => {
  const inp = [...document.querySelectorAll('#homeBody .qty-input')]
    .find((e) => e.type !== 'hidden' && e.offsetParent !== null);
  if (!inp) return { ok: false, why: 'qty-input 없음' };
  const proto = Object.getPrototypeOf(inp);
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(inp, '2');
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  inp.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true, model: inp.getAttribute('data-m') || inp.getAttribute('data-sid') };
});
record('G 수량입력', JSON.stringify(qtyResult));
await page.waitForTimeout(1500);

// ── B/C: 자동 빈행 ────────────────────────────────────────
const blank = await page.evaluate(() => {
  const tb = document.getElementById('homeCustomBody');
  if (!tb) return { ok: false, why: 'homeCustomBody 없음' };
  const before = tb.querySelectorAll('tr').length;
  const row = tb.lastElementChild;
  const target = row && (row.querySelector('.pc-name') || row.querySelector('.custom-model'));
  if (!target) return { ok: false, why: '입력칸 없음', before };
  const proto = Object.getPrototypeOf(target);
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(target, '현장 실측 추가자재');
  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true, before };
});
await page.waitForTimeout(1200);
const blankAfter = await page.evaluate(() => {
  const tb = document.getElementById('homeCustomBody');
  return tb ? tb.querySelectorAll('tr').length : -1;
});
record('B 자동빈행', `${JSON.stringify(blank)} → 입력 후 행 ${blankAfter}`);
record('B 판정', blank.ok && blankAfter > blank.before ? '✅ 빈행이 자동 생성됐다' : '❌ 늘지 않았다');
await shot('03-blank-row.png');

// ── A/H: 금액 ─────────────────────────────────────────────
async function readAmounts() {
  return await page.evaluate(() => {
    const ids = ['sumSupply', 'sumVat', 'sumTotal', 'grandSupply', 'grandVat', 'grandTotal',
                 'finalSupply', 'finalVat', 'finalTotal', 'homeSubtotal'];
    const out = {};
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) out[id] = (el.value || el.textContent || '').trim().slice(0, 30);
    }
    // 화면에 보이는 금액 라벨 옆 값
    const labeled = {};
    for (const el of document.querySelectorAll('*')) {
      if (el.children.length) continue;
      const t = (el.textContent || '').trim();
      if (/^(공급가|공급가액|부가세|세액|합계|총액|총 ?금액)$/.test(t)) {
        const sib = el.nextElementSibling || el.parentElement?.nextElementSibling;
        if (sib) labeled[t] = (sib.textContent || sib.value || '').trim().slice(0, 30);
      }
    }
    return { ids: out, labeled };
  });
}
const amounts = await readAmounts();
record('A 금액', JSON.stringify(amounts));
await shot('04-amount.png');

// ── 견적저장 ──────────────────────────────────────────────
const netBefore = net.length;
await page.click('#btnSaveSnapshot');
await page.waitForTimeout(2500);
await shot('05-save.png');

// 주제 입력 모달이 뜨면 채우고 저장한다.
const modal = await page.evaluate(() => {
  const inp = [...document.querySelectorAll('dialog input, .modal input, div input')]
    .find((e) => e.offsetParent !== null && e.type === 'text'
                 && e.closest('div')?.innerText?.includes('주제'));
  if (!inp) return null;
  const proto = Object.getPrototypeOf(inp);
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(inp, 'QA 견적 2026-08-01');
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  inp.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
});
record('저장 모달', modal ? '주제 입력함' : '(모달 없음)');
if (modal) {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')]
      .find((x) => x.offsetParent !== null && (x.textContent || '').trim() === '저장'
                   && x.id !== 'btnSaveSnapshot');
    if (b) b.click();
  });
  await page.waitForTimeout(4500);
  await shot('05b-save-confirm.png');
}
record('저장 네트워크', net.slice(netBefore).join(' | ') || '(호출 없음)');

// ── 저장내역 ──────────────────────────────────────────────
const netBefore2 = net.length;
await page.evaluate(() => document.getElementById('btnLoadSnapshot').click());
await page.waitForTimeout(4000);
await shot('06-snapshot-list.png');
record('저장내역 네트워크', net.slice(netBefore2).join(' | ') || '(호출 없음)');

const listInfo = await page.evaluate(() => {
  const txt = document.body.innerText || '';
  return {
    작성자표시: /개발마스터|dev_master/.test(txt),
    행수: document.querySelectorAll('tbody tr').length,
    발췌: txt.replace(/\s+/g, ' ').slice(0, 400),
  };
});
record('저장내역 내용', JSON.stringify(listInfo));

// ── 열기 → 수정 (PUT) ─────────────────────────────────────
const netBefore3 = net.length;
// 🚨 반드시 '복원' 버튼 자체를 눌러야 restoreSnapshot 이 돌아 editingSnapshotId 가 잡힌다.
//    행(tr) 을 누르면 아무 일도 일어나지 않고, 다음 저장이 PUT 이 아니라 새 행 INSERT 가 된다.
const opened = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')]
    .find((x) => (x.textContent || '').trim() === '복원');
  if (!b) return null;
  b.click();
  return '복원 버튼 클릭';
});
await page.waitForTimeout(1500);
const editingId = await page.evaluate(() => (window.editingSnapshotId ? '설정됨' : 'null'));
record('editingSnapshotId', editingId);
record('열기 시도', opened || '(대상 없음)');
await page.waitForTimeout(4000);
await shot('07-reopen.png');
record('열기 네트워크', net.slice(netBefore3).join(' | ') || '(호출 없음)');

const amountsAfter = await readAmounts();
record('H 재조회 금액', JSON.stringify(amountsAfter));

// 수정 후 다시 저장 → PUT 인지 POST 인지
const netBefore4 = net.length;
await page.evaluate(() => { const b = document.getElementById('btnSaveSnapshot'); if (b) b.click(); });
await page.waitForTimeout(2500);
// 두 번째 저장에서도 주제 모달이 뜨면 채우고 확정한다(PUT 경로 도달).
const modal2 = await page.evaluate(() => {
  const inp = [...document.querySelectorAll('dialog input, .modal input, div input')]
    .find((e) => e.offsetParent !== null && e.type === 'text'
                 && e.closest('div')?.innerText?.includes('주제'));
  if (!inp) return false;
  const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(inp), 'value');
  d.set.call(inp, 'QA 견적 수정 2026-08-02');
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  inp.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
});
record('수정 모달', modal2 ? '주제 입력함' : '(모달 없음)');
if (modal2) {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')]
      .find((x) => x.offsetParent !== null && (x.textContent || '').trim() === '저장'
                   && x.id !== 'btnSaveSnapshot');
    if (b) b.click();
  });
  await page.waitForTimeout(4500);
}
await shot('08-edit-put.png');
const editNet = net.slice(netBefore4);
record('E 수정 네트워크', editNet.join(' | ') || '(호출 없음)');
record('E 판정', editNet.some((c) => c.startsWith('PUT')) ? '✅ PUT 이 나갔다' : '⚠️ PUT 없음');

record('console 오류', consoleErrors.length ? consoleErrors.slice(0, 6).join(' | ') : '없음');
record('전체 네트워크', net.join('\n              ') || '(없음)');

fs.writeFileSync(path.join(OUT_DIR, 'qa-log.txt'), log.join('\n') + '\n', 'utf8');
console.log('\n=== 캡처 위치 ===\n' + OUT_DIR);
await browser.close();
