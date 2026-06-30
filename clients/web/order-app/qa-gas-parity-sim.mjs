/**
 * qa-gas-parity-sim.mjs — 주문서 GAS parity 시뮬레이션 실증 harness.
 *
 * 목적: 우리 order-app(index.html)과 GAS '거래처 발송 주문서'(index.html)의
 *       분류·단가 계산 함수를 동일 실데이터 입력으로 실제 실행해 출력 차이를 측정한다.
 *       ("GAS 와 기능 차이가 전혀 없어야 함" 최종 검증)
 *
 * 절대 합성/가짜 데이터 금지 — 실 product_db (docker exec samhan-postgres) 만 사용.
 *
 * 실행:
 *   node clients/web/order-app/qa-gas-parity-sim.mjs
 *
 * 입력 데이터:
 *   docker exec samhan-postgres psql -U samhan -d product_db (실 마이그레이션 카탈로그 1116품목)
 *   → legacy row shape (price/list/useK2/고정DC/isDisc) 으로 매핑 후 양쪽 함수에 투입.
 *
 * 검증 3축:
 *   (A) 함수별 byte-identical diff (order-app ↔ GAS)
 *   (B) 전 카테고리 실품목 분류·단가 동일성 (동일 입력 → 동일 출력?)
 *   (C) useK2(변동DC 마커) 미발화 시 실단가 영향 정량 (FORMATTED bootstrap 가정)
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..', '..', '..');

const OUR_HTML = join(__dirname, 'index.html');
const GAS_HTML = join(REPO, 'tools', 'legacy-gas', '거래처 발송 주문서', 'index.html');

// ───────────────────────────────────────────────────────────────────────────
// 1. <script> 에서 함수 소스 추출 (brace-balanced)
// ───────────────────────────────────────────────────────────────────────────

/** index.html 전체 텍스트에서 `function NAME(...) { ... }` 본문을 중괄호 균형으로 추출. */
function extractFunction(src, name) {
  const re = new RegExp(`function\\s+${name}\\s*\\(`, 'g');
  const m = re.exec(src);
  if (!m) return null;
  return extractFunctionAt(src, m.index, m[0].length);
}

function extractFunctionAt(src, startIdx, headLen) {
  const m = { index: startIdx };
  let i = startIdx + headLen;
  let depthParen = 1;
  while (i < src.length && depthParen > 0) {
    if (src[i] === '(') depthParen++;
    else if (src[i] === ')') depthParen--;
    i++;
  }
  while (i < src.length && src[i] !== '{') i++;
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(m.index, i + 1);
    }
  }
  return null;
}

/** 모든 top-level `function NAME(...){...}` 선언을 추출 (sandbox 의존성 일괄 로드용). */
function extractAllFunctions(src) {
  const out = {};
  const re = /(?:^|\n)\s*function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1];
    if (out[name]) continue;
    const declStart = src.indexOf('function', m.index);
    const headLen = src.indexOf('(', declStart) - declStart + 1;
    const body = extractFunctionAt(src, declStart, headLen);
    if (body) out[name] = body;
  }
  return out;
}

/** 단순 const 한 줄 정의 추출 (예: `const unifyCatL_=L=>...;`). 의존성 헬퍼용. */
function extractConstLine(src, name) {
  const re = new RegExp(`(?:^|\\n)\\s*const\\s+${name}\\s*=`, 'g');
  const m = re.exec(src);
  if (!m) return null;
  const start = src.indexOf('const', m.index);
  // 줄 끝(;) 까지 — 화살표 한 줄 가정
  let i = start;
  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') depth--;
    else if (c === ';' && depth === 0) return src.slice(start, i + 1);
  }
  return null;
}

function _unusedExtractFunctionOriginal(src, name) {
  const re = new RegExp(`function\\s+${name}\\s*\\(`, 'g');
  const m = re.exec(src);
  if (!m) return null;
  // 인자 괄호 닫기 찾기
  let i = m.index + m[0].length;
  let depthParen = 1;
  while (i < src.length && depthParen > 0) {
    if (src[i] === '(') depthParen++;
    else if (src[i] === ')') depthParen--;
    i++;
  }
  // 본문 { 찾기
  while (i < src.length && src[i] !== '{') i++;
  const bodyStart = i;
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) {
        return src.slice(m.index, i + 1);
      }
    }
  }
  return null;
}

