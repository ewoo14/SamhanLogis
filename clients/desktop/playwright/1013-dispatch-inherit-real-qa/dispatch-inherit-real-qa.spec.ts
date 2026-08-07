import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const BASE_URL = process.env['REAL_QA_RENDERER_BASE_URL'] ?? 'http://127.0.0.1:5175'
const SHOTS = resolveQaShotsDir(path.resolve(process.cwd(), '../../docs/qa/1013-dispatch-inherit-real-qa'))
fs.mkdirSync(SHOTS, { recursive: true })

async function login(page: import('@playwright/test').Page, loginId = 'dev_master'): Promise<void> {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
  await page.locator('input').nth(0).fill(loginId)
  await page.locator('input').nth(1).fill(resolveQaCredential('QA_DEV_DEFAULT_PASSWORD'))
  await page.getByRole('button', { name: '로그인', exact: true }).click()
  await page.waitForURL(/#\/$/, { timeout: 15000 })
}

async function openDispatchSms(page: import('@playwright/test').Page, loginId = 'dev_master'): Promise<void> {
  await login(page, loginId)
  await page.getByRole('button', { name: '배차', exact: true }).click()
  await page.getByText('배차안내 SMS', { exact: true }).click()
  await page.waitForURL(/#\/arologis\/dispatch-sms/, { timeout: 15000 })
  await page.waitForTimeout(1000)
}

async function previewQaDate(page: import('@playwright/test').Page): Promise<void> {
  await page.getByTestId('dispatch-sms-date').fill('2026-08-03')
  await page.getByTestId('dispatch-sms-preview-button').click()
  await page.waitForTimeout(10000)
}

test('실제 GUI 진입점 탐색', async ({ page }) => {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  await page.screenshot({ path: path.join(SHOTS, '00-entry-discovery.png'), fullPage: true })
  console.log('[URL]', page.url())
  console.log('[TITLE]', await page.title())
  console.log('[TEXT]', (await page.locator('body').innerText()).slice(0, 4000))
  console.log('[INPUTS]', await page.locator('input').evaluateAll((els) => els.map((e) => ({ type: e.type, name: e.name, id: e.id, placeholder: e.getAttribute('placeholder'), aria: e.getAttribute('aria-label') }))))
  console.log('[BUTTONS]', await page.getByRole('button').allTextContents())
  console.log('[LINKS]', await page.getByRole('link').allTextContents())
})

test('로그인 후 실제 메뉴 탐색', async ({ page }) => {
  page.on('console', (msg) => console.log('[BROWSER CONSOLE]', msg.type(), msg.text()))
  page.on('requestfailed', (req) => console.log('[REQUEST FAILED]', req.method(), req.url(), req.failure()?.errorText))
  page.on('response', (res) => {
    if (res.status() >= 400 || /login|auth/i.test(res.url())) console.log('[RESPONSE]', res.status(), res.url())
  })
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
  await page.locator('input').nth(0).fill('dev_master')
  await page.locator('input').nth(1).fill(resolveQaCredential('QA_DEV_DEFAULT_PASSWORD'))
  console.log('[LOGIN BUTTON DISABLED]', await page.getByRole('button', { name: '로그인', exact: true }).isDisabled())
  await page.getByRole('button', { name: '로그인', exact: true }).click()
  await page.waitForTimeout(4000)
  await page.screenshot({ path: path.join(SHOTS, '01-login-discovery.png'), fullPage: true })
  console.log('[URL AFTER LOGIN]', page.url())
  console.log('[TEXT AFTER LOGIN]', (await page.locator('body').innerText()).slice(0, 8000))
  console.log('[BUTTONS AFTER LOGIN]', await page.getByRole('button').allTextContents())
  console.log('[LINKS AFTER LOGIN]', await page.getByRole('link').allTextContents())
})

test('시나리오 1 — 배차안내문자 화면 진입', async ({ page }) => {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
  await page.locator('input').nth(0).fill('dev_master')
  await page.locator('input').nth(1).fill(resolveQaCredential('QA_DEV_DEFAULT_PASSWORD'))
  await page.getByRole('button', { name: '로그인', exact: true }).click()
  await page.waitForURL(/#\/$/, { timeout: 15000 })
  await page.getByRole('button', { name: '배차', exact: true }).click()
  await page.waitForTimeout(500)
  console.log('[DISPATCH MENU]', (await page.locator('body').innerText()).slice(0, 5000))
  console.log('[DISPATCH BUTTONS]', await page.getByRole('button').allTextContents())
  await page.screenshot({ path: path.join(SHOTS, '02-dispatch-menu.png'), fullPage: true })
  await page.getByText('배차안내 SMS', { exact: true }).click()
  await page.waitForTimeout(2500)
  console.log('[DISPATCH SMS URL]', page.url())
  console.log('[DISPATCH SMS TEXT]', (await page.locator('body').innerText()).slice(0, 8000))
  await page.screenshot({ path: path.join(SHOTS, '03-dispatch-sms-entry.png'), fullPage: true })
})

test('시나리오 2 — 하차일별 그룹 문구 생성', async ({ page }) => {
  page.on('response', async (res) => {
    if (/dispatch|outbound|preview/i.test(res.url())) {
      let body = ''
      try { body = (await res.text()).slice(0, 1200) } catch { body = '<body-read-failed>' }
      console.log('[PREVIEW RESPONSE]', res.status(), res.url(), body)
    }
  })
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') console.log('[PREVIEW CONSOLE]', msg.type(), msg.text())
  })
  await openDispatchSms(page)
  await previewQaDate(page)
  const messages = await page.locator('textarea').evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value))
  console.log('[GROUP MESSAGE TEXTAREAS]', JSON.stringify(messages, null, 2))
  console.log('[PREVIEW BODY]', (await page.locator('body').innerText()).slice(0, 12000))
  await page.screenshot({ path: path.join(SHOTS, '04-group-message.png'), fullPage: true })
})

