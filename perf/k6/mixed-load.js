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
const PASSWORD = __ENV.LOADTEST_PASSWORD || 'dev_p05_pass!';
const THINK_MIN = Number(__ENV.THINK_MIN || (PROFILE === 'stress' ? 0.5 : 1));
const THINK_MAX = Number(__ENV.THINK_MAX || (PROFILE === 'stress' ? 1 : 5));
const WRITE_RATIO = Number(__ENV.WRITE_RATIO || 0.2);
const WRITE_MODE = (__ENV.WRITE_MODE || 'mixed').toLowerCase();

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

  if (res.status === 401 && retry401 !== false) {
    const refreshed = login(session.loginId);
    session.token = refreshed.token;
    session.userId = refreshed.userId;
    session.role = refreshed.role;
    return request(session, method, path, body, endpoint, extraHeaders, false);
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

function bootstrap() {
  const manager = login('dev_manager');
  const products = rowsOf(request(manager, 'GET', '/api/products?page=0&size=20', null, 'GET /api/products').body)
    .filter((p) => p.id && p.sellingPrice !== undefined);
  const partners = rowsOf(request(manager, 'GET', '/admin/partners/search?page=0&size=20', null, 'GET /admin/partners/search').body)
    .filter((p) => p.partnerCode && p.bizNo);
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
  return request(session, 'GET', '/api/v1/slips?page=0&size=1&slipType=OUTBOUND', null, 'GET /api/v1/slips size=1').body;
}

function readSlipListAndDetail(session) {
  const body = request(session, 'GET', '/api/v1/slips?page=0&size=5&slipType=OUTBOUND', null, 'GET /api/v1/slips').body;
  const row = pick(rowsOf(body));
  if (row && row.id) {
    request(session, 'GET', `/api/v1/slips/${encodeURIComponent(row.id)}`, null, 'GET /api/v1/slips/{id}');
  }
}

function readInventory(session, data) {
  const product = pick(data.products);
  if (!product) {
    return;
  }
  request(session, 'POST', '/api/v1/inventory/balances/batch', { productIds: [product.id] }, 'POST /api/v1/inventory/balances/batch');
  request(session, 'GET', `/api/v1/inventory/balances?productId=${encodeURIComponent(product.id)}&page=0&size=5`, null, 'GET /api/v1/inventory/balances');
  request(session, 'GET', `/api/v1/inventory/lots?productId=${encodeURIComponent(product.id)}&page=0&size=5`, null, 'GET /api/v1/inventory/lots');
}

function readPartnerAndOrders(session) {
  const partners = rowsOf(request(session, 'GET', '/admin/partners/search?page=0&size=5', null, 'GET /admin/partners/search').body);
  const partner = pick(partners);
  const orderBody = request(session, 'GET', '/api/v1/partner-orders?page=0&size=5', null, 'GET /api/v1/partner-orders').body;
  const order = pick(rowsOf(orderBody));
  if (order && order.orderNumber) {
    request(session, 'GET', `/api/v1/partner-orders/${encodeURIComponent(order.orderNumber)}`, null, 'GET /api/v1/partner-orders/{id}');
  }
  if (partner && partner.partnerCode) {
    request(session, 'GET', `/admin/partners/${encodeURIComponent(partner.partnerCode)}`, null, 'GET /admin/partners/{partnerCode}');
  }
}

function readAccounting(session) {
  request(session, 'GET', '/api/v1/accounting/journals?page=0&size=5', null, 'GET /api/v1/accounting/journals');
  request(session, 'GET', '/api/v1/accounting/accounts', null, 'GET /api/v1/accounting/accounts');
  request(session, 'GET', '/api/v1/accounting/sales/aggregate?from=2026-05-01&to=2026-06-08', null, 'GET /api/v1/accounting/sales/aggregate');
}

function readManager(session) {
  request(session, 'GET', '/auth/admin/permissions/my', null, 'GET /auth/admin/permissions/my');
  request(session, 'GET', '/admin/partners/search?page=0&size=5', null, 'GET /admin/partners/search');
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
    request(session, 'POST', `/api/v1/partner-orders/${encodeURIComponent(orderNo)}/hold`, null, 'POST /api/v1/partner-orders/{id}/hold');
    request(session, 'POST', `/api/v1/partner-orders/${encodeURIComponent(orderNo)}/release`, null, 'POST /api/v1/partner-orders/{id}/release');
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
  const n = Math.random();
  if (WRITE_MODE === 'partner-order' || n < 0.34) {
    createPartnerOrder(session, data);
    return;
  }
  if (WRITE_MODE === 'estimate' || n < 0.67) {
    createEstimate(session, data);
    return;
  }
  createSlipDraft(session, data);
}

function readFlow(session, data) {
  dashboardCount(session);
  if (session.role === 'sales') {
    readSlipListAndDetail(session);
    readPartnerAndOrders(session);
    request(session, 'GET', '/api/v1/slips/estimates?page=0&size=5', null, 'GET /api/v1/slips/estimates');
    readInventory(session, data);
    return;
  }
  if (session.role === 'warehouse') {
    request(session, 'GET', '/api/v1/inventory/warehouses', null, 'GET /api/v1/inventory/warehouses');
    request(session, 'GET', '/api/v1/inventory/transfers?page=0&size=5', null, 'GET /api/v1/inventory/transfers');
    readInventory(session, data);
    readSlipListAndDetail(session);
    return;
  }
  if (session.role === 'accountant') {
    readAccounting(session);
    request(session, 'GET', '/api/v1/slips?page=0&size=5', null, 'GET /api/v1/slips');
    return;
  }
  readManager(session);
}

export default function (data) {
  const session = ensureSession();
  if (Math.random() < WRITE_RATIO) {
    writeFlow(session, data);
  } else {
    readFlow(session, data);
  }
  sleepThink();
}
