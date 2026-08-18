import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolveQaShotsDir } from '../../../scripts/lib/qa-shots-dir.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');
const APP = path.join(REPO, 'clients', 'web', 'estimate-app');
const requireFromApp = createRequire(path.join(APP, 'package.json'));
const { chromium } = requireFromApp('playwright');

const BASE_URL = process.env.QA_BASE_URL || 'http://127.0.0.1:5183';
const EMAIL = process.env.QA_EMAIL || 'dev_master@samhan-air.com';
const OUT = process.env.QA_BASELINE_OUT_DIR
  ? path.resolve(REPO, process.env.QA_BASELINE_OUT_DIR)
  : HERE;
fs.mkdirSync(OUT, { recursive: true });
const SHOTS = resolveQaShotsDir(path.join(OUT, 'screenshots'));

function writeJson(name, value) {
  fs.writeFileSync(path.join(OUT, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function resolveGitDir() {
  const dotGit = path.join(REPO, '.git');
  const stat = fs.statSync(dotGit);
  if (stat.isDirectory()) return dotGit;
  const marker = fs.readFileSync(dotGit, 'utf8').trim();
  const match = /^gitdir:\s*(.+)$/i.exec(marker);
  if (!match) throw new Error('.git 포인터를 해석할 수 없습니다.');
  return path.resolve(REPO, match[1]);
}

function resolveCommitSha() {
  const gitDir = resolveGitDir();
  const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
  if (!head.startsWith('ref: ')) return head;
  const ref = head.slice(5).trim();
  const loose = path.join(gitDir, ...ref.split('/'));
  if (fs.existsSync(loose)) return fs.readFileSync(loose, 'utf8').trim();
  const commonDirFile = path.join(gitDir, 'commondir');
  const commonDir = fs.existsSync(commonDirFile)
    ? path.resolve(gitDir, fs.readFileSync(commonDirFile, 'utf8').trim())
    : gitDir;
  const commonLoose = path.join(commonDir, ...ref.split('/'));
  if (fs.existsSync(commonLoose)) return fs.readFileSync(commonLoose, 'utf8').trim();
  const packed = path.join(commonDir, 'packed-refs');
  if (fs.existsSync(packed)) {
    const line = fs.readFileSync(packed, 'utf8').split(/\r?\n/)
      .find((entry) => entry.endsWith(` ${ref}`));
    if (line) return line.split(' ')[0];
  }
  throw new Error(`commit SHA를 찾지 못했습니다: ${ref}`);
}

function readAppSheetConstants() {
  const source = fs.readFileSync(path.join(APP, 'lib', 'code.js'), 'utf8');
  const names = ['HOME_NAME', 'SINGLE_NAME', 'SINGLE_PARTS_NAME', 'COMM_NAME', 'COMM_PARTS_NAME'];
  return Object.fromEntries(names.map((name) => {
    const match = new RegExp(`const\\s+${name}\\s*=\\s*['\"]([^'\"]+)['\"]`).exec(source);
    return [name, match ? match[1] : null];
  }));
}

const pkg = JSON.parse(fs.readFileSync(path.join(APP, 'package.json'), 'utf8'));
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({
  viewport: { width: 1600, height: 1200 },
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul',
});
const page = await context.newPage();
const pageErrors = [];
const httpFailures = [];
page.on('pageerror', (error) => pageErrors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') pageErrors.push(message.text());
});
page.on('response', (response) => {
  if (response.status() >= 400) {
    httpFailures.push({ method: response.request().method(), url: response.url(), status: response.status() });
  }
});
page.on('dialog', (dialog) => dialog.dismiss().catch(() => {}));

try {
  const acquiredAt = new Date();
  await page.goto(`${BASE_URL}/?email=${encodeURIComponent(EMAIL)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });
  await page.waitForFunction(() => (
    typeof HOMEMULTI !== 'undefined'
      && typeof SINGLE_SETS !== 'undefined'
      && HOMEMULTI.length > 0
      && SINGLE_SETS.length > 0
  ), null, { timeout: 90_000 });
  await page.waitForTimeout(2_000);
  await page.evaluate(() => {
    renderHomeOptions();
    renderSingleOptions();
    renderCommOptions();
    window.__qa896SelectSingle = (model, quantity) => {
      const set = SINGLE_SETS.find((row) => row.model === model);
      if (!set) throw new Error(`고정 세트가 없습니다: ${model}`);
      renderSingle();
      const input = document.querySelector(`#singleBody .qty-input[data-sid="${CSS.escape(set.id)}"]`);
      if (!input) throw new Error(`고정 세트 수량 입력칸이 없습니다: ${model} / ${set.id}`);
      input.value = String(quantity);
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return set;
    };
  });

  const connection = await page.evaluate(() => ({
    homeMulti: HOMEMULTI.length,
    singleSets: SINGLE_SETS.length,
    singleParts: SINGLE_PARTS.length,
    commercialMulti: COMMULTI.length,
    commercialParts: COMM_PARTS.length,
    oldProducts: OLD_PRODUCTS.length,
    samples: {
      home: HOMEMULTI.slice(0, 2).map(({ model, name, price }) => ({ model, name, price })),
      singleSet: SINGLE_SETS.slice(0, 2).map(({ model, name, price }) => ({ model, name, price })),
      singlePart: SINGLE_PARTS.slice(0, 2).map(({ setModel, model, name, price }) => ({ setModel, model, name, price })),
      commercial: COMMULTI.slice(0, 2).map(({ model, name, price }) => ({ model, name, price })),
    },
  }));
  if (connection.homeMulti === 0 || connection.singleSets === 0 || connection.singleParts === 0
      || connection.commercialMulti === 0 || connection.commercialParts === 0) {
    throw new Error(`실시트 연결 증거가 불충분합니다: ${JSON.stringify(connection)}`);
  }

  const metadata = {
    schemaVersion: 1,
    purpose: '#896 Google Sheets 이관 전 레거시 출력 기준선',
    acquiredAtUtc: acquiredAt.toISOString(),
    acquiredAtKst: acquiredAt.toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).replace(' ', 'T') + '+09:00',
    baseUrl: BASE_URL,
    catalogSource: 'sheet',
    spreadsheetId: '<SHEET_ID>',
    app: { name: pkg.name, version: pkg.version, commitSha: resolveCommitSha() },
    tabsReadByCurrentAppConstants: readAppSheetConstants(),
    canonicalTabsByDeveloperDirection: ['홈멀티', '싱글 세트', '싱글 구성품', '상업멀티', '상업멀티 구성'],
    priceOverlayConvention: '_단가인상 접미사 탭은 인상단가 오버레이',
    connection,
  };
  writeJson('00-metadata.json', metadata);

  const catalog = await page.evaluate(() => {
    const project = (rows, source) => rows.map((row, index) => ({
      source,
      index,
      model: row.model ?? '',
      name: row.name ?? '',
      unit: row.unit ?? '',
      price: Number(row.price ?? row.priceRight ?? 0),
      list: Number(row.list ?? row.listPrice ?? 0),
      categoryLarge: row.catL ?? '',
      categoryMedium: row.catM ?? '',
      categorySmall: row.catS ?? '',
      capacity: Number(row.capacity ?? 0),
      spec: row.spec ?? '',
      note: row.note ?? '',
      setModel: row.setModel ?? row.refModel ?? '',
      kind: row.kind ?? '',
      feature: row.feat ?? '',
      isDefault: row.isDefault === true,
      componentQuantity: row.qty ?? '',
      variablePrice: row.useK2 === true,
      fixedDiscount: row['고정DC'] ?? row.fixedDC ?? '',
    }));
    return {
      counts: {
        homeMulti: HOMEMULTI.length,
        singleSets: SINGLE_SETS.length,
        singleParts: SINGLE_PARTS.length,
        commercialMulti: COMMULTI.length,
        commercialParts: COMM_PARTS.length,
        oldProducts: OLD_PRODUCTS.length,
      },
      categoryDistribution: Object.fromEntries([
        ['homeMulti', HOMEMULTI], ['singleSets', SINGLE_SETS], ['commercialMulti', COMMULTI], ['oldProducts', OLD_PRODUCTS],
      ].map(([key, rows]) => [key, rows.reduce((acc, row) => {
        const category = [row.catL, row.catM, row.catS].filter(Boolean).join(' > ') || '(미분류)';
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      }, {})])),
      rows: [
        ...project(HOMEMULTI, 'HOME_MULTI'),
        ...project(SINGLE_SETS, 'SINGLE_SET'),
        ...project(SINGLE_PARTS, 'SINGLE_COMPONENT'),
        ...project(COMMULTI, 'COMMERCIAL_MULTI'),
        ...project(COMM_PARTS, 'COMMERCIAL_COMPONENT'),
        ...project(OLD_PRODUCTS, 'OLD_PRODUCT'),
      ],
    };
  });
  writeJson('01-catalog-and-categories.json', catalog);

  const expansions = await page.evaluate(() => {
    const normalizePart = (part) => ({
      model: part.model ?? '',
      name: part.name ?? '',
      kind: part.kind ?? '',
      feature: part.feat ?? '',
      isDefault: part.isDefault === true,
      unit: part.unit ?? '',
      quantity: Number(part.qty ?? 0),
      unitPrice: Number(part.price ?? 0),
      subtotal: Number(part.qty ?? 0) * Number(part.price ?? 0),
      spec: part.spec ?? '',
    });
    const single = SINGLE_SETS.map((set) => {
      try {
        const parts = explodeSetParts({ ...set, isSet: true }, 1, null) || [];
        return { model: set.model, name: set.name, quantity: 1, error: null, parts: parts.map(normalizePart) };
      } catch (error) {
        return { model: set.model, name: set.name, quantity: 1, error: String(error), parts: [] };
      }
    });
    const commercial = COMMULTI
      .filter((row) => String(row.unit || '').toUpperCase() === 'SET')
      .map((set) => {
        try {
          const parts = explodeCommSets_(set, 1) || [];
          return { model: set.model, name: set.name, quantity: 1, error: null, parts: parts.map(normalizePart) };
        } catch (error) {
          return { model: set.model, name: set.name, quantity: 1, error: String(error), parts: [] };
        }
      });
    return { single, commercial };
  });
  writeJson('02-set-expansion.json', expansions);

  const options = await page.evaluate(() => {
    const relevant = Array.from(document.querySelectorAll('input[id], select[id]'))
      .filter((element) => /^(home_|ss_|comm_|chkHomeInc|chkSingleInc|chkCommInc|selCutUnit|chkCardPay|payDuePre)/.test(element.id));
    const controls = relevant.map((element) => ({
      id: element.id,
      type: element.tagName === 'SELECT' ? 'select' : element.type,
      value: element.value,
      checked: 'checked' in element ? element.checked : null,
      choices: element.tagName === 'SELECT'
        ? Array.from(element.options).map((option) => ({ value: option.value, label: option.textContent, selected: option.selected }))
        : [],
    }));
    window.__qa896InitialControls = Object.fromEntries(controls.map((control) => [control.id, control]));
    return {
      controls,
      defaultsFromSheet: { home: HOME_DEFAULTS, single: SINGLE_DEFAULTS },
      componentFeatures: SINGLE_PARTS.map((part) => ({
        setModel: part.setModel ?? '', model: part.model ?? '', name: part.name ?? '', kind: part.kind ?? '',
        feature: part.feat ?? '', isDefault: part.isDefault === true,
      })),
    };
  });
  writeJson('03-options-features-defaults.json', options);

  async function resetState() {
    await page.evaluate(() => {
      for (const mapName of ['homeQty', 'singleQty', 'commQty', 'oldQty', 'homeCustomPrices', 'singleCustomPrices', 'commCustomPrices', 'oldCustomPrices', 'homeCustomListPrices', 'commCustomListPrices']) {
        try { eval(mapName).clear(); } catch (_) { /* optional state */ }
      }
      for (const setName of ['HOME_MANUAL_HOSE', 'HOME_MANUAL_BRANCH', 'COMM_MANUAL_PANEL', 'COMM_MANUAL_HOSE', 'COMM_MANUAL_REMOTE', 'COMM_MANUAL_PUMP', 'COMM_MANUAL_BASE']) {
        try { eval(setName).clear(); } catch (_) { /* optional state */ }
      }
      if (window.ABSOLUTE_LOCK?.clear) window.ABSOLUTE_LOCK.clear();
      for (const [id, initial] of Object.entries(window.__qa896InitialControls || {})) {
        const element = document.getElementById(id);
        if (!element) continue;
        if ('checked' in element && initial.checked != null) element.checked = initial.checked;
        if (initial.value != null) element.value = initial.value;
      }
      const card = document.getElementById('chkCardPay');
      const advance = document.getElementById('payDuePre');
      const cutoff = document.getElementById('selCutUnit');
      if (card) card.checked = false;
      if (advance) advance.checked = false;
      if (cutoff) cutoff.value = '0';
      window.previewMode = 'DETAIL';
    });
  }

  const quantityDerived = {};
  await resetState();
  quantityDerived.home = await page.evaluate(() => {
    const inputs = { AJ060MXHNBC1: 1, AJ012BN1PBC2: 2, AM052BN4DBH1: 1 };
    for (const [model, quantity] of Object.entries(inputs)) homeQty.set(model, quantity);
    recomputeHomeDerived(false);
    const output = Array.from(homeQty.entries())
      .filter(([, quantity]) => quantity !== 0)
      .map(([model, quantity]) => {
        const row = HOMEMULTI.find((item) => item.model === model) || {};
        return { model, name: row.name ?? '', quantity, derived: !(model in inputs) };
      });
    return { inputs, output };
  });

  await resetState();
  quantityDerived.commercial = await page.evaluate(() => {
    const inputs = { AM072TNCDBH1: 2, AM052DNLDBH1: 1 };
    for (const [model, quantity] of Object.entries(inputs)) commQty.set(model, quantity);
    recomputeCommDerived();
    const output = Array.from(commQty.entries())
      .filter(([, quantity]) => quantity !== 0)
      .map(([model, quantity]) => {
        const row = COMMULTI.find((item) => item.model === model) || {};
        return { model, name: row.name ?? '', quantity, derived: !(model in inputs) };
      });
    return { inputs, output };
  });
  writeJson('04-quantity-derived.json', quantityDerived);

  async function collectScenario(id, inputDescription, configure) {
    await resetState();
    const configured = await page.evaluate(configure);
    const result = await page.evaluate(() => {
      const sections = getStructuredQuoteData();
      const grossTotal = sections.reduce((sum, section) => sum + Number(section.total || 0), 0);
      const vatRate = Number(CONFIG.vatRate ?? 0.1);
      const supplyAmount = Math.round(grossTotal / (1 + vatRate));
      return {
        selectedOptions: Object.fromEntries(
          Array.from(document.querySelectorAll('input[id], select[id]'))
            .filter((element) => /^(home_|ss_|comm_|chkHomeInc|chkSingleInc|chkCommInc|selCutUnit|chkCardPay|payDuePre)/.test(element.id))
            .map((element) => [element.id, element.type === 'checkbox' || element.type === 'radio' ? element.checked : element.value])),
        sections,
        amounts: {
          vatRate,
          supplyAmount,
          vatAmount: grossTotal - supplyAmount,
          grossTotal,
        },
      };
    });
    return { id, input: inputDescription, configured, ...result };
  }

  const scenarios = [];
  scenarios.push(await collectScenario(
    'single-item',
    { items: [{ sector: 'HOME', model: 'AJ060MXHNBC1', quantity: 2 }], options: '시트 기본값' },
    () => {
      homeQty.set('AJ060MXHNBC1', 2);
      return { model: 'AJ060MXHNBC1', quantity: 2, unitPrice: getRealHomePrice('AJ060MXHNBC1') };
    },
  ));

  scenarios.push(await collectScenario(
    'single-set-default',
    { items: [{ sector: 'SINGLE', model: 'AC060CS6PBH1SY', quantity: 1 }], options: '시트 기본값' },
    () => {
      const set = window.__qa896SelectSingle('AC060CS6PBH1SY', 1);
      return { id: set.id, model: set.model, quantity: 1, unitPrice: getRealSinglePrice(set.id) };
    },
  ));

  scenarios.push(await collectScenario(
    'single-set-options',
    {
      items: [{ sector: 'SINGLE', model: 'AC060CS6PBH1SY', quantity: 1 }],
      options: { panel: '블랙판넬', panelShape360: '사각', remote: '유선리모컨' },
    },
    () => {
      const choose = (id, matcher) => {
        const element = document.getElementById(id);
        if (!element) throw new Error(`옵션 컨트롤 없음: ${id}`);
        const option = Array.from(element.options).find((candidate) => matcher.test(`${candidate.value} ${candidate.textContent}`));
        if (!option) throw new Error(`옵션 값 없음: ${id} / ${matcher}`);
        element.value = option.value;
        return option.value;
      };
      const selected = {
        panel: choose('ss_panel', /블랙/),
        panelShape360: choose('ss_p360', /사각/),
        remote: choose('ss_remote', /^유선리모컨(?:\s|$)/),
      };
      const set = window.__qa896SelectSingle('AC060CS6PBH1SY', 1);
      return { id: set.id, model: set.model, quantity: 1, selected, unitPrice: getRealSinglePrice(set.id) };
    },
  ));

  scenarios.push(await collectScenario(
    'single-set-discount',
    {
      items: [{ sector: 'SINGLE', model: 'AC060CS6PBH1SY', quantity: 2 }],
      options: { discount360WonPerSet: 50_000 },
    },
    () => {
      const discount = document.getElementById('ss_disc_360');
      if (!discount) throw new Error('ss_disc_360 옵션이 없습니다.');
      discount.value = '50000';
      const set = window.__qa896SelectSingle('AC060CS6PBH1SY', 2);
      return { id: set.id, model: set.model, quantity: 2, discount360WonPerSet: 50_000, unitPrice: getRealSinglePrice(set.id) };
    },
  ));

  scenarios.push(await collectScenario(
    'freight-and-cutoff',
    {
      items: [
        { sector: 'HOME', model: 'AJ060MXHNBC1', quantity: 1 },
        { sector: 'HOME', model: '운임', quantity: 1, manualUnitPrice: 120_000 },
      ],
      options: { automaticCutoffUnitWon: 1_000 },
    },
    () => {
      homeQty.set('AJ060MXHNBC1', 1);
      homeQty.set('운임', 1);
      homeCustomPrices.set('운임', 120000);
      const cutoff = document.getElementById('selCutUnit');
      if (!cutoff) throw new Error('selCutUnit 옵션이 없습니다.');
      cutoff.value = '1000';
      return {
        items: [
          { model: 'AJ060MXHNBC1', quantity: 1, unitPrice: getRealHomePrice('AJ060MXHNBC1') },
          { model: '운임', quantity: 1, unitPrice: getRealHomePrice('운임') },
        ],
        automaticCutoffUnitWon: 1_000,
      };
    },
  ));
  writeJson('05-price-scenarios.json', { scenarios });

  await resetState();
  await page.evaluate(() => {
    document.querySelectorAll('#pageBizGate, #mobileGate').forEach((element) => element.classList.add('hidden'));
  });
  await page.screenshot({ path: path.join(SHOTS, '01-live-sheet-initial.png'), fullPage: false });

  await page.evaluate(() => {
    window.__qa896SelectSingle('AC060CS6PBH1SY', 1);
    goPreview();
  });
  const preview = page.locator('#cardPreview');
  if (await preview.count()) {
    await preview.screenshot({ path: path.join(SHOTS, '02-single-set-default-preview.png') });
  }

  writeJson('99-runtime-diagnostics.json', {
    pageErrors: [...new Set(pageErrors)].sort(),
    httpFailures,
    capturedAtUtc: new Date().toISOString(),
  });
  console.log(JSON.stringify({ ok: true, connection, scenarios: scenarios.map((scenario) => scenario.id), shots: SHOTS }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
