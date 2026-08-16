import { chromium } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs';
import { resolveQaShotsDir } from '../../../../scripts/lib/qa-shots-dir.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../../..');
const mobileDir = path.join(repo, 'clients', 'mobile-staff');
const artifactDir = resolveQaShotsDir(path.join(repo, 'docs', 'qa', 'expo-mobile-buildable', 'r4-ui-real-qa-2026-08-16'));
const shotsDir = resolveQaShotsDir(path.join(repo, 'docs', 'qa', 'expo-mobile-buildable', 'r4-ui-real-qa-2026-08-16', 'screenshots'));
const expoLogPath = path.join(artifactDir, 'expo-real-qa.log');
const resultsPath = path.join(artifactDir, 'results.json');
const appBase = 'http://127.0.0.1:28101';
const proxyBase = 'http://127.0.0.1:28100';
const gatewayBase = 'http://127.0.0.1:8080';
const isolatedPartnerBase = 'http://127.0.0.1:28095';
const chromiumExecutable = path.join(
  process.env.LOCALAPPDATA,
  'ms-playwright',
  'chromium_headless_shell-1217',
  'chrome-headless-shell-win64',
  'chrome-headless-shell.exe',
);

mkdirSync(shotsDir, { recursive: true });

function decodeJwtPayload(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

async function login() {
  const response = await fetch(`${gatewayBase}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      loginId: 'dev_master',
      password: resolveQaCredential('QA_DEV_DEFAULT_PASSWORD'),
    }),
  });
  const body = await response.json();
  const token = body?.data?.token ?? body?.data?.accessToken;
  if (response.status !== 200 || !token) {
    throw new Error(`새 로그인 실패: HTTP ${response.status}, tokenPresent=${Boolean(token)}`);
  }
  return token;
}

function gatewayIdentityHeaders(token) {
  const claims = decodeJwtPayload(token);
  const groups = Array.isArray(claims.groups) ? claims.groups.join(',') : String(claims.groups ?? '');
  return {
    'X-Samhan-Gateway-Attestation': resolveQaCredential('SAMHAN_GATEWAY_ATTESTATION'),
    'X-User-Id': String(claims.userId ?? claims.sub ?? ''),
    'X-Is-System-Master': String(claims.isSystemMaster === true),
    'X-User-Groups': groups,
    'X-Is-Partner': String(Boolean(claims.partnerCode)),
  };
}

function startProxy(token, httpObservations) {
  const identity = gatewayIdentityHeaders(token);
  return http.createServer(async (request, response) => {
    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      });
      response.end();
      return;
    }

    const requestUrl = new URL(request.url ?? '/', proxyBase);
    const isQuickSearch = requestUrl.pathname === '/api/v1/partners/quick-search';
    const targetBase = isQuickSearch ? isolatedPartnerBase : gatewayBase;
    const bodyChunks = [];
    for await (const chunk of request) bodyChunks.push(chunk);
    const body = Buffer.concat(bodyChunks);
    const headers = { ...request.headers };
    delete headers.host;
    delete headers.origin;
    if (isQuickSearch) Object.assign(headers, identity);

    const upstream = await fetch(`${targetBase}${requestUrl.pathname}${requestUrl.search}`, {
      method: request.method,
      headers,
      body: body.length > 0 ? body : undefined,
    });
    const upstreamBody = Buffer.from(await upstream.arrayBuffer());
    if (isQuickSearch) {
      let count = -1;
      try {
        const parsed = JSON.parse(upstreamBody.toString('utf8'));
        count = Array.isArray(parsed?.data) ? parsed.data.length : -1;
      } catch {}
      httpObservations.push({
        method: request.method,
        path: `${requestUrl.pathname}${requestUrl.search}`,
        status: upstream.status,
        count,
        target: 'PR_HEAD_PARTNER',
      });
    }
    const responseHeaders = {};
    upstream.headers.forEach((value, key) => {
      if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(key.toLowerCase())) {
        responseHeaders[key] = value;
      }
    });
    responseHeaders['Access-Control-Allow-Origin'] = '*';
    responseHeaders['Content-Length'] = String(upstreamBody.length);
    response.writeHead(upstream.status, responseHeaders);
    response.end(upstreamBody);
  });
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Expo Web 대기 시간 초과: ${lastError?.message ?? '응답 없음'}`);
}

function stopProcessTree(child) {
  if (!child?.pid) return;
  spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
    windowsHide: true,
    stdio: 'ignore',
  });
}