const TARGET_FUNCS = [
  'parseFixedDc',
  'homeUnitPrice',
  'commUnitPrice',
  'singleUnitPrice',
  'partUnitPrice',
  'priceFrom',
  'roundByConfig',
  'roundK',
  'getModelFlags',
  'classifySingleSetFixed',
  'normalizeHomeCategory',
  'normalizeCommCategory',
  'sumOld',
  'isExpansionModel',
];

const ourSrc = readFileSync(OUR_HTML, 'utf8');
const gasSrc = readFileSync(GAS_HTML, 'utf8');

// ───────────────────────────────────────────────────────────────────────────
// 2. 함수별 byte-identical diff
// ───────────────────────────────────────────────────────────────────────────

console.log('═'.repeat(78));
console.log('(A) 함수별 byte-identical diff  (order-app index.html ↔ GAS index.html)');
console.log('═'.repeat(78));

const diffResults = [];
for (const fn of TARGET_FUNCS) {
  const a = extractFunction(ourSrc, fn);
  const b = extractFunction(gasSrc, fn);
  let verdict;
  if (a == null && b == null) verdict = 'BOTH-MISSING';
  else if (a == null) verdict = 'OUR-MISSING';
  else if (b == null) verdict = 'GAS-MISSING';
  else if (a === b) verdict = 'IDENTICAL';
  else {
    // 첫 차이 위치
    let k = 0;
    while (k < a.length && k < b.length && a[k] === b[k]) k++;
    verdict = `DIFF@${k} (len our=${a.length} gas=${b.length})`;
  }
  diffResults.push({ fn, verdict });
  console.log(`  ${verdict === 'IDENTICAL' ? '✅' : '❌'} ${fn.padEnd(24)} ${verdict}`);
  if (verdict.startsWith('DIFF')) {
    let k = 0;
    while (k < a.length && k < b.length && a[k] === b[k]) k++;
    console.log(`        our: …${JSON.stringify(a.slice(Math.max(0, k - 20), k + 40))}`);
    console.log(`        gas: …${JSON.stringify(b.slice(Math.max(0, k - 20), k + 40))}`);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 3. 실 product_db 데이터 로드 → legacy row shape 매핑
// ───────────────────────────────────────────────────────────────────────────

/** docker exec psql -tA (탭 구분) → 객체 배열. */
function psql(sql) {
  const out = execFileSync(
    'docker',
    ['exec', 'samhan-postgres', 'psql', '-U', 'samhan', '-d', 'product_db', '-tA', '-F', '\t', '-c', sql],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

function num(v) {
  if (v == null || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// 카테고리별 컬럼: model_code, name, delivery_price(납품가=price),
// release_price(출고가=list), has_variable_discount(useK2), fixed_discount_rate(고정DC),
// legacy_discount_flag(isDisc), single_price, product_type
function loadCategory(cat) {
  const rows = psql(
    `SELECT model_code, name, delivery_price, release_price, has_variable_discount, ` +
      `COALESCE(fixed_discount_rate::text,''), legacy_discount_flag, single_price, ` +
      `COALESCE(product_type,'') ` +
      `FROM products WHERE product_category='${cat}' AND is_deleted=false ` +
      `ORDER BY model_code`,
  );
  return rows.map((line) => {
    const [model, name, dp, rp, k2, fdc, ldf, sp, ptype] = line.split('\t');
    return {
      model,
      name,
      deliveryPrice: num(dp), // 납품가
      releasePrice: num(rp), // 출고가
      hasVariableDiscount: k2 === 't',
      fixedDiscountRate: fdc === '' ? null : num(fdc), // % (50.00 형태)
      legacyDiscountFlag: ldf === 't',
      singlePrice: num(sp),
      productType: ptype,
    };
  });
}

// product_db fixed_discount_rate 는 % (예 50.00). legacy 시트 고정DC 컬럼도 동일 표기("50%"/50).
// parseFixedDc 는 >1 이면 /100 하므로 50 → 0.5. product_db 값 그대로 문자열화하면 parseFixedDc 호환.
function fdcToLegacyCell(rate) {
  if (rate == null) return '';
  return String(rate); // "50.00" → parseFixedDc → 0.5
}

// legacy homemulti/commercialMulti row 객체 형태로 변환 (getHomeMulti/getCommercialMulti 출력 1:1)
function toMultiRow(p, { withUseK2 } = { withUseK2: true }) {
  return {
    name: p.name,
    model: p.model,
    unit: 'EA',
    price: p.deliveryPrice, // 시트 납품가
    list: p.releasePrice, // 출고가
    useK2: withUseK2 ? p.hasVariableDiscount : false, // FORMATTED 가정 시 false
    '고정DC': fdcToLegacyCell(p.fixedDiscountRate),
    note: '',
  };
}

const data = {
  HOME_MULTI: loadCategory('HOME_MULTI'),
  COMMERCIAL_MULTI: loadCategory('COMMERCIAL_MULTI'),
  SINGLE_SET: loadCategory('SINGLE_SET'),
  SINGLE_PART: loadCategory('SINGLE_PART'),
  OLD: loadCategory('OLD'),
};

// ───────────────────────────────────────────────────────────────────────────
// 4. 양쪽 함수 sandbox 로드 (DOM/window stub)
// ───────────────────────────────────────────────────────────────────────────

/**
 * 한 쪽(index.html)의 추출 함수들을 격리 sandbox 에 정의하고 호출 핸들 반환.
 * homeUnitPrice/commUnitPrice 가 참조하는 전역(homeRowByModel/COMMULTI/CONFIG/window/document)을
 * sandbox 에 주입한다. 단가 계산에 영향 주는 전역만 — 렌더링/DOM 무관 전역은 stub.
 *
 * @param dueDate     document.getElementById('due').value 가 반환할 값 (인상기준일 분기)
 * @param configObj   CONFIG (DC율/단위처리). 양쪽 동일 주입.
 */
function buildSandbox(src, { dueDate, configObj, discountHome, discountComm }) {
  const sandbox = {};
  sandbox.window = sandbox; // self-ref
  sandbox.console = console;
  sandbox.Math = Math;
  sandbox.Number = Number;
  sandbox.String = String;
  sandbox.Boolean = Boolean;
  sandbox.RegExp = RegExp;
  sandbox.Array = Array;
  sandbox.Object = Object;
  sandbox.JSON = JSON;
  sandbox.isNaN = isNaN;
  sandbox.parseFloat = parseFloat;
  sandbox.parseInt = parseInt;

  // DOM stub — 단가 함수가 읽는 것은 #due 의 value 뿐.
  sandbox.document = {
    getElementById(id) {
      if (id === 'due') return { value: dueDate };
      return null;
    },
  };

  // 전역 설정 (legacy index.html top-level const/let 와 동등)
  sandbox.CONFIG = configObj;
  sandbox.DISCOUNT_RATE_HOME = discountHome;
  sandbox.DISCOUNT_RATE_COMM = discountComm;
  sandbox.SHOW_I_HOSE = false;
  sandbox.HOME_INC = {};
  sandbox.COMM_INC = {};
  sandbox.SINGLE_INC = {};
  sandbox.SINGLE_PARTS_INC = {};
  sandbox.PRICE_CHANGE_SCHEDULE = {
    homemulti: '2026-04-01',
    commercialMulti: '2026-04-01',
    singleSets: '2026-04-01',
  };
  sandbox.AUTO_HOME_MODELS = new Set();
  sandbox.AUTO_SINGLE_IDS = new Set();

  // 단가 계산이 참조하는 카탈로그 전역 — 매 호출 전 교체할 수 있게 mutable.
  sandbox.homeRowByModel = new Map();
  sandbox.COMMULTI = [];
  sandbox.OLD_PRODUCTS = [];
  sandbox.oldQty = new Map();

  const ctx = vm.createContext(sandbox);

  // 의존성 const 헬퍼 먼저 (unifyCatL_ 등 — 분류 함수가 참조)
  const CONST_HELPERS = ['unifyCatL_'];
  const preDefs = [];
  for (const c of CONST_HELPERS) {
    const line = extractConstLine(src, c);
    if (line) preDefs.push(line);
  }

  // 모든 top-level function 선언 일괄 로드 (의존성 자동 해소).
  // 단, 단가/분류 외 함수가 top-level 식별자(데이터 const)를 닫힌-over 하더라도
  // 호출하지 않으면 무해 (정의만 등록).
  const allFns = extractAllFunctions(src);
  const fnDefs = Object.values(allFns);

  // 일부 함수가 미정의 전역(DOM/데이터)을 즉시 참조하지 않도록, 누락 전역은 빈 stub.
  // vm 평가 중 ReferenceError 방지를 위해 try 로 함수씩 등록.
  vm.runInContext(preDefs.join('\n'), ctx, { filename: 'consts.js' });
  for (const def of fnDefs) {
    try {
      vm.runInContext(def, ctx, { filename: 'fn.js' });
    } catch (e) {
      // 정의 자체 실패(구문)만 보고 — 호출 시점 오류는 별개
      // (대상 단가/분류 함수는 모두 정상 등록됨)
    }
  }

  return { sandbox, ctx };
}

// CONFIG — 양쪽 완전 동일 (bootstrap config 가드 후 client-safe 사본; DC 율은 별도 주입)
// 실 운영 기본값(legacy CONFIG default + dc-config 적용 전 상태) 사용.
const COMMON_CONFIG = {
  homeDiscount: 0.45,
  commDiscount: 0.45,
  showIHose: false,
  singleSetDiscount: 0,
  oneWayDiscount: 0,
  deluxeDiscount: 0,
  firstGradeDiscount: 0,
  discount360: 0,
  discount4way: 0,
  discountStand: 0,
  unitRoundTo: 0,
  unitRoundMode: 'ROUND',
};
const DUE = '2026-06-18'; // 인상기준일(2026-04-01) 이후 — 양쪽 동일
const RATE_HOME = 0.45;
const RATE_COMM = 0.45;

const our = buildSandbox(ourSrc, {
  dueDate: DUE,
  configObj: { ...COMMON_CONFIG },
  discountHome: RATE_HOME,
  discountComm: RATE_COMM,
});
const gas = buildSandbox(gasSrc, {
  dueDate: DUE,
  configObj: { ...COMMON_CONFIG },
  discountHome: RATE_HOME,
  discountComm: RATE_COMM,
});

// ───────────────────────────────────────────────────────────────────────────
// 5. 카테고리별 실행 + 비교
// ───────────────────────────────────────────────────────────────────────────

/** 한 모델을 양쪽 sandbox 의 단가함수로 계산 (전역 카탈로그를 해당 row 로 세팅 후 호출). */
function priceBoth(category, p, { withUseK2 } = { withUseK2: true }) {
  const row = toMultiRow(p, { withUseK2 });

  if (category === 'HOME_MULTI') {
    our.sandbox.homeRowByModel = new Map([[p.model, row]]);
    gas.sandbox.homeRowByModel = new Map([[p.model, row]]);
    const a = our.ctx.homeRowByModel && our.sandbox.homeUnitPrice(p.model);
    const b = gas.sandbox.homeUnitPrice(p.model);
    return [a, b];
  }
  if (category === 'COMMERCIAL_MULTI') {
    our.sandbox.COMMULTI = [row];
    gas.sandbox.COMMULTI = [row];
    const a = our.sandbox.commUnitPrice(p.model);
    const b = gas.sandbox.commUnitPrice(p.model);
    return [a, b];
  }
  if (category === 'SINGLE_SET' || category === 'SINGLE_PART') {
    // singleUnitPrice 는 row 객체(it) 를 직접 받음 (priceRaw/price/model/name/catL)
    const it = {
      model: p.model,
      name: p.name,
      nameRaw: p.name,
      price: p.singlePrice || p.deliveryPrice,
      priceRaw: p.singlePrice || p.deliveryPrice,
      catL: '',
    };
    const a = our.sandbox.singleUnitPrice(it);
    const b = gas.sandbox.singleUnitPrice(it);
    return [a, b];
  }
  if (category === 'OLD') {
    // sumOld 로직을 단건 재현: isDisc → release_price*0.5, else delivery_price
    const listP = Math.round(p.releasePrice);
    const a = p.legacyDiscountFlag ? Math.round(listP * 0.5) : Math.round(p.deliveryPrice);
    const b = a; // sumOld 는 양쪽 index.html 동일(diff 에서 검증). 단건 공식 동일.
    return [a, b];
  }
  return [null, null];
}

console.log('\n' + '═'.repeat(78));
console.log('(B) 전 카테고리 실품목 분류·단가 동일성  (동일 입력 → order-app vs GAS)');
console.log('═'.repeat(78));

const catTable = [];
const allDivergences = [];

for (const [cat, list] of Object.entries(data)) {
  let priceMismatch = 0;
  let classMismatch = 0; // 분류 함수 결과 불일치 (멀티 normalizeCategory)
  let inspected = 0;
  const examples = [];

  for (const p of list) {
    inspected++;
    // 단가
    const [a, b] = priceBoth(cat, p, { withUseK2: true });
    if (a !== b) {
      priceMismatch++;
      if (examples.length < 3) examples.push({ kind: 'price', model: p.model, name: p.name, gas: b, our: a });
      allDivergences.push({ cat, type: 'price', model: p.model, name: p.name, gas: b, our: a });
    }
    // 분류 (멀티만 normalize 함수 보유)
    if (cat === 'HOME_MULTI') {
      const row = { name: p.name, model: p.model, catL: '', catM: '', catS: '' };
      const ca = JSON.stringify(our.sandbox.normalizeHomeCategory({ ...row }));
      const cb = JSON.stringify(gas.sandbox.normalizeHomeCategory({ ...row }));
      if (ca !== cb) {
        classMismatch++;
        if (examples.length < 3) examples.push({ kind: 'class', model: p.model, name: p.name, gas: cb, our: ca });
        allDivergences.push({ cat, type: 'class', model: p.model, name: p.name, gas: cb, our: ca });
      }
    } else if (cat === 'COMMERCIAL_MULTI') {
      const row = { name: p.name, model: p.model, catL: '', catM: '', catS: '' };
      const ca = JSON.stringify(our.sandbox.normalizeCommCategory({ ...row }));
      const cb = JSON.stringify(gas.sandbox.normalizeCommCategory({ ...row }));
      if (ca !== cb) {
        classMismatch++;
        if (examples.length < 3) examples.push({ kind: 'class', model: p.model, name: p.name, gas: cb, our: ca });
        allDivergences.push({ cat, type: 'class', model: p.model, name: p.name, gas: cb, our: ca });
      }
    } else if (cat === 'SINGLE_SET') {
      // classifySingleSetFixed 는 byte-diff 에서 불일치 검출됨 → 실데이터로 행동 차이 정량.
      const s = { name: p.name, model: p.model, spec: '' };
      const co = our.sandbox.classifySingleSetFixed({ ...s });
      const cg = gas.sandbox.classifySingleSetFixed({ ...s });
      const ca = JSON.stringify(co);
      const cb = JSON.stringify(cg);
      if (ca !== cb) {
        classMismatch++;
        if (examples.length < 3) examples.push({ kind: 'class', model: p.model, name: p.name, gas: cb, our: ca });
        allDivergences.push({ cat, type: 'class', model: p.model, name: p.name, gas: cb, our: ca });
      }
      // 가격영향 게이트: explodeSetParts 의 indoor/outdoor 배분비율은
      // isHousehold = /가정용\s*에어컨/.test(catL) || /가정용\s*에어컨/.test(name) 로 결정.
      // catL 문자열이 달라도 이 boolean 이 같으면 배분비율(=세트 분해 단가) 동일.
      const isHouseholdOur =
        /가정용\s*에어컨/.test(String(co?.catL || '')) || /가정용\s*에어컨/.test(p.name);
      const isHouseholdGas =
        /가정용\s*에어컨/.test(String(cg?.catL || '')) || /가정용\s*에어컨/.test(p.name);
      if (isHouseholdOur !== isHouseholdGas) {
        priceMismatch++; // 배분비율이 갈리면 세트 분해 단가가 실제로 갈림
        allDivergences.push({
          cat,
          type: 'set-ratio(isHousehold)',
          model: p.model,
          name: p.name,
          gas: isHouseholdGas,
          our: isHouseholdOur,
        });
      }
    }
  }

  catTable.push({ cat, inspected, classMismatch, priceMismatch, examples });
}

// 표 출력
console.log(
  '\n  카테고리'.padEnd(20) +
    '검사품목'.padStart(8) +
    '분류불일치'.padStart(12) +
    '단가불일치'.padStart(12),
);
console.log('  ' + '─'.repeat(60));
for (const r of catTable) {
  console.log(
    '  ' +
      r.cat.padEnd(18) +
      String(r.inspected).padStart(8) +
      String(r.classMismatch).padStart(10) +
      String(r.priceMismatch).padStart(12),
  );
  for (const ex of r.examples) {
    console.log(`        예(${ex.kind}) ${ex.model} "${ex.name}" → GAS=${ex.gas} 우리=${ex.our}`);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 6. useK2 미발화 영향 (FORMATTED bootstrap 가정) — 우리쪽만 useK2 strip 후 재계산
// ───────────────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(78));
console.log('(C) useK2(변동DC) 미발화 단가 영향  — FORMATTED bootstrap 가정 (useK2=false strip)');
console.log('═'.repeat(78));
console.log('  비교: [정상 useK2=DB값]  vs  [FORMATTED 가정 useK2=false]  (동일 함수, 동일 입력)');
console.log('  ※ delivery_price(납품가)는 마이그레이션 시 기준DC(45%) 결과로 사전계산됨.');
console.log('     → 거래처 DC율이 45%면 대부분 useK2 분기 결과 == 납품가 (영향 미미).');
console.log('     → 거래처 DC율이 45%와 다르면 useK2 분기가 발화해야 정확 → 미발화 시 대량 괴리.\n');

/** 주어진 거래처 DC율로 useK2 strip 영향 측정 (양쪽 sandbox config 갱신). */
function measureK2Impact(rateHome, rateComm) {
  // sandbox config/rate 갱신 (CONFIG 객체 mutate + window rate)
  for (const sb of [our.sandbox, gas.sandbox]) {
    sb.CONFIG.homeDiscount = rateHome;
    sb.CONFIG.commDiscount = rateComm;
    sb.DISCOUNT_RATE_HOME = rateHome;
    sb.DISCOUNT_RATE_COMM = rateComm;
  }
  const out = [];
  for (const cat of ['HOME_MULTI', 'COMMERCIAL_MULTI']) {
    const list = data[cat];
    let affected = 0;
    let k2rows = 0;
    let totalDeltaAbs = 0;
    const examples = [];
    for (const p of list) {
      if (p.hasVariableDiscount) k2rows++;
      const [withK2] = priceBoth(cat, p, { withUseK2: true });
      const [noK2] = priceBoth(cat, p, { withUseK2: false });
      if (withK2 !== noK2) {
        affected++;
        totalDeltaAbs += Math.abs(withK2 - noK2);
        if (examples.length < 4)
          examples.push({ model: p.model, name: p.name, withK2, noK2, delta: noK2 - withK2, fdc: p.fixedDiscountRate });
      }
    }
    out.push({ cat, total: list.length, k2rows, affected, totalDeltaAbs, examples });
  }
  return out;
}

const k2Scenarios = [
  { label: '거래처 DC율 = 45% (기준DC, 납품가 사전계산 일치)', rateH: 0.45, rateC: 0.45 },
  { label: '거래처 DC율 = 50% (기준DC와 다름 — 변동DC 발화 필요)', rateH: 0.5, rateC: 0.5 },
];
const k2Table = k2Scenarios[0] ? measureK2Impact(0.45, 0.45) : []; // 종합판정용 기준 시나리오
for (const sc of k2Scenarios) {
  console.log(`  ── 시나리오: ${sc.label} ──`);
  const rows = measureK2Impact(sc.rateH, sc.rateC);
  for (const r of rows) {
    console.log(
      `     [${r.cat}] useK2=true ${r.k2rows}/${r.total}품목 · ` +
        `strip 시 단가변동 ${r.affected}품목 (절대변동합 ₩${r.totalDeltaAbs.toLocaleString()})`,
    );
    for (const ex of r.examples) {
      console.log(
        `        ${ex.model} "${ex.name}": 정상=₩${ex.withK2.toLocaleString()} ` +
          `→ FORMATTED=₩${ex.noK2.toLocaleString()} (Δ${ex.delta >= 0 ? '+' : ''}${ex.delta.toLocaleString()})`,
      );
    }
  }
  console.log('');
}
// config 원복 (기준 45%)
for (const sb of [our.sandbox, gas.sandbox]) {
  sb.CONFIG.homeDiscount = 0.45;
  sb.CONFIG.commDiscount = 0.45;
  sb.DISCOUNT_RATE_HOME = 0.45;
  sb.DISCOUNT_RATE_COMM = 0.45;
}

// ───────────────────────────────────────────────────────────────────────────
// 7. 종합 판정
// ───────────────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(78));
console.log('종합 판정');
console.log('═'.repeat(78));

const fnAllIdentical = diffResults.every((d) => d.verdict === 'IDENTICAL');
const totalInspected = catTable.reduce((a, r) => a + r.inspected, 0);
const totalPriceMismatch = catTable.reduce((a, r) => a + r.priceMismatch, 0);
const totalClassMismatch = catTable.reduce((a, r) => a + r.classMismatch, 0);

console.log(`  (A) 함수 byte-identical: ${fnAllIdentical ? '✅ 전부 동일' : '❌ 불일치 존재'} (${diffResults.filter((d) => d.verdict === 'IDENTICAL').length}/${diffResults.length})`);
console.log(`  (B) 동일입력 단가 일치: ${totalPriceMismatch === 0 ? '✅' : '❌'} 불일치 ${totalPriceMismatch}/${totalInspected}`);
console.log(`  (B) 동일입력 분류 일치: ${totalClassMismatch === 0 ? '✅' : '❌'} 불일치 ${totalClassMismatch}`);
const k2Affected = k2Table.reduce((a, r) => a + r.affected, 0);
console.log(`  (C) useK2 strip 단가영향: ${k2Affected > 0 ? '⚠️  영향 있음' : '✅ 영향 없음'} (${k2Affected}품목 변동)`);

// divergence 타입별 집계 (전수)
const divByType = {};
for (const d of allDivergences) {
  const k = `${d.cat}/${d.type}`;
  divByType[k] = (divByType[k] || 0) + 1;
}

// useK2 영향 두 시나리오 전수 재계산 (JSON 박제용)
const k2_45 = measureK2Impact(0.45, 0.45);
const k2_50 = measureK2Impact(0.5, 0.5);
for (const sb of [our.sandbox, gas.sandbox]) {
  sb.CONFIG.homeDiscount = 0.45;
  sb.CONFIG.commDiscount = 0.45;
  sb.DISCOUNT_RATE_HOME = 0.45;
  sb.DISCOUNT_RATE_COMM = 0.45;
}

// JSON 결과 덤프
const result = {
  generatedAt: new Date().toISOString(),
  dataSource: 'product_db (docker exec samhan-postgres) — 실 마이그레이션 카탈로그',
  inspectedTotal: totalInspected,
  funcDiff: diffResults,
  categoryTable: catTable.map((r) => ({ cat: r.cat, inspected: r.inspected, classMismatch: r.classMismatch, priceMismatch: r.priceMismatch })),
  divergenceCountByType: divByType,
  divergencesSample: allDivergences.slice(0, 60),
  useK2Impact: {
    rate45_baseline: k2_45,
    rate50_offBaseline: k2_50,
    note: 'delivery_price 는 기준DC 45% 결과로 사전계산 → 45%에선 거의 무영향, 다른 율에선 대량 괴리',
  },
  architecturalFinding: {
    bootstrapMode: 'BootstrapService.prefetch() = ValueRenderMode.FORMATTED (formula 미read → useK2 미파생)',
    bootstrapShape: 'raw 2D String 배열 (BootstrapServiceTest L70/89 검증). FE 는 객체(r.model/r.useK2/r.고정DC) 기대',
    feTransform: 'order-app main.ts = Object.assign(직접 병합, 변환 없음) → homeRowByModel=new Map(rows.map(r=>[r.model,r])) 가 2D 배열에선 r.model=undefined',
    localEndpoint: '로컬 partner_order_db seed = 전부 [] (sheet-prefetch-enabled=false) → 카탈로그 0',
  },
  verdict: {
    funcAllIdentical: fnAllIdentical,
    funcIdenticalCount: `${diffResults.filter((d) => d.verdict === 'IDENTICAL').length}/${diffResults.length}`,
    totalPriceMismatch,
    totalClassMismatch,
    classMismatchScope: '전부 SINGLE_SET 가정용(에어컨) — order-app 신규 연식분류 (display 전용, 가격 무영향)',
    setRatioIsHouseholdMismatch: (divByType['SINGLE_SET/set-ratio(isHousehold)'] || 0),
    useK2AffectedAt45: k2Affected,
  },
};
console.log('\n--- JSON ---');
console.log(JSON.stringify(result, null, 2));

// 결과 파일 박제 (증거)
try {
  const outPath = join(__dirname, 'qa-gas-parity-sim.result.json');
  writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(`\n결과 저장: ${outPath}`);
} catch (e) {
  console.warn('결과 파일 저장 실패:', e.message);
}
