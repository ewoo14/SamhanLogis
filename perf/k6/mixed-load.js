import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

// 로컬 Samhan Public API 부하 하네스.
// 라우트 근거:
// - /auth/login: api-gateway auth-service-legacy no-strip, AuthController @RequestMapping("/auth")
// - /api/products: legacy /api/products/** StripPrefix=1 -> ProductController /products, ApiResponse envelope
// - /api/v1/slips/**: gateway StripPrefix=2 -> SlipController /slips
// - /api/v1/slips/estimates/**: gateway StripPrefix=2 -> EstimateController /slips/estimates
// - /api/v1/partner-orders/**: partner-order-service controller가 풀패스 /api/v1/partner-orders 보유, no-strip
// - /api/v1/inventory/**: gateway StripPrefix=2 -> inventory-service /inventory
// - /api/v1/accounting/**: gateway StripPrefix=2 -> accounting-service /accounting
// - /admin/partners/**: gateway no-prefix -> partner-service /admin/partners
// 전표 DRAFT 생성은 SlipService.create()에서 재고 예약/차감을 하지 않는다.
// 재고 예약은 accept(), 재고 차감은 complete()에서만 inventoryClient 호출이 발생하므로 해당 전이들은 제외한다.
// partner-order confirm은 PartnerOrderConfirmService 주석/IT 기준 slip-service/inventory 호출 없이 DRAFT 주문만 생성한다.

export const http4xx = new Counter('samhan_http_4xx');
export const http5xx = new Counter('samhan_http_5xx');

const PROFILE = (__ENV.STAGE_PROFILE || 'smoke').toLowerCase();
const PROFILE_TABLE = {
  smoke: { vus: 2, duration: '1m' },
  baseline: { vus: 20, duration: '10m' },
  peak: { vus: 50, duration: '10m' },
  stress: { vus: 100, duration: '10m' },
  soak: { vus: 20, duration: __ENV.SOAK_DURATION || '7h' },
  'verify-relogin': { vus: Number(__ENV.VERIFY_RELOGIN_VUS || 4), duration: __ENV.VERIFY_RELOGIN_DURATION || '2m' },
};

const selectedProfile = PROFILE_TABLE[PROFILE] || PROFILE_TABLE.smoke;

