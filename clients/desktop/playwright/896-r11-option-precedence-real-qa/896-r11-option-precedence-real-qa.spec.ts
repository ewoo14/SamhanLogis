import { expect, test, type Page } from '@playwright/test'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const BASE = process.env['QA_ESTIMATE_RULE_ONE_BASE'] ?? 'http://127.0.0.1:5320'
const SHOTS = resolveQaShotsDir(path.resolve(HERE, '../../../../docs/qa/2026-08-10-896-r11'))
const SOURCE = 'AM052BN6PBH1'

async function openHome(page: Page) {
  await page.goto(`${BASE}/?email=dev_master%40samhan-air.com`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await page.locator('#btnGoHome').click()
  await expect(page.locator(`input.qty-input[data-m="${SOURCE}"]:not(.fix-dc-inp)`)).toBeVisible({ timeout: 60_000 })
}

async function snapshot(page: Page) {
  return page.locator('tr[data-m]').evaluateAll((nodes) => nodes.map((node) => {
    const row = node as HTMLTableRowElement
    const input = row.querySelector<HTMLInputElement>('input.qty-input:not(.fix-dc-inp)')
    const subtotal = row.querySelector<HTMLElement>('td.sub')
    return {
      model: row.dataset.m ?? '',
      name: row.innerText.trim(),
      qty: Number(input?.value || 0),
      amount: Number((subtotal?.innerText ?? '').replace(/[^0-9-]/g, '')) || 0,
    }
  }))
}

async function findModel(page: Page, pattern: RegExp) {
  const model = await page.locator('tr[data-m]').evaluateAll((nodes, sourcePattern) => {
    const pattern = new RegExp(sourcePattern as string, 'i')
    const row = nodes.find((node) => pattern.test((node as HTMLTableRowElement).innerText)) as HTMLTableRowElement | undefined
    return row?.dataset.m ?? ''
  }, pattern.source)
  expect(model, `옵션 원천 품목을 찾지 못함: ${pattern}`).not.toBe('')
  return model
}

function family(rows: Array<{ model: string; name: string; qty: number; amount: number }>, pattern: RegExp) {
  const matched = rows.filter((row) => pattern.test(row.name) || pattern.test(row.model))
  return { qty: matched.reduce((sum, row) => sum + row.qty, 0), amount: matched.reduce((sum, row) => sum + row.amount, 0), rows: matched.filter((row) => row.qty) }
}

test('R11 실 규칙 1건 — 옵션 6개 전후와 하드게이트', async ({ page }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, error instanceof Error ? error.message : 'QA 자격을 읽지 못했습니다.')
    return
  }
  await page.addInitScript((value) => { (window as any).__R11_QA_PASSWORD_PRESENT__ = Boolean(value) }, Boolean(password))
  await openHome(page)
  const source = page.locator(`input.qty-input[data-m="${SOURCE}"]:not(.fix-dc-inp)`)
  await source.fill('2')
  await source.blur()
  await page.waitForTimeout(400)
  console.log('[R11 source]', await page.locator(`tr[data-m="${SOURCE}"]`).innerText())

  const result: Record<string, unknown> = {}
  const capture = async (key: string) => {
    const rows = await snapshot(page)
    result[key] = {
      panel: family(rows, /판넬|패널|^PC/i),
      hose: family(rows, /유연\s*호스|^FH-LFH/i),
      branch: family(rows, /분\s*기\s*관|분기관|^AXJ-/i),
      foot: family(rows, /발통|일자발|^SI-AL/i),
      remote: family(rows, /리모컨|리모콘|^(?:AWR|AR-|AIM)/i),
    }
  }

  await capture('before')
  await page.locator('#home_no_hose').check()
  await page.waitForTimeout(300)
  await capture('noHose')
  await page.locator('#home_no_hose').uncheck()
  await page.locator('#home_hose_i').check()
  await page.waitForTimeout(300)
  await capture('hoseI')
  await page.locator('#home_hose_i').uncheck()
  const branchOutdoor = await findModel(page, /실외기.*단배관/i)
  await page.locator(`input.qty-input[data-m="${branchOutdoor}"]:not(.fix-dc-inp)`).fill('1')
  await page.locator(`input.qty-input[data-m="${branchOutdoor}"]:not(.fix-dc-inp)`).blur()
  await page.waitForTimeout(300)
  await page.locator('#home_no_branch').check()
  await page.waitForTimeout(300)
  await capture('noBranch')
  await page.locator('#home_no_branch').uncheck()
  await page.locator(`input.qty-input[data-m="${branchOutdoor}"]:not(.fix-dc-inp)`).fill('2')
  await page.locator(`input.qty-input[data-m="${branchOutdoor}"]:not(.fix-dc-inp)`).blur()
  await page.locator('#home_foot').check()
  await page.waitForTimeout(300)
  await capture('foot')
  await page.locator('#home_foot').uncheck()
  await page.locator('#home_panel').selectOption('판넬제외')
  await page.waitForTimeout(300)
  await capture('panelExcluded')
  await page.locator('#home_panel').selectOption('공청판넬')
  await page.waitForTimeout(300)
  await capture('panelAir')
  await page.locator('#home_panel').selectOption('')
  await page.locator('#home_remote').selectOption('제외')
  await page.waitForTimeout(300)
  await capture('remoteExcluded')

  const finalText = JSON.stringify(result)
  console.log('[R11 options]', finalText)
  expect(finalText).not.toContain(password)
  expect((result as any).noHose.hose.qty).toBe(0)
  expect((result as any).hoseI.hose.rows.some((row: any) => /I형|FH-LFHI/i.test(`${row.name} ${row.model}`))).toBeTruthy()
  expect((result as any).hoseI.hose.rows.some((row: any) => /L형|FH-LFHL/i.test(`${row.name} ${row.model}`))).toBeFalsy()
  expect((result as any).noBranch.branch.qty).toBe(0)
  expect((result as any).foot.foot.qty).toBeGreaterThan(0)
  expect((result as any).panelExcluded.panel.qty).toBe(0)
  expect((result as any).remoteExcluded.remote.qty).toBe(0)
  await page.locator('#homeOpts').screenshot({ path: path.join(SHOTS, '01-options-six-toggle-real.png') })
  console.log('[R11 hard-gate] unexpected=0')
  console.log('[R11 options]', JSON.stringify(result))
})
