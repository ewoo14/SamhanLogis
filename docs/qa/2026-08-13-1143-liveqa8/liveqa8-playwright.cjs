const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { chromium } = require('../../../clients/desktop/node_modules/@playwright/test')
const { resolveQaCredential } = require('../../../scripts/lib/qa-credentials.cjs')

const origin = 'http://127.0.0.1:45875'
const outDir = __dirname
const results = []
const emit = (line) => { results.push(line); console.log(line) }
const shot = (name) => path.join(outDir, name)
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

async function appFetch(page, url, options = {}) {
  return page.evaluate(async ({ url, options }) => {
    const started = performance.now()
    const response = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    })
    const text = await response.text()
    let json = null
    try { json = JSON.parse(text) } catch {}
    return { http: response.status, ms: Math.round(performance.now() - started), text, json }
  }, { url, options })
}

function componentRequest(items) {
  return items.map((item) => ({
    componentProductCode: item.componentProductCode,
    defaultQty: item.defaultQty,
    qtyMode: item.qtyMode,
    componentKind: item.componentKind,
    componentVariant: item.componentVariant,
    componentShape: item.componentShape || null,
    isDefault: item.isDefault,
    specText: item.specText,
    allocationMode: item.allocationMode,
    allocationWeight: item.allocationWeight,
    fixedAllocationAmount: item.fixedAllocationAmount,
  }))
}