export const options = {
  scenarios: {
    mixed: {
      executor: 'constant-vus',
      vus: selectedProfile.vus,
      duration: selectedProfile.duration,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500', 'p(99)<1500'],
  },
  userAgent: 'samhan-local-loadtest-k6/1.0',
};

const BASE_URL = (__ENV.BASE_URL || 'http://api-gateway:8080').replace(/\/$/, '');
const PASSWORD = (__ENV.LOADTEST_PASSWORD || '').trim();
if (!PASSWORD) {
  throw new Error('k6 자격이 없습니다: LOADTEST_PASSWORD 환경변수를 설정하십시오.');
}
const THINK_MIN = Number(__ENV.THINK_MIN || (PROFILE === 'stress' ? 0.5 : 1));
const THINK_MAX = Number(__ENV.THINK_MAX || (PROFILE === 'stress' ? 1 : 5));
const WRITE_RATIO = Number(__ENV.WRITE_RATIO || 0.2);
const WRITE_MODE = (__ENV.WRITE_MODE || 'mixed').toLowerCase();
const FORCE_RELOGIN_EVERY = Number(__ENV.FORCE_RELOGIN_EVERY || (PROFILE === 'verify-relogin' ? 3 : 0));

const ROLE_TABLE = [
  { name: 'sales', loginId: 'dev_sales', weight: 40 },
  { name: 'warehouse', loginId: 'dev_warehouse', weight: 25 },
  { name: 'accountant', loginId: 'dev_accountant', weight: 20 },
  { name: 'manager', loginId: 'dev_manager', weight: 15 },
];

const sessions = {};

function roleForVu(vu) {
  const bucket = ((vu - 1) * 37) % 100;
  let acc = 0;
  for (const role of ROLE_TABLE) {
    acc += role.weight;
    if (bucket < acc) {
      return role;
    }
  }
  return ROLE_TABLE[0];
}

function sleepThink() {
  sleep(THINK_MIN + Math.random() * Math.max(0, THINK_MAX - THINK_MIN));
}

function parseJson(res) {
  try {
    return res.json();
  } catch (e) {
    return null;
  }
}

function dataOf(body) {
  if (!body) {
    return null;
  }
  return Object.prototype.hasOwnProperty.call(body, 'data') ? body.data : body;
}

function rowsOf(value) {
  const data = dataOf(value);
  if (!data) {
    return [];
  }
  if (Array.isArray(data)) {
    return data;
  }
  if (Array.isArray(data.content)) {
    return data.content;
  }
  if (Array.isArray(data.items)) {
    return data.items;
  }
  if (Array.isArray(data.rows)) {
    return data.rows;
  }
  return [];
}

// clients/desktop/src/renderer/utils/orderNo.ts 의 toOrderPathId 와 같은 근거:
// 표준 주문번호는 슬래시를 유지하되, 게이트웨이가 경로의 %2F 를 차단하므로 URL path-id 에서만 하이픈으로 치환한다.
function toOrderPathId(orderNumber) {
  return orderNumber.replace(/\//g, '-');
}

function pick(list) {
  if (!list || list.length === 0) {
    return null;
  }
  return list[Math.floor(Math.random() * list.length)];
}

function login(loginId) {
  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ loginId, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' }, tags: { endpoint: 'POST /auth/login' } },
  );
  if (res.status >= 400 && res.status < 500) {
    http4xx.add(1, { endpoint: 'POST /auth/login' });
  }
  if (res.status >= 500) {
    http5xx.add(1, { endpoint: 'POST /auth/login' });
  }
  const body = parseJson(res);
  check(res, {
    '로그인 envelope success=true': () => res.status === 200 && body && body.success === true,
    '로그인 token 존재': () => body && body.data && typeof body.data.token === 'string' && body.data.token.length > 0,
  }, { endpoint: 'POST /auth/login' });
  if (!body || !body.data || !body.data.token) {
    throw new Error(`로그인 실패: ${loginId} status=${res.status}`);
  }
  return {
    loginId,
    token: body.data.token,
    userId: body.data.userId,
    role: body.data.role,
    displayName: body.data.displayName,
  };
}

function headers(session, extra) {
  const h = {
    Authorization: `Bearer ${session.token}`,
    'Content-Type': 'application/json',
  };
  if (extra) {
    for (const k of Object.keys(extra)) {
      h[k] = extra[k];
    }
  }
  return h;
}

function recordStatus(res, endpoint) {
  if (res.status >= 400 && res.status < 500) {
    http4xx.add(1, { endpoint });
  }
  if (res.status >= 500) {
    http5xx.add(1, { endpoint });
  }
}

function request(session, method, path, body, endpoint, extraHeaders, retry401) {
  const params = { headers: headers(session, extraHeaders), tags: { endpoint } };
  let res;
  if (method === 'GET') {
    res = http.get(`${BASE_URL}${path}`, params);
  } else if (method === 'POST') {
    res = http.post(`${BASE_URL}${path}`, body ? JSON.stringify(body) : null, params);
  } else {
    throw new Error(`지원하지 않는 method=${method}`);
  }

  recordStatus(res, endpoint);
  const parsed = parseJson(res);
  check(res, {
    '2xx 응답': () => res.status >= 200 && res.status < 300,
    'ApiResponse success=true': () => parsed && parsed.success === true,
  }, { endpoint });
  return { res, body: parsed };
}

function ensureSession() {
  const key = String(__VU);
  if (!sessions[key]) {
    const role = roleForVu(__VU);
    sessions[key] = {
      role: role.name,
      loginId: role.loginId,
      token: null,
      userId: null,
      roleCode: null,
      displayName: null,
      serial: 0,
    };
    const loggedIn = login(role.loginId);
    sessions[key].token = loggedIn.token;
    sessions[key].userId = loggedIn.userId;
    sessions[key].roleCode = loggedIn.role;
    sessions[key].displayName = loggedIn.displayName;
  }
  return sessions[key];
}

function maybeForceRelogin(session) {
  session.iterations = (session.iterations || 0) + 1;
  if (FORCE_RELOGIN_EVERY <= 0 || session.iterations % FORCE_RELOGIN_EVERY !== 0) {
    return;
  }
  const refreshed = login(session.loginId);
  session.token = refreshed.token;
  session.userId = refreshed.userId;
  session.roleCode = refreshed.role;
}

function bootstrap() {
  const manager = login('dev_manager');
  // page-code: products.list (역할 grant 근거: V10 MANAGER VIEW + V39/V43/V44 실권한 materialize)
  const products = rowsOf(request(manager, 'GET', '/api/products?page=0&size=20', null, 'GET /api/products').body)
    .filter((p) => p.id && p.sellingPrice !== undefined);
  // page-code: partners.search (역할 grant 근거: V34 MANAGER VIEW + V39/V43/V44 실권한 materialize)
  const partners = rowsOf(request(manager, 'GET', '/admin/partners/search?page=0&size=20', null, 'GET /admin/partners/search').body)
    .filter((p) => p.partnerCode && p.bizNo);
  // page-code: inventory.warehouse (역할 grant 근거: V10 MANAGER VIEW + V39/V43/V44 실권한 materialize)
  const warehouses = rowsOf(request(manager, 'GET', '/api/v1/inventory/warehouses', null, 'GET /api/v1/inventory/warehouses').body)
    .filter((w) => w.id && w.code);

  if (products.length === 0 || partners.length === 0 || warehouses.length === 0) {
    throw new Error(`bootstrap 실패 products=${products.length} partners=${partners.length} warehouses=${warehouses.length}`);
  }
  return { products, partners, warehouses };
}

export function setup() {
  return bootstrap();
}

function dashboardCount(session) {
  // page-code: sales.slip.list (역할 grant 근거: V7 SALES/MANAGER VIEW + V39/V43/V44 실권한 materialize)
  return request(session, 'GET', '/api/v1/slips?page=0&size=1&slipType=OUTBOUND', null, 'GET /api/v1/slips size=1').body;
}

function readSlipListAndDetail(session) {
  // page-code: sales.slip.list (역할 grant 근거: V7 SALES/MANAGER VIEW, V9 WAREHOUSE FALSE 보정)
  const body = request(session, 'GET', '/api/v1/slips?page=0&size=5&slipType=OUTBOUND', null, 'GET /api/v1/slips').body;
  const row = pick(rowsOf(body));
  if (row && row.id) {
    // page-code: sales.slip.list (역할 grant 근거: SlipController 상세는 slipType guard + V7 SALES/MANAGER VIEW)
    request(session, 'GET', `/api/v1/slips/${encodeURIComponent(row.id)}`, null, 'GET /api/v1/slips/{id}');
  }
}

function readInventoryBatch(session, data) {
  const product = pick(data.products);
  if (!product) {
    return;
  }
  // page-code: inventory.list (역할 grant 근거: V35 SALES/MANAGER/ACCOUNTANT/WAREHOUSE VIEW + V39/V43/V44 실권한 materialize)
  request(session, 'POST', '/api/v1/inventory/balances/batch', { productIds: [product.id] }, 'POST /api/v1/inventory/balances/batch');
}

function readInventoryStockDetails(session, data) {
  const product = pick(data.products);
  if (!product) {
    return;
  }
  // page-code: inventory.list (역할 grant 근거: V35 WAREHOUSE VIEW + V39/V43/V44 실권한 materialize)
  request(session, 'POST', '/api/v1/inventory/balances/batch', { productIds: [product.id] }, 'POST /api/v1/inventory/balances/batch');
  // page-code: inventory.stock-balance (역할 grant 근거: V35 WAREHOUSE VIEW + V39/V43/V44 실권한 materialize)
  request(session, 'GET', `/api/v1/inventory/balances?productId=${encodeURIComponent(product.id)}&page=0&size=5`, null, 'GET /api/v1/inventory/balances');
  // page-code: inventory.stock-balance (역할 grant 근거: V35 WAREHOUSE VIEW + V39/V43/V44 실권한 materialize)
  request(session, 'GET', `/api/v1/inventory/lots?productId=${encodeURIComponent(product.id)}&page=0&size=5`, null, 'GET /api/v1/inventory/lots');
}

function readPartnerAndOrders(session) {
  // page-code: partners.search (역할 grant 근거: V34 SALES/MANAGER VIEW + V39/V43/V44 실권한 materialize)
  const partners = rowsOf(request(session, 'GET', '/admin/partners/search?page=0&size=5', null, 'GET /admin/partners/search').body);
  const partner = pick(partners);
  // page-code: sales.partner-order.list (역할 grant 근거: V10 SALES/MANAGER VIEW + V39/V43/V44 실권한 materialize)
  const orderBody = request(session, 'GET', '/api/v1/partner-orders?page=0&size=5', null, 'GET /api/v1/partner-orders').body;
  const order = pick(rowsOf(orderBody));
  if (order && order.orderNumber) {
    const orderPathId = toOrderPathId(order.orderNumber);
    // page-code: sales.partner-order.list (역할 grant 근거: V10 SALES/MANAGER VIEW + V39/V43/V44 실권한 materialize)
    request(session, 'GET', `/api/v1/partner-orders/${orderPathId}`, null, 'GET /api/v1/partner-orders/{id}');
  }
  if (partner && partner.partnerCode) {
    // page-code: partners.detail (역할 grant 근거: V10 SALES/MANAGER VIEW + V39/V43/V44 실권한 materialize)
    request(session, 'GET', `/admin/partners/${encodeURIComponent(partner.partnerCode)}`, null, 'GET /admin/partners/{partnerCode}');
  }
}

function readAccounting(session) {
  // page-code: accounting.journals (역할 grant 근거: V8 ACCOUNTANT VIEW + V39/V43/V44 실권한 materialize)
  request(session, 'GET', '/api/v1/accounting/journals?page=0&size=5', null, 'GET /api/v1/accounting/journals');
  // page-code: accounting.accounts (역할 grant 근거: V8 ACCOUNTANT VIEW + V39/V43/V44 실권한 materialize)
  request(session, 'GET', '/api/v1/accounting/accounts', null, 'GET /api/v1/accounting/accounts');
  // page-code: accounting.reports (역할 grant 근거: V8 ACCOUNTANT VIEW + V39/V43/V44 실권한 materialize)
  request(session, 'GET', '/api/v1/accounting/sales/aggregate?from=2026-05-01&to=2026-06-08', null, 'GET /api/v1/accounting/sales/aggregate');
}

function readManager(session) {
  // page-code: n/a (역할 grant 근거: PermissionAdminController /my @PreAuthorize authenticated; V39 account_page_permissions 조회)
  request(session, 'GET', '/auth/admin/permissions/my', null, 'GET /auth/admin/permissions/my');
  // page-code: partners.search (역할 grant 근거: V34 MANAGER VIEW + V39/V43/V44 실권한 materialize)
  request(session, 'GET', '/admin/partners/search?page=0&size=5', null, 'GET /admin/partners/search');
  // page-code: products.list (역할 grant 근거: V10 MANAGER VIEW + V39/V43/V44 실권한 materialize)
  request(session, 'GET', '/api/products?page=0&size=5', null, 'GET /api/products');
}

function createPartnerOrder(session, data) {
  const partner = pick(data.partners);
  const product = pick(data.products);
  if (!partner || !product) {
    return;
  }
  session.serial += 1;
  const marker = `LOADTEST-${__VU}-${session.serial}`;
  // page-code: sales.partner-order.draft (역할 grant 근거: V10 SALES/MANAGER CREATE + V39/V43/V44 실권한 materialize)
  const draft = request(
    session,
    'POST',
    '/api/v1/partner-orders/drafts',
    {
      label: marker,
      payloadJson: JSON.stringify({ marker, source: 'k6-local-loadtest' }),
    },
    'POST /api/v1/partner-orders/drafts',
    { 'X-Partner-Code': partner.partnerCode },
  ).body;
  const draftId = draft && draft.data && draft.data.draftId;
  if (!draftId) {
    return;
  }
  // page-code: sales.partner-order.confirm (역할 grant 근거: V10 SALES/MANAGER CREATE + V39/V43/V44 실권한 materialize)
  const confirm = request(
    session,
    'POST',
    `/api/v1/partner-orders/${encodeURIComponent(draftId)}/confirm`,
    {
      lines: [
        {
          productId: product.id,
          categoryKey: 'homemulti',
          quantity: 1,
          remark: marker,
        },
      ],
    },
    'POST /api/v1/partner-orders/{draftId}/confirm',
    { 'X-Partner-Code': partner.partnerCode, 'X-Biz-Code': partner.bizNo },
  ).body;
  const orderNo = confirm && confirm.data && confirm.data.orderNo;
  if (orderNo) {
    const orderPathId = toOrderPathId(orderNo);
    // page-code: sales.partner-order.edit (역할 grant 근거: V30 SALES/MANAGER UPDATE + V39/V43/V44 실권한 materialize)
    request(session, 'POST', `/api/v1/partner-orders/${orderPathId}/hold`, null, 'POST /api/v1/partner-orders/{id}/hold');
    // page-code: sales.partner-order.edit (역할 grant 근거: V30 SALES/MANAGER UPDATE + V39/V43/V44 실권한 materialize)
    request(session, 'POST', `/api/v1/partner-orders/${orderPathId}/release`, null, 'POST /api/v1/partner-orders/{id}/release');
  }
}

function createEstimate(session, data) {
  const product = pick(data.products);
  const partner = pick(data.partners);
  if (!product) {
    return;
  }
  session.serial += 1;
  const marker = `LOADTEST-${__VU}-${session.serial}`;
  // page-code: estimates.list (역할 grant 근거: V10 SALES/MANAGER CREATE + V39/V43/V44 실권한 materialize)
  request(session, 'POST', '/api/v1/slips/estimates', {
    estimateDate: new Date().toISOString().slice(0, 10),
    partnerName: partner ? partner.name : 'LOADTEST 거래처',
    partnerBusinessNo: partner ? partner.bizNo : null,
    validUntil: null,
    memo: marker,
    lines: [
      {
        productId: product.id,
        productName: product.name,
        modelName: product.modelName,
        specification: null,
        quantity: 1,
        unitPrice: product.sellingPrice || 0,
        note: marker,
      },
    ],
  }, 'POST /api/v1/slips/estimates');
}

function createSlipDraft(session, data) {
  const product = pick(data.products);
  const warehouse = pick(data.warehouses);
  const partner = pick(data.partners);
  if (!product || !warehouse) {
    return;
  }
  session.serial += 1;
  const marker = `LOADTEST-${__VU}-${session.serial}`;
  // page-code: sales.slip.create (역할 grant 근거: V36 SALES/MANAGER CREATE + V39/V43/V44 실권한 materialize)
  request(session, 'POST', '/api/v1/slips', {
    slipType: 'OUTBOUND',
    slipDate: new Date().toISOString().slice(0, 10),
    sourceWarehouseId: warehouse.id,
    destinationWarehouseId: null,
    partnerId: null,
    partnerName: partner ? partner.name : 'LOADTEST 거래처',
    deliveryTag: null,
    memo: marker,
    driverName: null,
    driverPhone: null,
    projectName: marker,
    recipientPhone: '010-0000-0000',
    lines: [
      {
        productId: product.id,
        productName: product.name,
        modelName: product.modelName,
        specification: null,
        quantity: 1,
        unitPrice: product.sellingPrice || 0,
        note: marker,
      },
    ],
  }, 'POST /api/v1/slips');
}

function writeFlow(session, data) {
  if (session.role !== 'sales' && session.role !== 'manager') {
    readFlow(session, data);
    return;
  }
  const n = Math.random();
  // partner-order mutation은 PARTNER JWT가 필요한 API다. 직원 JWT로 호출하지 않는다.
  // 별도 partner actor가 없는 직원 부하에서는 estimate/slip 쓰기만 수행한다.
  if (WRITE_MODE === 'partner-order') {
    throw new Error('WRITE_MODE=partner-order는 partner actor 전용 하네스에서만 지원됩니다.');
  }
  if (WRITE_MODE === 'estimate' || n < 0.5) {
    createEstimate(session, data);
    return;
  }
  createSlipDraft(session, data);
}

function readFlow(session, data) {
  if (session.role === 'sales') {
    dashboardCount(session);
    readSlipListAndDetail(session);
    readPartnerAndOrders(session);
    // page-code: estimates.list (역할 grant 근거: V10 SALES VIEW + V39/V43/V44 실권한 materialize)
    request(session, 'GET', '/api/v1/slips/estimates?page=0&size=5', null, 'GET /api/v1/slips/estimates');
    readInventoryBatch(session, data);
    return;
  }
  if (session.role === 'warehouse') {
    // page-code: inventory.warehouse (역할 grant 근거: V10 WAREHOUSE VIEW + V39/V43/V44 실권한 materialize)
    request(session, 'GET', '/api/v1/inventory/warehouses', null, 'GET /api/v1/inventory/warehouses');
    // page-code: inventory.transfer (역할 grant 근거: V35 WAREHOUSE VIEW + V39/V43/V44 실권한 materialize)
    request(session, 'GET', '/api/v1/inventory/transfers?page=0&size=5', null, 'GET /api/v1/inventory/transfers');
    readInventoryStockDetails(session, data);
    return;
  }
  if (session.role === 'accountant') {
    readAccounting(session);
    return;
  }
  readManager(session);
}

export default function (data) {
  const session = ensureSession();
  maybeForceRelogin(session);
  if (Math.random() < WRITE_RATIO) {
    writeFlow(session, data);
  } else {
    readFlow(session, data);
  }
  sleepThink();
}