test('시나리오 3 — 1차 그룹 키', async ({ page }) => {
  await openDispatchSms(page)
  await previewQaDate(page)
  const body = await page.locator('body').innerText()
  const groupHeadings = await page.locator('h2, h3, h4, [role="heading"]').allTextContents()
  const checkboxes = await page.locator('input[type="checkbox"]').count()
  const textareas = await page.locator('textarea').evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value))
  console.log('[GROUP HEADINGS]', JSON.stringify(groupHeadings))
  console.log('[CHECKBOX COUNT]', checkboxes)
  console.log('[GROUP KEY BODY]', body.match(/단톡방:.*|단톡방 미매핑.*|\[미매핑\].*/g))
  console.log('[GROUP KEY VALUES]', JSON.stringify(textareas, null, 2))
  await page.screenshot({ path: path.join(SHOTS, '05-first-group-keys.png'), fullPage: true })
})

test('시나리오 4 — 미매핑 보정 문구', async ({ page }) => {
  await openDispatchSms(page)
  await previewQaDate(page)
  const notice = '※출하창고 상황에 따라 지연될 수 있음을 양해 부탁드립니다.'
  const messages = await page.locator('textarea').evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value))
  const noticeMessages = messages.filter((message) => message.includes(notice))
  console.log('[DELAY NOTICE COUNT]', noticeMessages.length)
  console.log('[DELAY NOTICE VALUES]', JSON.stringify(noticeMessages, null, 2))
  await page.screenshot({ path: path.join(SHOTS, '06-unmapped-delay-notice.png'), fullPage: true })
})

test('시나리오 5 — 편집·복사', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await openDispatchSms(page)
  await previewQaDate(page)
  const editText = 'QA-1013-EDITED-GROUP\n선택 편집 확인'
  await page.locator('textarea').nth(0).fill(editText)
  await page.locator('textarea').nth(0).blur()
  await page.screenshot({ path: path.join(SHOTS, '07-edit-copy-before.png'), fullPage: true })
  await page.locator('input[type="checkbox"]').nth(0).check()
  await page.waitForTimeout(300)
  const checkedStates = await page.locator('input[type="checkbox"]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).checked))
  const copyButton = page.getByRole('button', { name: /선택 복사/ }).first()
  console.log('[CHECKED STATES AFTER FIRST SELECT]', JSON.stringify(checkedStates))
  console.log('[COPY BUTTON LABEL]', await copyButton.innerText())
  await copyButton.click()
  await page.waitForTimeout(700)
  const clipboard = await page.evaluate(() => navigator.clipboard.readText().catch(() => '<clipboard-read-failed>'))
  console.log('[CLIPBOARD AFTER EDIT COPY]', JSON.stringify(clipboard))
  await page.screenshot({ path: path.join(SHOTS, '07-edit-copy.png'), fullPage: true })
})