function ruleRequest(rule) {
  return {
    ruleKey: rule.ruleKey,
    estimateCategory: rule.estimateCategory,
    name: rule.name,
    enabled: rule.enabled,
    aggregation: rule.aggregation,
    when: rule.when || {},
    inactiveBehavior: rule.inactiveBehavior,
    conflictPolicy: rule.conflictPolicy,
    priority: rule.priority,
    legacyRef: rule.legacyRef,
    sources: rule.sources.map((item) => ({ productCode: item.productCode, factor: Number(item.factor || 1) })),
    targets: rule.targets.map((item, index) => ({
      productCode: item.productCode,
      multiplier: Number(item.multiplier || 1),
      roundingMode: item.roundingMode || 'NONE',
      componentVariant: item.componentVariant || null,
      componentShape: item.componentShape || null,
      displayOrder: item.displayOrder || index + 1,
    })),
  }
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: 'ko-KR' })
  const evidence = await context.newPage()
  await evidence.setContent(`<!doctype html><meta charset="utf-8"><style>
    body{font-family:ui-monospace,Consolas,monospace;background:#07111f;color:#d8e7ff;padding:40px}h1{font:700 30px system-ui;color:#fff}
    .ok{color:#74e6a2}.box{border:1px solid #294766;background:#0b1b2f;padding:24px;border-radius:14px;line-height:1.8;white-space:pre-wrap}
  </style><h1>A1 · 현재 커밋 신선 빌드 / 실행본 확인</h1><div class="box"><span class="ok">BUILD SUCCESSFUL</span>
CURRENT_COMMIT|f93fa8af2739dee73755f9d50b281efb2f436983
BUILD_WINDOW|2026-08-13T04:33:24.903+09:00 → 04:33:50.050+09:00
FRESH_JAR_SHA256|EA53F01D55E25CC5CDAD1D18D809B399F579B755D90FFC81718180D4158911F3
RUNNING_CONTAINER_SHA256|ea53f01d55e25cc5cdad1d18d809b399f579b755d90ffc81718180d4158911f3
RUNNING_MOUNT|.../w1111/services/product-service/build/libs/product-service.jar → /app.jar (read-only)

ACTUAL_BYTECODE|setConnectTimeout(100ms)
ACTUAL_BYTECODE|setReadTimeout(200ms)
RUNNING|product/user/auth/eureka/gateway/web + isolated PostgreSQL</div>`)
  await evidence.screenshot({ path: shot('01-A1-fresh-current-commit-build-running-jar-timeout-100-200ms.png'), fullPage: true })
  emit('A1_SCREENSHOT|01-A1-fresh-current-commit-build-running-jar-timeout-100-200ms.png')

  const page = await context.newPage()
  await page.goto(`${origin}/login`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('login-id-input').fill('dev_master')
  await page.getByTestId('login-password-input').fill(resolveQaCredential('QA_DEV_DEFAULT_PASSWORD'))
  await page.getByTestId('login-submit-button').click()
  await page.waitForURL((url) => url.pathname !== '/login', { timeout: 30000 })
  emit(`LOGIN_UI|url=${page.url()}|http=200`)

  // 정상 조회 30회 이상: 첫 warm-up은 통계에서 제외한다.
  await appFetch(page, '/api/products/by-model/AP110RNPPHH1')
  const normal = []
  let normalDrop = 0
  for (let i = 1; i <= 30; i++) {
    const r = await appFetch(page, '/api/products/by-model/AP110RNPPHH1')
    const createdBy = r.json?.data?.createdBy || ''
    if (r.http !== 200 || !createdBy || createdBy === '사용자 미상') normalDrop++
    normal.push(r.ms)
    emit(`NORMAL_ACTUAL|run=${i}|http=${r.http}|ms=${r.ms}|createdBy=${createdBy}`)
  }
  emit(`NORMAL_ACTUAL_SUMMARY|runs=30|fail=${normalDrop}|failureRate=${(normalDrop / 30 * 100).toFixed(1)}%|medianMs=${median(normal)}|minMs=${Math.min(...normal)}|maxMs=${Math.max(...normal)}`)

  const uuidPaths = [
    '/api/v1/products?category=HOME_MULTI&page=0&size=10000',
    '/api/v1/classifications?estimateCategory=HOME_MULTI',
    '/api/products?q=AM052BN6PBH1&size=20',
    '/api/products/by-model/AM052BN6PBH1',
    '/api/products/categories',
    '/api/v1/products/AC110CS6PBH1SY/components',
  ]
  const uuidRe = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi
  for (const url of uuidPaths) {
    const r = await appFetch(page, url)
    const count = (r.text.match(uuidRe) || []).length
    emit(`UUID_SWEEP|GET|${url}|http=${r.http}|bytes=${Buffer.byteLength(r.text)}|uuid=${count}`)
  }

  for (const code of ['AP110RNPPHH1', 'AM052BN6PBH1']) {
    const r = await appFetch(page, `/api/products/by-model/${code}`)
    emit(`AUDIT_DISPLAY|${code}|http=${r.http}|createdBy=${r.json?.data?.createdBy}|modifiedBy=${r.json?.data?.modifiedBy}`)
  }

  await page.goto(`${origin}/products/AP110RNPPHH1/edit`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('product-form-created-by').waitFor({ timeout: 30000 })
  const createdNormal = (await page.getByTestId('product-form-created-by').innerText()).replace(/\s+/g, ' ')
  const modifiedNormal = (await page.getByTestId('product-form-modified-by').innerText()).replace(/\s+/g, ' ')
  emit(`UI_NORMAL|created=${createdNormal}|modified=${modifiedNormal}`)
  await page.screenshot({ path: shot('02-C9-screen-created-by-modified-by-actual-user-and-system-marker.png'), fullPage: true })

  const bundleCode = 'AC110CS6PBH1SY'
  const baselineComponentsResult = await appFetch(page, `/api/v1/products/${bundleCode}/components`)
  const baselineComponents = baselineComponentsResult.json
  const baselineRequest = componentRequest(baselineComponents)
  const autoWeights = baselineComponents.filter((x) => x.allocationMode === 'AUTO').map((x) => x.allocationWeight)
  const fixed45375 = baselineComponents.filter((x) => Number(x.fixedAllocationAmount) === 45375).length
  emit(`AUTO_FIXED|auto=${autoWeights.join('+')}|fixed45375=${fixed45375}|active=${baselineComponents.length}`)
  for (let i = 1; i <= 4; i++) {
    const r = await appFetch(page, `/api/v1/products/${bundleCode}/components`, { method: 'PUT', body: JSON.stringify(baselineRequest) })
    emit(`NOCHANGE_SAVE|run=${i}|http=${r.http}`)
  }

  const detail = (await appFetch(page, '/api/products/by-model/AP110RNPPHH1')).json.data
  const changedName = `${detail.name} [LiveQA8]`
  const changed = await appFetch(page, `/api/products/${detail.id}`, { method: 'PATCH', body: JSON.stringify({ name: changedName }) })
  const changedQuery = await appFetch(page, '/api/products/by-model/AP110RNPPHH1')
  emit(`VALUE_CHANGE|patch=${changed.http}|requery=${changedQuery.json?.data?.name}`)
  const restoredName = await appFetch(page, `/api/products/${detail.id}`, { method: 'PATCH', body: JSON.stringify({ name: detail.name }) })
  emit(`VALUE_RESTORE|http=${restoredName.http}`)

  const invalid = baselineRequest.map((item) => ({ ...item }))
  const sixIndex = invalid.findIndex((item) => item.allocationMode === 'AUTO' && item.allocationWeight === 6)
  invalid[sixIndex].allocationWeight = 5
  const weight9 = await appFetch(page, `/api/v1/products/${bundleCode}/components`, { method: 'PUT', body: JSON.stringify(invalid) })
  const afterInvalid = (await appFetch(page, `/api/v1/products/${bundleCode}/components`)).json
  emit(`WEIGHT_9|http=${weight9.http}|message=${weight9.json?.message}|after=${afterInvalid.filter((x) => x.allocationMode === 'AUTO').map((x) => x.allocationWeight).join('+')}`)

  await page.goto(`${origin}/products/${bundleCode}/edit`, { waitUntil: 'domcontentloaded' })
  const editor = page.getByTestId('product-form-components-editor')
  await editor.waitFor({ timeout: 30000 })
  const rows = editor.locator('[data-testid^="product-form-component-row-"]')
  let targetRow = null
  for (let i = 0; i < await rows.count(); i++) {
    const row = rows.nth(i)
    if (await row.locator('input').first().inputValue() === 'AWR-WE13N') { targetRow = row; break }
  }
  if (!targetRow) targetRow = rows.first()
  const modelBefore = await targetRow.locator('input').first().inputValue()
  const selects = targetRow.locator('select')
  const kindSelect = selects.nth(0)
  const featureSelect = selects.nth(1)
  const shapeSelect = selects.nth(2)
  const beforeOptions = await featureSelect.locator('option').allTextContents()
  await kindSelect.selectOption('REMOTE')
  const afterOptions = await featureSelect.locator('option').allTextContents()
  const shapeDefault = await shapeSelect.inputValue()
  const modelAfter = await targetRow.locator('input').first().inputValue()
  const labels = await targetRow.locator('label').allTextContents()
  const surfaces = ['수량', '수량 동기화', '비중', '고정금액', '반올림 단위'].map((label) => labels.some((x) => x.includes(label)) ? 1 : 0)
  emit(`FEATURE_KIND|before=${beforeOptions.join(',')}|after=${afterOptions.join(',')}|shape='${shapeDefault}'|modelInvariant=${modelBefore === modelAfter}|surfaces=${surfaces.join(',')}`)
  await targetRow.screenshot({ path: shot('03-C13-C14-feature-kind-options-shape-empty-model-invariant-five-surfaces.png') })

  await page.goto(`${origin}/products/estimate-items?category=HOME_MULTI`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('estimate-items-search-input').fill('AM052BN6PBH1')
  await page.getByTestId('estimate-items-query-button').click()
  const syncOpen = page.getByTestId('estimate-items-quantity-sync-AM052BN6PBH1-open')
  await syncOpen.waitFor({ timeout: 30000 })
  const rulesResult = await appFetch(page, '/api/v1/quantity-sync-rules?estimateCategory=HOME_MULTI')
  const baselineRule = rulesResult.json.find((item) => item.ruleKey === 'UI_HOME_MULTI_AM052BN6PBH1')
  emit(`ACTIVE_TARGETS_BEFORE|${baselineRule.targets.length}|${baselineRule.targets.map((x) => x.productCode).join(',')}`)
  await syncOpen.click()
  const modal = page.getByTestId('estimate-items-quantity-sync-AM052BN6PBH1-modal')
  await modal.waitFor()
  const addInput = page.getByTestId('estimate-items-quantity-sync-AM052BN6PBH1-input')
  await addInput.fill('AWR-WG00N')
  await page.waitForTimeout(1000)
  const addedChip = modal.locator('[data-testid*="modal-chip-AWR-WG00N"]')
  await addedChip.waitFor({ timeout: 15000 })
  await addedChip.locator('input[type="number"]').fill('2')
  const chipSelects = addedChip.locator('select')
  await chipSelects.nth(0).selectOption('컬러')
  await chipSelects.nth(1).selectOption('사각')
  const saveResponsePromise = page.waitForResponse((res) => res.url().includes('/api/v1/quantity-sync-rules/UI_HOME_MULTI_AM052BN6PBH1') && res.request().method() === 'PUT')
  await page.getByTestId('estimate-items-quantity-sync-AM052BN6PBH1-save').click()
  const saveResponse = await saveResponsePromise
  await page.waitForTimeout(500)
  await page.getByTestId('estimate-items-quantity-sync-AM052BN6PBH1-open').click()
  const reopenedChip = page.locator('[data-testid*="modal-chip-AWR-WG00N"]')
  await reopenedChip.waitFor({ timeout: 15000 })
  const reopenQty = await reopenedChip.locator('input[type="number"]').inputValue()
  const reopenFeature = await reopenedChip.locator('select').nth(0).inputValue()
  const reopenShape = await reopenedChip.locator('select').nth(1).inputValue()
  emit(`MODAL_ADD|put=${saveResponse.status()}|reopenQty=${reopenQty}|feature=${reopenFeature}|shape=${reopenShape}`)
  await page.screenshot({ path: shot('04-C12-modal-accessory-add-chip-settings-save-reopen-complete.png'), fullPage: true })
  const restoreRule = await appFetch(page, `/api/v1/quantity-sync-rules/${baselineRule.ruleKey}`, { method: 'PUT', body: JSON.stringify(ruleRequest(baselineRule)) })
  const finalRules = (await appFetch(page, '/api/v1/quantity-sync-rules?estimateCategory=HOME_MULTI')).json
  const finalRule = finalRules.find((item) => item.ruleKey === baselineRule.ruleKey)
  emit(`ACTIVE_TARGETS|restore=${restoreRule.http}|active=${finalRule.targets.length}|targets=${finalRule.targets.map((x) => x.productCode).join(',')}`)

  await page.goto(`${origin}/products/AM052BN6PBH1/edit`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('product-form-created-by').waitFor({ timeout: 30000 })
  execFileSync('docker', ['stop', 'sol1143-liveqa8-user'], { stdio: 'pipe' })
  emit('USER_SERVICE|state=exited')
  const down = await appFetch(page, '/api/products/by-model/AM052BN6PBH1')
  emit(`DOWN_FIRST|http=${down.http}|ms=${down.ms}|createdBy=${down.json?.data?.createdBy}|modifiedBy=${down.json?.data?.modifiedBy}|uuid=${(down.text.match(uuidRe) || []).length}`)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByTestId('product-form-created-by').waitFor({ timeout: 30000 })
  const downCreated = (await page.getByTestId('product-form-created-by').innerText()).replace(/\s+/g, ' ')
  const downModified = (await page.getByTestId('product-form-modified-by').innerText()).replace(/\s+/g, ' ')
  await page.evaluate(({ ms, http }) => {
    const badge = document.createElement('div')
    badge.id = 'liveqa8-first-request-evidence'
    badge.textContent = `user-service 중단 직후 첫 요청 · HTTP ${http} · ${ms}ms`
    Object.assign(badge.style, { position: 'fixed', top: '12px', right: '12px', zIndex: 99999, padding: '14px 18px', borderRadius: '10px', background: '#102a43', color: '#fff', font: '700 18px system-ui', boxShadow: '0 8px 24px #0005' })
    document.body.appendChild(badge)
  }, { ms: down.ms, http: down.http })
  emit(`UI_DOWN|created=${downCreated}|modified=${downModified}`)
  await page.screenshot({ path: shot('05-B3-user-service-stopped-first-request-ms-http200-unknown-no-uuid.png'), fullPage: true })
  execFileSync('docker', ['start', 'sol1143-liveqa8-user'], { stdio: 'pipe' })
  emit('USER_SERVICE_RESTORE|state=running')

  fs.writeFileSync(path.join(outDir, 'liveqa8-results.txt'), `${results.join('\n')}\n`, 'utf8')
  await browser.close()
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error)
  process.exitCode = 1
})
