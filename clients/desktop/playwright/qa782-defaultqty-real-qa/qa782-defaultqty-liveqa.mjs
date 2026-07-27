import { resolveQaShotsDir } from '../support/qa-screenshot-dir.mjs'
// PR #796 (#782) 라이브 QA — 상업 SET 구성품 defaultQty 표시(x N)+제출(setQty*N) 정합 실증.
// 대상: PR #796 fix/782-component-defaultqty-integrity 브랜치.
//   BootstrapService.componentRows() out.put("qty", defaultComponentQty(row)) +
//   order-app explodeSetParts() qty*=p.qty 보정.
// 시드: QA782 마커(product_db classification/products/product_estimate_exposure/bundle_component) —
//   상업 SET(QA782-SET-01, 실외기 L그룹) + 구성품 1종(QA782-PART-01, default_qty=2.00).
// 실행: 실 order-app dev server(:5196, VITE_API_BASE_URL=http://localhost:8080/api/v1, mock 없음)
//       + 실 partner-auth-service(bizNo 2118712345 / PIN 1234) + 실 partner-order/product-service.
import { chromium } from '@playwright/test';

const OUT = resolveQaShotsDir(process.env.QA_OUT || 'C:/dev/Samhan-Public/docs/qa/e782-defaultqty');
const URL = process.env.QA_URL || 'http://localhost:5196/';

const SET_MODEL = 'QA782-SET-01';
const PART_MODEL = 'QA782-PART-01';

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${name}`, detail !== undefined ? JSON.stringify(detail) : '');
}

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log('  saved', name);
}
async function shotEl(page, sel, name) {
  await page.locator(sel).screenshot({ path: `${OUT}/${name}.png` });
  console.log('  saved(el)', name);
}

async function login(page) {
  await page.goto(URL, { waitUntil: 'load', timeout: 20000 });
  await page.waitForTimeout(1000);
  await page.fill('#bizGateInput', '2118712345');
  await page.click('#btnBizQuery');
  await page.waitForTimeout(1200);
  await page.fill('#authPw1', '1234');
  await page.click('#btnAuthAction');
  await page.waitForTimeout(4500);

  const gateModal = page.locator('#gateImageModal');
  if (await gateModal.isVisible().catch(() => false)) {
    await page.click('#btnImgClose').catch(() => {});
    await page.waitForTimeout(500);
  }
  const tutBox = page.locator('#tutBox');
  if (await tutBox.isVisible().catch(() => false)) {
    const skipBtn = page.locator('button:has-text("튜토리얼 스킵")');
    if (await skipBtn.isVisible().catch(() => false)) {
      await skipBtn.click();
      await page.waitForTimeout(500);
    }
  }
}

async function fillQty(page, model, qty) {
  const sel = `#commBody .qty-input[data-model="${model}"]`;
  await page.fill(sel, String(qty));
  await page.waitForTimeout(500);
}