test('시나리오 6 — 미매핑 전표 UI', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await openDispatchSms(page)
  await previewQaDate(page)
  const body = await page.locator('body').innerText()
  const unmappedRows = (body.match(/\[미매핑\]/g) ?? []).length
  const textareas = await page.locator('textarea').count()
  const unmappedComment = 'QA-1013-UNMAPPED-COMMENT'
  await page.locator('textarea').nth(2).fill(unmappedComment)
  await page.locator('textarea').nth(2).blur()
  await page.locator('input[type="checkbox"]').nth(2).check()
  const copyButton = page.getByRole('button', { name: /선택 복사/ }).first()
  console.log('[UNMAPPED ROW MARKER COUNT]', unmappedRows)
  console.log('[TEXTAREA COUNT]', textareas)
  console.log('[UNMAPPED COPY BUTTON]', await copyButton.innerText())
  await copyButton.click()
  await page.waitForTimeout(700)
  console.log('[UNMAPPED CLIPBOARD]', JSON.stringify(await page.evaluate(() => navigator.clipboard.readText().catch(() => '<clipboard-read-failed>'))))
  await page.screenshot({ path: path.join(SHOTS, '08-unmapped-ui.png'), fullPage: true })
})

test('시나리오 7 — 권한 회수 V92', async ({ page }) => {
  await login(page, 'dev_dispatch')
  await page.waitForTimeout(1500)
  console.log('[REVOKED ACCOUNT DASHBOARD]', (await page.locator('body').innerText()).slice(0, 5000))
  await page.screenshot({ path: path.join(SHOTS, '09-revoked-account-dashboard.png'), fullPage: true })
  const dispatchButton = page.getByRole('button', { name: '배차', exact: true })
  const dispatchVisible = await dispatchButton.isVisible().catch(() => false)
  console.log('[REVOKED ACCOUNT DISPATCH MENU VISIBLE]', dispatchVisible)
  if (dispatchVisible) {
    await dispatchButton.click()
    await page.waitForTimeout(500)
    const sms = page.getByText('배차안내 SMS', { exact: true })
    const smsVisible = await sms.isVisible().catch(() => false)
    console.log('[REVOKED ACCOUNT SMS MENU VISIBLE]', smsVisible)
    if (smsVisible) {
      await sms.click()
      await page.waitForTimeout(1500)
    }
  }
  console.log('[REVOKED ACCOUNT AFTER MENU]', page.url(), (await page.locator('body').innerText()).slice(0, 5000))
  await page.screenshot({ path: path.join(SHOTS, '10-revoked-account-dispatch-attempt.png'), fullPage: true })
  const historyTab = page.getByText('저장내역', { exact: true }).first()
  const historyVisible = await historyTab.isVisible().catch(() => false)
  console.log('[REVOKED ACCOUNT HISTORY TAB VISIBLE]', historyVisible)
  if (historyVisible) {
    await historyTab.click()
    await page.waitForTimeout(1800)
  }
  console.log('[REVOKED ACCOUNT HISTORY AFTER CLICK]', page.url(), (await page.locator('body').innerText()).slice(0, 6000))
  await page.screenshot({ path: path.join(SHOTS, '11-revoked-history-tab.png'), fullPage: true })
})

test('시나리오 8 — 자동 SMS 미발송', async ({ page }) => {
  const sendRequests: string[] = []
  page.on('request', (request) => {
    const url = request.url()
    if (/127\.0\.0\.1:8080/.test(url) && /\/send(?:\?|\/|$)|\/aligo|messages\/sms/i.test(url)) {
      sendRequests.push(`${request.method()} ${url}`)
    }
  })
  await openDispatchSms(page)
  const beforeButtons = await page.getByRole('button').allTextContents()
  await previewQaDate(page)
  const afterButtons = await page.getByRole('button').allTextContents()
  console.log('[BUTTONS BEFORE PREVIEW]', JSON.stringify(beforeButtons))
  console.log('[BUTTONS AFTER PREVIEW]', JSON.stringify(afterButtons))
  console.log('[SMS SEND REQUESTS]', JSON.stringify(sendRequests))
  const bodyText = await page.locator('body').innerText()
  console.log('[VISIBLE SEND LABELS]', bodyText.match(/문자 보내기|SMS 발송|발송하기|자동 발송|Aligo/gi) ?? [])
  await page.screenshot({ path: path.join(SHOTS, '12-no-auto-sms.png'), fullPage: true })
})
