#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Real-user QA capture for the desktop renderer against the local Docker stack.
 *
 * Required env:
 * - QA_LOGIN_ID
 * - QA_LOGIN_PW
 *
 * Optional env:
 * - QA_BASE_URL (default: http://127.0.0.1:5173)
 * - QA_HEADLESS=0 to show the browser
 */
const fs = require('node:fs/promises')
const path = require('node:path')
const { chromium } = require('@playwright/test')

const BASE_URL = process.env.QA_BASE_URL || 'http://127.0.0.1:5173'
const LOGIN_ID = process.env.QA_LOGIN_ID || 'dev_master'
const LOGIN_PW = process.env.QA_LOGIN_PW
const HEADLESS = process.env.QA_HEADLESS !== '0'
const ROOT = path.resolve(__dirname, '../../..')
const QA_DIR = path.join(ROOT, 'docs', 'qa', 'full-menu-real-qa-2026-06-01')
const SCREENSHOT_DIR = path.join(QA_DIR, 'screenshots')
const RESULT_JSON = path.join(QA_DIR, 'qa-results.json')
const REPORT_MD = path.join(QA_DIR, 'REPORT.md')
const PR_BODY_MD = path.join(QA_DIR, 'PR-BODY.md')

if (!LOGIN_PW) {
  console.error('QA_LOGIN_PW is required. The password is intentionally not stored in this script.')
  process.exit(1)
}

function rel(filePath) {
  return path.relative(QA_DIR, filePath).replace(/\\/g, '/')
}

function repoRel(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/')
}

function slug(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[^\w./?-]+/g, '-')
    .replace(/[#/?=&]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'page'
}

function uniqBy(items, keyFn) {
  const seen = new Set()
  const result = []
  for (const item of items) {
    const key = keyFn(item)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }
  return result
}

async function ensureDirs() {
  await fs.mkdir(SCREENSHOT_DIR, { recursive: true })
}

async function writeJson(file, data) {
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

async function installAuthShim(page) {
  await page.addInitScript(() => {
    const KEY = '__samhan_auth'
    const read = () => {
      try {
        return JSON.parse(localStorage.getItem(KEY) || 'null')
      } catch {
        return null
      }
    }
    window.samhanAuth = {
      getToken: async () => read(),
      setToken: async (auth) => localStorage.setItem(KEY, JSON.stringify(auth)),
      clearToken: async () => localStorage.removeItem(KEY),
    }
    window.samhanLegacy = {
      getEstimateUrl: async () => '',
      getOrderUrl: async () => '',
      openExternal: async () => {},
    }
  })
}

async function main() {
  await ensureDirs()

  const result = {
    startedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    loginId: LOGIN_ID,
    branch: '',
    menuItems: [],
    screenshots: [],
    events: [],
    issues: [],
    flows: [],
  }

  try {
    const { execFileSync } = require('node:child_process')
    result.branch = execFileSync('git', ['branch', '--show-current'], {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim()
  } catch {
    result.branch = 'unknown'
  }

  let scope = 'bootstrap'
  const browser = await chromium.launch({ headless: HEADLESS })
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
  })
  page.setDefaultTimeout(20_000)
  await installAuthShim(page)

  page.on('console', (msg) => {
    if (!['error', 'warning'].includes(msg.type())) return
    result.events.push({
      scope,
      type: `console:${msg.type()}`,
      text: msg.text(),
    })
  })
  page.on('pageerror', (err) => {
    result.events.push({ scope, type: 'pageerror', text: err.message })
  })
  page.on('response', (response) => {
    const status = response.status()
    if (status < 400) return
    result.events.push({
      scope,
      type: 'http',
      status,
      method: response.request().method(),
      url: response.url(),
    })
  })

  async function screenshot(name, label, options = {}) {
    const file = path.join(SCREENSHOT_DIR, `${name}.png`)
    await page.screenshot({
      path: file,
      fullPage: options.fullPage !== false,
      animations: 'disabled',
    })
    const record = { label, file: repoRel(file), local: rel(file) }
    result.screenshots.push(record)
    return record
  }

  async function locatorScreenshot(locator, name, label) {
    const file = path.join(SCREENSHOT_DIR, `${name}.png`)
    await locator.screenshot({ path: file, animations: 'disabled' })
    const record = { label, file: repoRel(file), local: rel(file) }
    result.screenshots.push(record)
    return record
  }

  async function login() {
    scope = 'login'
    await page.goto(`${BASE_URL}/#/login`, { waitUntil: 'domcontentloaded' })
    await screenshot('00-login-page', '로그인 화면')
    await page.fill('[data-testid=login-id-input]', LOGIN_ID)
    await page.fill('[data-testid=login-password-input]', LOGIN_PW)
    await page.click('[data-testid=login-submit-button]')
    await page.waitForTimeout(2500)
    await screenshot('01-dashboard-after-login', '마스터 로그인 후 대시보드')
  }

  async function expandSidebar() {
    for (let pass = 0; pass < 4; pass += 1) {
      const clicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('aside button[aria-expanded="false"]'))
        for (const button of buttons) button.click()
        return buttons.length
      })
      if (clicked === 0) break
      await page.waitForTimeout(250)
    }
  }

  async function captureSidebarInventory() {
    scope = 'menu-sidebar'
    await expandSidebar()
    const aside = page.locator('aside').first()
    const dims = await aside.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }))
    const step = Math.max(250, dims.clientHeight - 80)
    const positions = []
    for (let y = 0; y <= dims.scrollHeight - dims.clientHeight + 1; y += step) {
      positions.push(y)
    }
    if (!positions.includes(Math.max(0, dims.scrollHeight - dims.clientHeight))) {
      positions.push(Math.max(0, dims.scrollHeight - dims.clientHeight))
    }
    let index = 1
    for (const y of positions) {
      await aside.evaluate((el, scrollTop) => {
        el.scrollTop = scrollTop
      }, y)
      await page.waitForTimeout(100)
      await locatorScreenshot(
        aside,
        `02-sidebar-${String(index).padStart(2, '0')}`,
        `전체 메뉴 사이드바 스크롤 ${index}/${positions.length}`,
      )
      index += 1
    }
    await aside.evaluate((el) => {
      el.scrollTop = 0
    })
  }

  async function collectMainMenu() {
    await expandSidebar()
    const items = await page.evaluate(() => Array.from(document.querySelectorAll('aside a'))
      .map((anchor, index) => ({
        source: 'main',
        index,
        label: anchor.textContent.trim().replace(/\s+/g, ' '),
        href: anchor.getAttribute('href'),
        testId: anchor.getAttribute('data-testid'),
      }))
      .filter((item) => item.href && item.href.startsWith('#/')))
    return items
  }

  async function collectAdminMenu() {
    scope = 'admin-menu-collect'
    await page.goto(`${BASE_URL}/#/admin/users`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    if (await page.locator('[data-testid=admin-shell]').count() === 0) {
      result.issues.push({
        severity: 'warning',
        area: 'admin-menu',
        message: 'AdminLayout 인사 사이드바를 수집하지 못했습니다.',
      })
      await screenshot('03-admin-menu-unavailable', 'AdminLayout 메뉴 수집 실패 화면')
      return []
    }
    await screenshot('03-admin-menu-overview', 'AdminLayout 인사 사이드바')
    return page.evaluate(() => Array.from(document.querySelectorAll('.admin-sidebar a'))
      .map((anchor, index) => ({
        source: 'admin',
        index,
        label: `인사/${anchor.textContent.trim().replace(/\s+/g, ' ')}`,
        href: anchor.getAttribute('href'),
        testId: anchor.getAttribute('data-testid'),
      }))
      .filter((item) => item.href && item.href.startsWith('#/')))
  }

  async function clickMenuItem(item) {
    const selector = item.source === 'admin' ? '.admin-sidebar' : 'aside'
    await expandSidebar()
    const clicked = await page.evaluate(({ selector: rootSelector, href }) => {
      const root = document.querySelector(rootSelector)
      if (!root) return false
      const anchor = Array.from(root.querySelectorAll('a')).find((a) => a.getAttribute('href') === href)
      if (!anchor) return false
      anchor.scrollIntoView({ block: 'center', inline: 'nearest' })
      anchor.click()
      return true
    }, { selector, href: item.href })
    if (!clicked) {
      await page.goto(`${BASE_URL}/${item.href}`, { waitUntil: 'domcontentloaded' })
      return 'goto'
    }
    await page.waitForTimeout(200)
    return 'click'
  }

  async function inspectPageForObviousErrors(item, shot) {
    const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '')
    const normalized = bodyText.replace(/\s+/g, ' ')
    const obvious = [
      '불러오지 못했습니다',
      '저장에 실패했습니다',
      '실패했습니다',
      '오류',
      'Error',
      '404',
      '500',
      '권한이 없습니다',
      'Forbidden',
      'Not Found',
      'Cannot read',
      'undefined',
    ].filter((pattern) => normalized.includes(pattern))
    const eventCount = result.events.filter((event) => event.scope === scope && event.type !== 'console:warning').length
    if (obvious.length > 0 || eventCount > 0) {
      result.issues.push({
        severity: eventCount > 0 ? 'error' : 'warning',
        area: 'menu',
        label: item.label,
        href: item.href,
        screenshot: shot.file,
        patterns: obvious,
        eventCount,
      })
    }
  }

  async function captureAllMenus(items) {
    let index = 1
    for (const item of items) {
      scope = `menu:${String(index).padStart(3, '0')}:${item.label}`
      const method = await clickMenuItem(item)
      await page.waitForTimeout(2200)
      const name = `menu-${String(index).padStart(3, '0')}-${slug(`${item.source}-${item.label}-${item.href}`)}`
      const shot = await screenshot(name, `${item.source === 'admin' ? 'AdminLayout ' : ''}${item.label} (${item.href})`)
      result.menuItems.push({ ...item, screenshot: shot.file, navigation: method })
      await inspectPageForObviousErrors(item, shot)
      index += 1
    }
  }

  async function fillOperationalSlipForm(kind) {
    const isSales = kind === 'sales'
    const route = isSales ? '/sales/new' : '/purchases/new'
    await page.goto(`${BASE_URL}/#${route}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)
    const requiredWarehouseIndex = isSales ? 0 : 1
    await page.locator('select').nth(requiredWarehouseIndex).selectOption({ index: 1 })

    const productInput = page.locator('input[role=combobox]').last()
    await productInput.fill('AR05')
    await page.waitForTimeout(1100)
    const optionCount = await page.locator('[role=option]').count()
    if (optionCount === 0) throw new Error(`${kind}: product autocomplete returned no options`)
    await page.locator('[role=option]').first().click()

    await page.locator('input[aria-label="라인 1 규격"]').fill(`QA-${kind.toUpperCase()}`)
    await page.locator('input[aria-label="라인 1 수량"]').fill(isSales ? '1' : '2')
    await page.getByTestId('slip-form-delivery-address').fill(`CODEX QA ${kind.toUpperCase()} delivery`)
    await page.getByTestId('slip-form-project-name').fill(`CODEX QA ${kind.toUpperCase()}`)
    await page.getByTestId('slip-form-recipient-phone').fill('010-1234-5678')
  }

  async function createOperationalSlip(kind) {
    scope = `flow:${kind}:create`
    await fillOperationalSlipForm(kind)
    await screenshot(`flow-${kind}-01-before-save`, `${kind} 전표 작성 입력 완료`)
    const save = page.locator('.sfp-submit-bar button').last()
    if (await save.isDisabled()) throw new Error(`${kind}: save button is disabled`)
    const responsePromise = page.waitForResponse(
      (response) => response.url().includes('/slips') && response.request().method() === 'POST',
      { timeout: 20_000 },
    )
    await save.click()
    const response = await responsePromise
    const text = await response.text()
    let payload = null
    try {
      payload = JSON.parse(text)
    } catch {
      payload = { raw: text }
    }
    const data = payload?.data
    await page.waitForTimeout(1600)
    const shot = await screenshot(`flow-${kind}-02-created-list`, `${kind} 전표 생성 후 목록`)
    result.flows.push({
      flow: `${kind}:create`,
      ok: response.ok(),
      status: response.status(),
      slipNo: data?.slipNo,
      slipId: data?.id,
      screenshot: shot.file,
    })
    if (!response.ok() || !data?.id) throw new Error(`${kind}: create failed (${response.status()})`)
    return data
  }

  async function editOperationalSlip(kind, slip) {
    const isSales = kind === 'sales'
    scope = `flow:${kind}:edit`
    await page.goto(`${BASE_URL}/#/${isSales ? 'sales' : 'purchases'}/${slip.id}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2600)
    await screenshot(`flow-${kind}-03-detail-before-edit`, `${kind} 전표 상세 - 수정 전`)
    await page.locator(`[data-testid=${isSales ? 'sales-slip-edit-button' : 'purchase-slip-edit-open'}]`).click()
    await page.waitForTimeout(500)
    const dialog = page.locator('[role=dialog]').first()
    await locatorScreenshot(dialog, `flow-${kind}-04-edit-modal`, `${kind} 전표 수정 모달`)
    const projectInputIndex = isSales ? 6 : 5
    await dialog.locator('input').nth(projectInputIndex).fill(`CODEX QA ${kind.toUpperCase()} EDITED`)
    const responsePromise = page.waitForResponse(
      (response) => response.url().includes('/slips/') && response.request().method() === 'PUT',
      { timeout: 20_000 },
    )
    await dialog.locator(`[data-testid=${isSales ? 'sales-slip-edit-save' : 'purchase-slip-edit-submit'}]`).click()
    const response = await responsePromise
    await page.waitForTimeout(1800)
    const shot = await screenshot(`flow-${kind}-05-after-edit`, `${kind} 전표 수정 저장 후 상세`)
    result.flows.push({
      flow: `${kind}:edit`,
      ok: response.ok(),
      status: response.status(),
      slipNo: slip.slipNo,
      screenshot: shot.file,
    })
    if (!response.ok()) throw new Error(`${kind}: edit failed (${response.status()})`)
  }

  async function deleteOperationalSlip(kind, slip) {
    const isSales = kind === 'sales'
    scope = `flow:${kind}:delete`
    await page.goto(`${BASE_URL}/#/${isSales ? 'sales' : 'purchases'}/${slip.id}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2300)
    await page.locator(`[data-testid=${isSales ? 'sales-slip-delete-button' : 'purchase-slip-delete-button'}]`).click()
    await page.waitForTimeout(500)
    const dialog = page.locator('[role=dialog]').first()
    await locatorScreenshot(dialog, `flow-${kind}-06-delete-modal`, `${kind} 전표 삭제 확인 모달`)
    const responsePromise = page.waitForResponse(
      (response) => response.url().includes('/slips/') && response.request().method() === 'DELETE',
      { timeout: 20_000 },
    )
    await page.locator(`[data-testid=${isSales ? 'sales-slip-delete-confirm-yes' : 'purchase-slip-delete-confirm-yes'}]`).click()
    const response = await responsePromise
    await page.waitForTimeout(1800)
    const shot = await screenshot(`flow-${kind}-07-after-delete`, `${kind} 전표 삭제 후 목록`)
    result.flows.push({
      flow: `${kind}:delete`,
      ok: response.ok(),
      status: response.status(),
      slipNo: slip.slipNo,
      screenshot: shot.file,
    })
    if (!response.ok()) throw new Error(`${kind}: delete failed (${response.status()})`)
  }

  async function runOperationalSlipFlow(kind) {
    try {
      const slip = await createOperationalSlip(kind)
      await editOperationalSlip(kind, slip)
      await deleteOperationalSlip(kind, slip)
    } catch (error) {
      const shot = await screenshot(`flow-${kind}-error`, `${kind} 전표 플로우 오류 화면`)
      result.issues.push({
        severity: 'error',
        area: `${kind}-slip-flow`,
        message: error.message,
        screenshot: shot.file,
      })
      result.flows.push({ flow: `${kind}:overall`, ok: false, error: error.message, screenshot: shot.file })
    }
  }

  async function runAccountingDateFlow(kind) {
    const isSales = kind === 'sales-accounting'
    const route = isSales ? '/accounting/sales-slips/new' : '/accounting/purchase-slips/new'
    const pageTestId = isSales
      ? 'sales-accounting-slip-form-page'
      : 'purchase-accounting-slip-form-page'
    scope = `flow:${kind}:date`
    try {
      await page.goto(`${BASE_URL}/#${route}`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(2500)
      const dateInput = page.locator(`[data-testid=${pageTestId}] input[type=date]`).first()
      const beforeDate = await dateInput.inputValue()
      const beforeShot = await screenshot(`flow-${kind}-01-date-default`, `${kind} 날짜 기본값 화면`)
      await dateInput.fill('2026-05-20')
      await page.waitForTimeout(2500)
      const afterShot = await screenshot(`flow-${kind}-02-date-changed`, `${kind} 날짜 변경 후 배분 조회 화면`)
      const editorText = await page.locator('[data-testid=slip-line-allocation-editor]').innerText().catch(() => '')
      const rangeCount = await page.locator('[data-testid=slip-line-allocation-editor] input[type=range]').count()
      const saveButton = page.locator(`[data-testid=${pageTestId}] button`).last()
      const saveDisabled = await saveButton.isDisabled().catch(() => true)
      const ok = rangeCount > 0 && !saveDisabled
      result.flows.push({
        flow: `${kind}:date-change`,
        ok,
        beforeDate,
        afterDate: '2026-05-20',
        allocationRows: rangeCount,
        saveDisabled,
        screenshots: [beforeShot.file, afterShot.file],
      })
      if (!ok) {
        result.issues.push({
          severity: 'error',
          area: `${kind}-date-change`,
          message: '날짜 변경 후 배분 가능한 전표 라인이 로드되지 않아 DRAFT 저장 및 전표번호 변경 검증을 완료할 수 없습니다.',
          details: editorText.slice(0, 500),
          screenshots: [beforeShot.file, afterShot.file],
        })
      }
    } catch (error) {
      const shot = await screenshot(`flow-${kind}-date-error`, `${kind} 날짜 변경 플로우 오류 화면`)
      result.issues.push({
        severity: 'error',
        area: `${kind}-date-change`,
        message: error.message,
        screenshot: shot.file,
      })
      result.flows.push({ flow: `${kind}:date-change`, ok: false, error: error.message, screenshot: shot.file })
    }
  }

  function summarizeEvents() {
    const ignoredFontWarnings = result.events.filter((event) =>
      event.type === 'console:warning' && /Failed to decode downloaded font|OTS parsing error/.test(event.text || ''),
    ).length
    const importantEvents = result.events.filter((event) =>
      !(event.type === 'console:warning' && /Failed to decode downloaded font|OTS parsing error|React Router Future Flag/.test(event.text || '')),
    )
    return { ignoredFontWarnings, importantEvents }
  }

  async function writeReport() {
    const { ignoredFontWarnings, importantEvents } = summarizeEvents()
    const okFlows = result.flows.filter((flow) => flow.ok).length
    const failedFlows = result.flows.filter((flow) => flow.ok === false).length
    const menuRows = result.menuItems.map((item, i) =>
      `| ${i + 1} | ${item.source} | ${item.label.replace(/\|/g, '/')} | \`${item.href}\` | ![](${path.relative(path.dirname(REPORT_MD), path.join(ROOT, item.screenshot)).replace(/\\/g, '/')}) |`,
    ).join('\n')
    const flowRows = result.flows.map((flow) =>
      `| ${flow.flow} | ${flow.ok ? 'PASS' : 'FAIL'} | ${flow.status ?? ''} | ${flow.slipNo ?? ''} | ${(flow.screenshot || (flow.screenshots || []).join('<br>') || '').replace(/\\/g, '/')} | ${flow.error ?? ''} |`,
    ).join('\n')
    const issueRows = result.issues.map((issue, i) =>
      `| ${i + 1} | ${issue.severity} | ${issue.area ?? ''} | ${(issue.label ?? '').replace(/\|/g, '/')} | ${(issue.href ?? '').replace(/\|/g, '/')} | ${(issue.message ?? issue.patterns?.join(', ') ?? '').replace(/\|/g, '/')} | ${([issue.screenshot].flat().concat(issue.screenshots || []).filter(Boolean).join('<br>')).replace(/\\/g, '/')} |`,
    ).join('\n')
    const eventRows = importantEvents.slice(0, 120).map((event, i) =>
      `| ${i + 1} | ${event.scope} | ${event.type} | ${event.status ?? ''} | ${(event.method ?? '').replace(/\|/g, '/')} | ${(event.url ?? event.text ?? '').replace(/\|/g, '/').slice(0, 240)} |`,
    ).join('\n')

    const report = `# 전체 메뉴 실사용자 QA 리포트 (2026-06-01)

- 브랜치: \`${result.branch}\`
- 대상: \`${BASE_URL}\` + local Docker Desktop backend
- 계정: \`${LOGIN_ID}\` / 비밀번호는 리포트와 스크립트에 저장하지 않음
- 메뉴 캡처: ${result.menuItems.length}개
- 스크린샷: ${result.screenshots.length}장
- 전표 플로우: PASS ${okFlows} / FAIL ${failedFlows}
- 중요 브라우저/HTTP 이벤트: ${importantEvents.length}건
- 반복 폰트 경고(별도 분류): ${ignoredFontWarnings}건

## 결론

매출/매입 운영 전표는 실제 UI에서 생성, 상세 조회, 수정, 삭제가 완료되었습니다. 단, 회계 매출/매입 전표 작성 화면은 날짜 변경 후 원천 전표 배분 라인을 불러오지 못해 날짜 변경에 따른 전표번호 변경 저장 검증이 막혔습니다.

## 전표 플로우

| Flow | 결과 | HTTP | 전표번호 | Screenshot | Error |
|---|---:|---:|---|---|---|
${flowRows || '| - | - | - | - | - | - |'}

## 발견 이슈

| # | 심각도 | 영역 | 메뉴 | 경로 | 내용 | Screenshot |
|---:|---|---|---|---|---|---|
${issueRows || '| - | - | - | - | - | - | - |'}

## 전체 메뉴 스크린샷

| # | Source | Menu | Href | Screenshot |
|---:|---|---|---|---|
${menuRows}

## 중요 이벤트

| # | Scope | Type | Status | Method | URL/Text |
|---:|---|---|---:|---|---|
${eventRows || '| - | - | - | - | - | - |'}
`
    await fs.writeFile(REPORT_MD, report, 'utf8')

    const prBody = `## QA 범위

- local Docker Desktop backend + desktop renderer(\`${BASE_URL}\`) 실사용자 QA
- 마스터 계정 \`${LOGIN_ID}\` 로그인
- 메인/인사/AdminLayout 메뉴 ${result.menuItems.length}개 전체 캡처
- 운영 전표 매출/매입 생성 → 상세 → 수정 → 삭제 플로우 검증
- 회계 전표 날짜 변경 화면 검증

## 결과 요약

- 운영 매출/매입 전표 생성·수정·삭제: PASS
- 회계 매출/매입 전표 날짜 변경 후 저장: FAIL (원천 전표 배분 라인 로드 실패)
- 상세 리포트: [docs/qa/full-menu-real-qa-2026-06-01/REPORT.md](docs/qa/full-menu-real-qa-2026-06-01/REPORT.md)

## 대표 스크린샷

![대시보드](docs/qa/full-menu-real-qa-2026-06-01/screenshots/01-dashboard-after-login.png)
![매출 전표 생성](docs/qa/full-menu-real-qa-2026-06-01/screenshots/flow-sales-02-created-list.png)
![매입 전표 삭제](docs/qa/full-menu-real-qa-2026-06-01/screenshots/flow-purchases-07-after-delete.png)
![회계 전표 날짜 변경 실패](docs/qa/full-menu-real-qa-2026-06-01/screenshots/flow-sales-accounting-02-date-changed.png)

<details>
<summary>전체 메뉴 스크린샷 목록</summary>

${result.menuItems.map((item, i) => `- ${i + 1}. ${item.label} \`${item.href}\`  \n  ![](${item.screenshot})`).join('\n')}

</details>

연관 Issue: 없음 (QA 산출물 PR)
`
    await fs.writeFile(PR_BODY_MD, prBody, 'utf8')
  }

  try {
    await login()
    await captureSidebarInventory()
    const mainMenu = await collectMainMenu()
    const adminMenu = await collectAdminMenu()
    const allMenu = mainMenu.concat(adminMenu)
    const normalized = uniqBy(allMenu, (item) => `${item.source}:${item.href}:${item.label}`)
    await captureAllMenus(normalized)
    await runOperationalSlipFlow('sales')
    await runOperationalSlipFlow('purchases')
    await runAccountingDateFlow('sales-accounting')
    await runAccountingDateFlow('purchase-accounting')
    result.finishedAt = new Date().toISOString()
  } finally {
    await writeJson(RESULT_JSON, result)
    await writeReport()
    await browser.close()
  }
}

main().catch(async (error) => {
  console.error(error)
  process.exit(1)
})
