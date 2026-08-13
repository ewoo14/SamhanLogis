import { expect, test, type Page } from '@playwright/test'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const BASE = process.env['QA_ESTIMATE_RULE_ONE_BASE'] ?? 'http://127.0.0.1:5320'
const SHOTS = resolveQaShotsDir(path.resolve(HERE, '../../../../docs/qa/2026-08-10-896-r12'))
const SOURCE = 'AM052BN6PBH1'

async function openHome(page: Page) {
  await page.goto(`${BASE}/?email=dev_master%40samhan-air.com`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await page.locator('#btnGoHome').click()
  await expect(page.locator(`input.qty-input[data-m="${SOURCE}"]:not(.fix-dc-inp)`)).toBeVisible({ timeout: 60_000 })
}

async function setSource(page: Page, quantity: number) {
  const input = page.locator(`input.qty-input[data-m="${SOURCE}"]:not(.fix-dc-inp)`)
  await input.fill(String(quantity))
  await input.blur()
  await page.waitForTimeout(400)
}

async function snapshot(page: Page) {
  return page.locator('tr[data-m]').evaluateAll((nodes) => nodes.map((node) => {
    const row = node as HTMLTableRowElement
    const input = row.querySelector<HTMLInputElement>('input.qty-input:not(.fix-dc-inp)')
    return { model: row.dataset.m ?? '', qty: Number(input?.value || 0), name: row.innerText.trim() }
  }).filter((row) => row.qty > 0 && /판넬|패널|호스|리모컨|발통|분기관/i.test(row.name)))
}

test('R12 같은 화면 0→2→4와 0→4의 파생 수량이 같다', async ({ page }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, error instanceof Error ? error.message : 'QA 자격을 읽지 못했습니다.')
    return
  }
  await page.addInitScript((value) => { (window as any).__R12_QA_PASSWORD_PRESENT__ = Boolean(value) }, Boolean(password))
  await openHome(page)
  await setSource(page, 0)
  await setSource(page, 2)
  const at2 = await snapshot(page)
  await setSource(page, 4)
  const at4After2 = await snapshot(page)

  await setSource(page, 0)
  await setSource(page, 4)
  const at4Direct = await snapshot(page)
  console.log('[R12 accumulation]', JSON.stringify({ at2, at4After2, at4Direct }))
  expect(at2.find((row) => row.model === 'AR-EC05')?.qty).toBe(2)
  expect(at4After2).toEqual(at4Direct)
  await page.locator('#homeOpts').screenshot({ path: path.join(SHOTS, '01-0-2-4-vs-0-4.png') })
  console.log('[R12 hard-gate] unexpected=0')
})