async function captureScreen(page, spec) {
  await page.locator(`[data-testid="${spec.tabTestId}"]`).click();
  let reachAssertion;
  if (spec.uniqueText) {
    const unique = page.getByText(spec.uniqueText, { exact: true });
    await unique.waitFor({ state: 'visible', timeout: 15_000 });
    reachAssertion = `exact text visible: ${JSON.stringify(spec.uniqueText)}`;
  } else {
    const active = page.locator(`[data-testid="${spec.tabTestId}"]`);
    const inactive = page.locator('[data-testid="sales-tab-quotation"]');
    const activeBackground = await active.evaluate((element) => getComputedStyle(element).backgroundColor);
    const inactiveBackground = await inactive.evaluate((element) => getComputedStyle(element).backgroundColor);
    if (activeBackground === inactiveBackground) {
      throw new Error(`거래처 화면 도달 단정 실패: active=${activeBackground}, inactive=${inactiveBackground}`);
    }
    reachAssertion = `active tab background differs: customer=${activeBackground}, quotation=${inactiveBackground}`;
  }

  const input = page.locator('[data-testid="customer-search-input"]:visible');
  await input.waitFor({ state: 'visible', timeout: 10_000 });
  const responsePromise = page.waitForResponse(
    (response) => response.url().includes('/api/v1/partners/quick-search?') && response.request().method() === 'GET',
    { timeout: 15_000 },
  );
  await input.fill('삼한');
  const searchResponse = await responsePromise;
  const searchBody = await searchResponse.json();
  const backendCount = Array.isArray(searchBody?.data) ? searchBody.data.length : -1;
  const rows = page.locator('[data-testid^="customer-row-"]:visible');
  await rows.first().waitFor({ state: 'visible', timeout: 15_000 });
  const uiRowCount = await rows.count();
  if (searchResponse.status() !== 200 || backendCount < 0 || uiRowCount !== backendCount) {
    throw new Error(
      `${spec.name} 결과 불일치: HTTP=${searchResponse.status()} backend=${backendCount} ui=${uiRowCount}`,
    );
  }
  const screenshotPath = path.join(shotsDir, spec.fileName);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  return {
    screen: spec.name,
    reachAssertion,
    requestUrl: searchResponse.url(),
    httpStatus: searchResponse.status(),
    backendCount,
    uiRowCount,
    screenshotPath,
  };
}

let expoProcess;
let browser;
let proxy;
const observations = [];
const httpObservations = [];

try {
  const token = await login();
  proxy = startProxy(token, httpObservations);
  await listen(proxy, 28100);

  const expoLog = createWriteStream(expoLogPath, { flags: 'w' });
  expoProcess = spawn(
    'cmd.exe',
    ['/d', '/s', '/c', 'npx.cmd expo start --web --port 28101 --clear --non-interactive'],
    {
      cwd: mobileDir,
      windowsHide: true,
      env: {
        ...process.env,
        CI: '1',
        APP_VARIANT: 'sales',
        BUILD_ENV: 'development',
        EXPO_PUBLIC_APP_VERSION: '2026/08/16-1',
        EXPO_PUBLIC_API_BASE_URL: proxyBase,
        EXPO_PUBLIC_SALES_ACCESS_TOKEN: token,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  expoProcess.stdout.pipe(expoLog);
  expoProcess.stderr.pipe(expoLog);
  await waitForHttp(`${appBase}/#/`, 120_000);

  try {
    browser = await chromium.launch({ headless: true, executablePath: chromiumExecutable });
  } catch (error) {
    console.error('PLAYWRIGHT_LAUNCH_ERROR_BEGIN');
    console.error(error?.stack ?? String(error));
    console.error('PLAYWRIGHT_LAUNCH_ERROR_END');
    throw error;
  }

  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  page.on('pageerror', (error) => console.error(`[PAGE_ERROR] ${error.message}`));
  await page.goto(`${appBase}/#/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  if (!page.url().includes('/#/')) throw new Error(`해시 라우터 도달 실패: ${page.url()}`);
  await page.locator('[data-testid="sales-tab-home"]').waitFor({ state: 'visible', timeout: 60_000 });

  const specs = [
    {
      name: '견적',
      tabTestId: 'sales-tab-quotation',
      uniqueText: '신규 견적 — 거래처 선택',
      fileName: '01-quotation-partner-search-real-qa.png',
    },
    {
      name: '주문',
      tabTestId: 'sales-tab-order',
      uniqueText: '신규 주문 — 거래처 선택',
      fileName: '02-order-partner-search-real-qa.png',
    },
    {
      name: '거래처',
      tabTestId: 'sales-tab-customer',
      uniqueText: null,
      fileName: '03-customer-partner-search-real-qa.png',
    },
  ];
  for (const spec of specs) observations.push(await captureScreen(page, spec));

  writeFileSync(
    resultsPath,
    JSON.stringify(
      {
        head: process.env.QA_EXPECTED_HEAD ?? 'c5af40469e34425d2c0faa829a5bd8e0c75f302f',
        appUrl: page.url(),
        chromiumExecutable,
        observations,
        httpObservations,
      },
      null,
      2,
    ),
    'utf8',
  );
  for (const result of observations) {
    console.log(
      `[UI] screen=${result.screen} reach=${result.reachAssertion} HTTP=${result.httpStatus} backend=${result.backendCount} ui=${result.uiRowCount} screenshot=${path.basename(result.screenshotPath)}`,
    );
  }
  console.log(`RESULTS=${resultsPath}`);
} finally {
  if (browser) await browser.close().catch(() => {});
  if (proxy) await new Promise((resolve) => proxy.close(resolve));
  stopProcessTree(expoProcess);
}