async function readPartRow(page, setModel, partModel) {
  return page.evaluate(({ setModel, partModel }) => {
    const row = document.querySelector(`#commBody tr[data-part-of="${setModel}"][data-m="${partModel}"]`);
    if (!row) return null;
    const qtySpan = row.querySelector('td.qty .qty-set');
    const uCell = row.querySelector(`[data-cunit="${partModel}|${setModel}"]`);
    const sCell = row.querySelector(`[data-csub="${partModel}|${setModel}"]`);
    return {
      qtyText: qtySpan ? qtySpan.textContent.trim() : null,
      partQtyAttr: row.getAttribute('data-part-qty'),
      unit: uCell ? uCell.textContent.trim() : null,
      sub: sCell ? sCell.textContent.trim() : null,
    };
  }, { setModel, partModel });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text()); });

  console.log('[1] login (bizNo 2118712345 / PIN 1234)');
  await login(page);
  await shot(page, '00-login-landed');

  console.log('[2] 상업멀티 진입');
  await page.click('#btnEnterComm');
  await page.waitForTimeout(900);
  const setAnchor = page.locator(`#commBody tr[data-set-model="${SET_MODEL}"]`);
  const anchorCount = await setAnchor.count();
  record('QA782-SET-01 SET 행이 상업멀티 그리드에 렌더됨', anchorCount > 0, { anchorCount });
  if (anchorCount === 0) {
    console.log('FATAL: SET 앵커 행을 찾지 못함 — 이후 단계 스킵');
    await shotEl(page, '#cardComm', '99-fatal-no-set-anchor');
    await browser.close();
    console.log('\n=== VERDICT SUMMARY ===');
    results.forEach((r) => console.log(`  [${r.pass ? 'PASS' : 'FAIL'}] ${r.name}`));
    process.exit(1);
  }

  console.log('[3] QA782-SET-01 수량=3 입력 (구성품 default_qty=2 → 기대 표시 3 × 2, 제출 수량 6)');
  await fillQty(page, SET_MODEL, 3);
  await shotEl(page, '#cardComm', 'display-3x2');

  const partRow = await readPartRow(page, SET_MODEL, PART_MODEL);
  console.log('  part row (setQty=3):', JSON.stringify(partRow));
  record('★ 구성품 표시 "3 × 2" (setQty*defaultQty 표시, defaultQty=2 반영)', partRow?.qtyText === '3 × 2', partRow);
  record('data-part-qty 속성 = "2" (defaultQty 그대로 보존)', partRow?.partQtyAttr === '2', partRow);
  // 소계 = 단가 * (3*2=6) 이어야 함. unit 텍스트에서 콤마 제거 후 숫자화.
  const unitNum = partRow?.unit ? Number(String(partRow.unit).replace(/[^0-9.-]/g, '')) : null;
  const subNum = partRow?.sub ? Number(String(partRow.sub).replace(/[^0-9.-]/g, '')) : null;
  record('소계 = 단가 × 6 (표시 수량과 금액 정합)', unitNum != null && subNum != null && subNum === unitNum * 6,
    { unitNum, subNum, expected: unitNum != null ? unitNum * 6 : null });

  console.log('[4] 미리보기(견적/주문하기) — buildSendRows 이전 단계 확인');
  await page.click('#btnPreview');
  await page.waitForTimeout(700);
  const previewRows = await page.evaluate((partModel) => {
    const body = document.querySelector('#previewBody');
    if (!body) return [];
    return Array.from(body.querySelectorAll('tr')).map((tr) => {
      const cells = Array.from(tr.children).map((td) => td.textContent.trim());
      return cells;
    }).filter((cells) => cells.some((c) => c.includes(partModel)));
  }, PART_MODEL);
  console.log('  previewBody rows matching part model:', JSON.stringify(previewRows));
  await shot(page, '01-preview-modal');

  console.log('[5] 주문하기 -> 주문정보 입력');
  await page.click('#btnProceed');
  await page.waitForTimeout(500);

  // 카카오 우편번호 팝업 우회 — readonly 주소 필드를 JS 로 직접 채우고 input 이벤트 dispatch.
  await page.evaluate(() => {
    const setVal = (id, v) => {
      const el = document.querySelector(id);
      if (!el) return;
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    setVal('#addrBase', '서울특별시 강남구 테헤란로 501 (QA782 테스트 주소)');
    setVal('#addrDetail', '3층 QA782');
  });
  await page.check('#sameAddr');
  // tel 필드는 beforeinput 마스크(하이픈 자동삽입, 숫자만 허용)가 있어 page.fill 의
  // 통짜 insertText 가 막힘 — JS 로 직접 값 설정 + input 이벤트 dispatch 로 f() 마스크 함수를 태운다.
  await page.evaluate(() => {
    const tel = document.querySelector('#tel');
    if (tel) {
      tel.value = '01078207960';
      tel.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await page.fill('#memo', 'QA782-796 defaultQty 실증용 자동화 주문 (원복 대상)');
  const today = new Date();
  const due = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10);
  const payDue = new Date(today.getTime() + 14 * 86400000).toISOString().slice(0, 10);
  await page.fill('#due', due);
  await page.fill('#payDue', payDue);
  await page.waitForTimeout(400);
  await shot(page, '02-orderinfo-filled');

  const fieldDump = await page.evaluate(() => ({
    memo: document.querySelector('#memo')?.value,
    addrBase: document.querySelector('#addrBase')?.value,
    tel: document.querySelector('#tel')?.value,
    sameAddrChecked: document.querySelector('#sameAddr')?.checked,
    addrAuditBase: document.querySelector('#addrAuditBase')?.value,
    telValidByRegex: /^010-\d{4}-\d{4}$/.test(document.querySelector('#tel')?.value || ''),
  }));
  console.log('  field dump before send-check:', JSON.stringify(fieldDump));
  // checkOrderReady() 를 강제로 재호출 (일부 필드 input 이벤트 누락 대비 명시적 재평가)
  await page.evaluate(() => { if (typeof checkOrderReady === 'function') checkOrderReady(); });
  await page.waitForTimeout(200);

  const sendBtnDisabled = await page.isDisabled('#btnSendOrder');
  record('필수 입력 완료 -> 전송목록 확인 버튼 활성화', !sendBtnDisabled, { sendBtnDisabled, fieldDump });

  if (sendBtnDisabled) {
    console.log('FATAL: btnSendOrder 비활성 — 최종 확인 단계 스킵');
  } else {
    console.log('[6] 전송목록 확인 (buildSendRows -> explodeCommSets_ 결과 최종 렌더)');
    await page.click('#btnSendOrder');
    await page.waitForTimeout(600);
    const finalRows = await page.evaluate((partModel) => {
      const body = document.querySelector('#finalBody');
      if (!body) return [];
      return Array.from(body.querySelectorAll('tr')).map((tr) =>
        Array.from(tr.children).map((td) => td.textContent.trim())
      );
    }, PART_MODEL);
    console.log('  finalBody all rows:', JSON.stringify(finalRows, null, 2));
    await shot(page, '03-final-confirm-modal');

    const partFinalRow = finalRows.find((cells) => cells.some((c) => c.includes(PART_MODEL)));
    record('★ 최종 전송확인 표에 구성품 행 존재', !!partFinalRow, partFinalRow);
    if (partFinalRow) {
      // 컬럼: [품목, 모델명, 수량, 납품가, 소계]
      const qtyCell = partFinalRow[2];
      record('★★ 최종 전송확인 수량=6 (표시 3×2와 완전 일치 — buildSendRows 실 코드경로)', qtyCell === '6', { qtyCell, row: partFinalRow });
    }

    console.log('[7] 네트워크 payload 캡처 (실제 전송 버튼 클릭, POST /partner-orders/{id}/confirm)');
    let capturedBody = null;
    page.on('request', (req) => {
      if (req.url().includes('/partner-orders/') && req.url().includes('/confirm') && req.method() === 'POST') {
        capturedBody = req.postData();
        console.log('  [network] captured POST body length=', capturedBody ? capturedBody.length : 0);
      }
    });
    await page.click('#btnFinalSend');
    await page.waitForTimeout(3000);
    await shot(page, '04-progress-after-send');

    if (capturedBody) {
      try {
        const parsed = JSON.parse(capturedBody);
        const items = Array.isArray(parsed) ? parsed : (parsed.items || parsed[0] || []);
        console.log('  parsed payload (truncated):', JSON.stringify(parsed).slice(0, 2000));
        const line = (Array.isArray(items) ? items : []).find((it) => it && it.model === PART_MODEL);
        record('★★★ 네트워크 payload 구성품 라인 존재', !!line, line);
        if (line) {
          record('★★★ 네트워크 payload 구성품 qty=6 (제출 정합 최종 실증)', Number(line.qty) === 6, { qty: line.qty });
        }
      } catch (e) {
        console.log('  payload parse 실패:', e.message, 'raw(500):', capturedBody.slice(0, 500));
        record('네트워크 payload JSON 파싱', false, { error: e.message });
      }
    } else {
      record('네트워크 payload 캡처', false, { note: 'POST 요청 미관측 (버튼 클릭 무반응 또는 에러) — 위 finalBody DOM 검증으로 대체' });
    }
  }

  await page.close();
  await browser.close();

  console.log('\n=== VERDICT SUMMARY ===');
  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log(`  [${r.pass ? 'PASS' : 'FAIL'}] ${r.name}`));
  console.log(`\nTOTAL ${results.length} / FAIL ${failed.length}`);
  console.log(failed.length === 0 ? 'DONE ALL-PASS' : 'DONE HAS-FAILURES');
  process.exit(0); // 산출물(payload 캡처 결과)은 항상 보존 — 판정은 로그로 확인
}

main().catch((e) => { console.error('FAIL(uncaught)', e); process.exit(1); });
