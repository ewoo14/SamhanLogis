import { expect, test, type Page } from '@playwright/test'

declare const HOME_QUANTITY_SYNC_RULES: any
declare const HOMEMULTI: any[]
declare const REMOTE_360_DEFAULT: any
declare const REMOTE_WIRELESS: any
declare const REMOTE_WIRED_KIT: any
declare const REMOTE_COLOR_AIRCOMBO: any
declare const homeQty: Map<string, number>
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const BASE = process.env['QA_ESTIMATE_BASE'] ?? 'http://127.0.0.1:5401'
const SHOTS = resolveQaShotsDir(path.resolve(dirname, '../../../../docs/qa/2026-08-09-896-derived-check'))

const SOURCE = 'AM052BN6PBH1' // 실내기 360CST WIFI내장 13평형 (서버 규칙 source)
const OUTDOOR = 'AJ030MXHNBC1' // 실외기_3HP 단배관

const WATCH: Array<[string, string]> = [
  ['실내기(소스) 360CST WIFI 13평', SOURCE],
  ['판넬 360CST 사각 WIFI [서버 target]', 'PC6NUDK1NW'],
  ['유연호스 L형 4WAY [서버 target]', 'FH-LFHLN'],
  ['유연호스 L형 1WAY', 'FH-LFHLF'],
  ['유연호스 I형', 'FH-LFHIF'],
  ['분기관 Y형 2512', 'AXJ-YA2512N'],
  ['분기관 Y형 1509', 'AXJ-YA1509N'],
  ['발통 원형발통세트', '발통세트'],
  ['발통 실외기 일자발', 'SI-AL600A'],
  ['리모컨 무선(냉방전용)', 'AR-EC05'],
  ['리모컨 무선(360cst)', 'AR-KH05'],
  ['리모컨 유선(통합) [서버 target]', 'AWR-WE13N'],
  ['리모컨 유선(컬러)', 'AWR-WG00N'],
  ['실외기 3HP 단배관', OUTDOOR],
]

type Cell = { label: string; model: string; qty: string; amount: string; present: boolean }

async function openHome(page: Page) {
  await page.goto(`${BASE}/?email=dev_master%40samhan-air.com`, { waitUntil: 'domcontentloaded' })
  await page.locator('#btnGoHome').click()
  await expect(qty(page, SOURCE)).toBeVisible({ timeout: 60_000 })
}

function qty(page: Page, model: string) {
  return page.locator(`input.qty-input[data-m="${model}"]:not(.fix-dc-inp)`)
}

async function readRow(page: Page, label: string, model: string): Promise<Cell> {
  const row = page.locator(`tr[data-m="${model}"]`)
  const present = (await row.count()) > 0
  if (!present) return { label, model, qty: '(행 없음)', amount: '(행 없음)', present }
  const input = qty(page, model)
  const value = (await input.count()) > 0 ? ((await input.first().inputValue()) || '0') : '(입력 없음)'
  const sub = page.locator(`td.sub[data-sub="${model}"]`)
  const amount = (await sub.count()) > 0 ? (await sub.first().innerText()).trim() : '(금액칸 없음)'
  return { label, model, qty: value, amount, present }
}

async function snapshot(page: Page, title: string): Promise<Cell[]> {
  const cells: Cell[] = []
  for (const [label, model] of WATCH) cells.push(await readRow(page, label, model))
  console.log(`\n===== ${title} =====`)
  console.log('| 품목 | 모델 | 수량 | 금액 |')
  console.log('|---|---|---|---|')
  for (const c of cells) console.log(`| ${c.label} | ${c.model} | ${c.qty} | ${c.amount} |`)
  return cells
}

async function setQty(page: Page, model: string, value: string) {
  const input = qty(page, model).first()
  await input.scrollIntoViewIfNeeded()
  await input.fill(value)
  await input.blur()
  await page.waitForTimeout(600)
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false })
}

async function shotRows(page: Page, name: string) {
  const models = ['PC6NUDK1NW', 'FH-LFHLN', 'AXJ-YA1509N', '발통세트', 'AWR-WE13N']
  for (const m of models) {
    const row = page.locator(`tr[data-m="${m}"]`)
    if ((await row.count()) === 0) continue
    await row.first().scrollIntoViewIfNeeded()
    await row.first().screenshot({ path: path.join(SHOTS, `${name}-row-${m}.png`) }).catch(() => {})
  }
}

test.describe.serial('#896 파생수량 실화면 검증', () => {
  test('E0 서버 규칙이 페이지에 실려 있는지 확인한다', async ({ page }) => {
    await openHome(page)
    const payload = await page.evaluate(() => {
      const w = window as any
      // const 선언이라 window 프로퍼티가 아니다 — 전역 렉시컬 스코프에서 직접 참조한다.
      let rules: any = null
      try {
        rules = HOME_QUANTITY_SYNC_RULES
      } catch (error) {
        rules = { readError: String(error) }
      }
      return {
        ruleCount: Array.isArray(rules) ? rules.length : -1,
        rules,
        evaluator: typeof (w.SamhanQuantitySync && w.SamhanQuantitySync.evaluateQuantitySyncRules),
        serverPathReturns: typeof w.applyServerHomeQuantitySync_ === 'function' ? w.applyServerHomeQuantitySync_() : 'fn-missing',
      }
    })
    console.log(`[E0] rules=${JSON.stringify(payload.rules)}`)
    console.log(`[E0] ruleCount=${payload.ruleCount} evaluator=${payload.evaluator} applyServerHomeQuantitySync_()=${payload.serverPathReturns}`)
    await shot(page, 'e0-home-open')
    expect(payload.ruleCount).toBeGreaterThan(0)
  })

  test('E1 실내기 0→2→4 파생 반영', async ({ page }) => {
    await openHome(page)
    const before = await snapshot(page, 'E1-0 실내기 0 (초기)')
    await shot(page, 'e1-0-indoor-0')

    await setQty(page, SOURCE, '2')
    const at2 = await snapshot(page, 'E1-1 실내기 = 2')
    await shot(page, 'e1-1-indoor-2')
    await shotRows(page, 'e1-1-indoor-2')

    await setQty(page, SOURCE, '4')
    const at4 = await snapshot(page, 'E1-2 실내기 = 4')
    await shot(page, 'e1-2-indoor-4')
    await shotRows(page, 'e1-2-indoor-4')

    console.log(`[E1] json=${JSON.stringify({ before, at2, at4 })}`)
    expect(at2.length).toBe(WATCH.length)
  })

  test('E2 실외기까지 넣어 분기관·발통 발화조건을 만든다', async ({ page }) => {
    await openHome(page)
    await setQty(page, SOURCE, '4')
    await setQty(page, OUTDOOR, '1')
    const footBox = page.locator('#home_foot')
    const footBefore = await footBox.isChecked()
    if (!footBefore) await footBox.check()
    await page.waitForTimeout(600)
    const branchBox = page.locator('#home_no_branch')
    const branchExcluded = await branchBox.isChecked()
    console.log(`[E2] 발통포함(체크전)=${footBefore} 발통포함(현재)=${await footBox.isChecked()} 분기관제외=${branchExcluded}`)
    if (branchExcluded) {
      await branchBox.uncheck()
      await page.waitForTimeout(600)
    }
    const cells = await snapshot(page, 'E2 실내기 4 + 실외기 3HP 단배관 1 + 발통포함 ON + 분기관제외 OFF')
    await shot(page, 'e2-outdoor-foot')
    await shotRows(page, 'e2-outdoor-foot')
    console.log(`[E2] json=${JSON.stringify(cells)}`)

    // 대조군: 서버 규칙 평가기를 무력화(legacy fallback)하고 같은 상태를 재계산
    await page.evaluate(() => {
      ;(window as any).SamhanQuantitySync.evaluateQuantitySyncRules = () => null
      ;(window as any).recomputeHomeDerived(true)
    })
    await page.waitForTimeout(600)
    const legacy = await snapshot(page, 'E2-대조군 동일 상태 · 서버 규칙 평가기 무력화(legacy 경로)')
    await shot(page, 'e2-legacy-fallback')
    await shotRows(page, 'e2-legacy-fallback')
    console.log(`[E2-legacy] json=${JSON.stringify(legacy)}`)
  })

  test('E3 유연호스 옵션 토글이 반영되는지 확인한다', async ({ page }) => {
    await openHome(page)
    await setQty(page, SOURCE, '4')
    const base = await snapshot(page, 'E3-0 실내기 4 · 옵션 기본')
    await shot(page, 'e3-0-hose-default')

    await page.locator('#home_no_hose').check()
    await page.waitForTimeout(600)
    const noHose = await snapshot(page, 'E3-1 유연호스 제외 ON')
    await shot(page, 'e3-1-no-hose-on')
    await shotRows(page, 'e3-1-no-hose-on')

    await page.locator('#home_no_hose').uncheck()
    await page.waitForTimeout(600)
    const backHose = await snapshot(page, 'E3-2 유연호스 제외 OFF (원복)')
    await shot(page, 'e3-2-no-hose-off')

    await page.locator('#home_hose_i').check()
    await page.waitForTimeout(600)
    const iHose = await snapshot(page, 'E3-3 유연호스 I형 ON')
    await shot(page, 'e3-3-hose-i-on')
    await shotRows(page, 'e3-3-hose-i-on')

    console.log(`[E3] json=${JSON.stringify({ base, noHose, backHose, iHose })}`)
  })

  test('E4 다른 실내기(서버 규칙 밖) 수량 변경 시 판넬·호스', async ({ page }) => {
    await openHome(page)
    const others = await page.evaluate(() => {
      const rows = HOMEMULTI as Array<any>
      return rows
        .filter(r => /실내기|벽걸이/i.test(String(r?.name || '')) && !/분기관/i.test(String(r?.name || '')))
        .map(r => ({ model: r.model, name: r.name }))
        .slice(0, 12)
    })
    console.log(`[E4] 실내기 후보=${JSON.stringify(others)}`)
    const target = others.find(o => o.model !== SOURCE && /4\s*-?\s*way|4way/i.test(o.name))
      ?? others.find(o => o.model !== SOURCE)
    expect(target).toBeTruthy()
    console.log(`[E4] 대상 실내기 = ${target!.model} / ${target!.name}`)
    await setQty(page, target!.model, '3')
    const cells = await snapshot(page, `E4 서버 규칙 밖 실내기 ${target!.model} = 3`)
    await shot(page, 'e4-other-indoor')
    await shotRows(page, 'e4-other-indoor')
    const extra = await readRow(page, '대상 실내기', target!.model)
    console.log(`[E4] json=${JSON.stringify({ target, extra, cells })}`)
  })

  test('E5 대조군: 화면을 열자마자 서버 규칙을 끄고 0→2→4 (legacy 전용 경로)', async ({ page }) => {
    await openHome(page)
    await page.evaluate(() => {
      ;(window as any).SamhanQuantitySync.evaluateQuantitySyncRules = () => null
    })
    await setQty(page, SOURCE, '2')
    const at2 = await snapshot(page, 'E5-1 [legacy 전용] 실내기 = 2')
    await shot(page, 'e5-1-legacy-indoor-2')
    await shotRows(page, 'e5-1-legacy-indoor-2')

    await setQty(page, SOURCE, '4')
    const at4 = await snapshot(page, 'E5-2 [legacy 전용] 실내기 = 4')
    await shot(page, 'e5-2-legacy-indoor-4')
    await shotRows(page, 'e5-2-legacy-indoor-4')

    await page.locator('#home_no_hose').check()
    await page.waitForTimeout(600)
    const noHose = await snapshot(page, 'E5-3 [legacy 전용] 유연호스 제외 ON')
    await shot(page, 'e5-3-legacy-no-hose-on')

    await page.locator('#home_no_hose').uncheck()
    await page.locator('#home_hose_i').check()
    await page.waitForTimeout(600)
    const iHose = await snapshot(page, 'E5-4 [legacy 전용] 유연호스 I형 ON')
    await shot(page, 'e5-4-legacy-hose-i-on')
    await shotRows(page, 'e5-4-legacy-hose-i-on')

    console.log(`[E5] json=${JSON.stringify({ at2, at4, noHose, iHose })}`)
  })

  test('E6 리모컨 수량 2배 진단 — 상수와 카운트 원문', async ({ page }) => {
    await openHome(page)
    await setQty(page, SOURCE, '4')
    const diag = await page.evaluate(() => {
      const counts = { cntC: 0, cntI: 0, cntW: 0, cntWall: 0, cntCombo: 0 }
      const matched360: string[] = []
      HOMEMULTI.forEach((r: any) => {
        const q = homeQty.get(r.model) || 0
        if (!q) return
        const nm = String(r?.name || '')
        if (/실내기.*360\s*CST|360CST/i.test(nm)) { counts.cntC += q; matched360.push(`${r.model}(${nm})=${q}`) }
        if (/실내기.*인피니트/i.test(nm)) counts.cntI += q
        if (/실내기/i.test(nm) && /(1\s*-?\s*way|4\s*-?\s*way)/i.test(nm) && !/벽걸이/i.test(nm) && !/인피니트|360/i.test(nm)) counts.cntW += q
        if (/벽걸이/i.test(nm)) counts.cntWall += q
      })
      return {
        REMOTE_360_DEFAULT, REMOTE_WIRELESS, REMOTE_WIRED_KIT, REMOTE_COLOR_AIRCOMBO,
        counts, matched360,
        qty_AR_EC05: homeQty.get('AR-EC05') || 0,
        qty_AR_KH05: homeQty.get('AR-KH05') || 0,
        qty_PC6NUDK1NW: homeQty.get('PC6NUDK1NW') || 0,
        qty_indoor: homeQty.get('AM052BN6PBH1') || 0,
      }
    })
    console.log(`[E6] diag=${JSON.stringify(diag)}`)
    await shot(page, 'e6-remote-diag')
  })

  test('E7 서버 규칙 밖 실내기 — 서버 경로가 실제로 탔는지 계측', async ({ page }) => {
    await openHome(page)
    await page.evaluate(() => {
      const w = window as any
      w.__calls = []
      const original = w.applyServerHomeQuantitySync_
      w.applyServerHomeQuantitySync_ = function () {
        const result = original.apply(this, arguments as any)
        w.__calls.push(result)
        return result
      }
    })
    const OTHER = 'AJ012BN1PBC2' // 실내기(1-Way) 무풍 소형 WIFI 내장 3평형 (서버 규칙 밖)
    const PANEL_1W = 'PC1MWSK3NW' // 판넬 1way 무풍소형 WIFI 내장
    await setQty(page, OTHER, '3')
    const probe = await page.evaluate(() => {
      const w = window as any
      return {
        serverPathReturns: w.__calls,
        qty: {
          OTHER: homeQty.get('AJ012BN1PBC2') || 0,
          PANEL_1W: homeQty.get('PC1MWSK3NW') || 0,
          HOSE_L_1W: homeQty.get('FH-LFHLF') || 0,
          HOSE_L_4W: homeQty.get('FH-LFHLN') || 0,
          AR_EC05: homeQty.get('AR-EC05') || 0,
        },
      }
    })
    console.log(`[E7] probe=${JSON.stringify(probe)}`)
    const rows = await Promise.all([
      readRow(page, '실내기 1way 소형', OTHER),
      readRow(page, '판넬 1way 무풍소형 WIFI', PANEL_1W),
      readRow(page, '유연호스 L형 1WAY', 'FH-LFHLF'),
      readRow(page, '유연호스 L형 4WAY [서버 target]', 'FH-LFHLN'),
      readRow(page, '판넬 360 [서버 target]', 'PC6NUDK1NW'),
    ])
    console.log('\n===== E7 서버 규칙 밖 실내기 AJ012BN1PBC2 = 3 (화면 실측) =====')
    console.log('| 품목 | 모델 | 수량 | 금액 |')
    console.log('|---|---|---|---|')
    for (const r of rows) console.log(`| ${r.label} | ${r.model} | ${r.qty} | ${r.amount} |`)
    await shot(page, 'e7-other-indoor-instrumented')
    for (const m of [OTHER, PANEL_1W, 'FH-LFHLF']) {
      const row = page.locator(`tr[data-m="${m}"]`)
      if ((await row.count()) === 0) continue
      await row.first().scrollIntoViewIfNeeded()
      await row.first().screenshot({ path: path.join(SHOTS, `e7-row-${m}.png`) }).catch(() => {})
    }
  })

  test('E8 applyServerHomeQuantitySync_ 반환값 원문 계측', async ({ page }) => {
    await openHome(page)
    const probe = await page.evaluate(() => {
      const w = window as any
      const call = () => {
        const r = w.applyServerHomeQuantitySync_()
        return { type: typeof r, str: String(r), isTrue: r === true, isFalse: r === false }
      }
      const evalNow = () => {
        const m = w.SamhanQuantitySync.evaluateQuantitySyncRules(HOME_QUANTITY_SYNC_RULES, HOMEMULTI, homeQty)
        return { isMap: m instanceof Map, entries: m instanceof Map ? Array.from(m.entries()) : m }
      }
      const before = { call: call(), evaluated: evalNow(), indoor: homeQty.get('AM052BN6PBH1') || 0 }
      homeQty.set('AM052BN6PBH1', 2)
      const after = { call: call(), evaluated: evalNow(), indoor: homeQty.get('AM052BN6PBH1') || 0 }
      homeQty.set('AM052BN6PBH1', 0)
      homeQty.set('AJ012BN1PBC2', 3)
      const other = { call: call(), evaluated: evalNow() }
      const src = String(w.applyServerHomeQuantitySync_)
      return { before, after, other, srcHead: src.slice(0, 400), srcTail: src.slice(-400), srcLen: src.length }
    })
    console.log(`[E8] before=${JSON.stringify(probe.before)}`)
    console.log(`[E8] after(indoor=2)=${JSON.stringify(probe.after)}`)
    console.log(`[E8] other(1way=3)=${JSON.stringify(probe.other)}`)
    console.log(`[E8] srcLen=${probe.srcLen}`)
    console.log(`[E8] srcTail=${probe.srcTail}`)
  })

  test('E9 같은 버전 A/B — 유연호스 제외가 서버 target에만 안 먹는지', async ({ page }) => {
    // A: 서버 규칙 살아 있는 상태
    await openHome(page)
    await setQty(page, SOURCE, '4')
    await page.locator('#home_no_hose').check()
    await page.waitForTimeout(600)
    const withRules = await readRow(page, '유연호스 L형 4WAY [서버 target]', 'FH-LFHLN')
    await shot(page, 'e9-a-no-hose-with-rules')
    // B: 같은 페이지에서 평가기만 무력화하고 재계산
    await page.evaluate(() => {
      ;(window as any).SamhanQuantitySync.evaluateQuantitySyncRules = () => null
      ;(window as any).recomputeHomeDerived(true)
    })
    await page.waitForTimeout(600)
    const withoutRules = await readRow(page, '유연호스 L형 4WAY [서버 target]', 'FH-LFHLN')
    await shot(page, 'e9-b-no-hose-without-rules')
    console.log(`[E9] 유연호스제외 ON · 실내기4 → 규칙있음=${JSON.stringify(withRules)} / 규칙없음=${JSON.stringify(withoutRules)}`)
  })

  test('E10 1WAY 실내기에서 유연호스 I형·제외 옵션', async ({ page }) => {
    await openHome(page)
    const ONE_WAY = 'AJ012BN1PBC2'
    await setQty(page, ONE_WAY, '3')
    const base = [await readRow(page, 'L형 1WAY', 'FH-LFHLF'), await readRow(page, 'I형', 'FH-LFHIF')]
    await page.locator('#home_hose_i').check()
    await page.waitForTimeout(600)
    const iOn = [await readRow(page, 'L형 1WAY', 'FH-LFHLF'), await readRow(page, 'I형', 'FH-LFHIF')]
    await shot(page, 'e10-1way-hose-i-on')
    await page.locator('#home_hose_i').uncheck()
    await page.locator('#home_no_hose').check()
    await page.waitForTimeout(600)
    const noHose = [await readRow(page, 'L형 1WAY', 'FH-LFHLF'), await readRow(page, 'I형', 'FH-LFHIF')]
    await shot(page, 'e10-1way-no-hose-on')
    console.log(`[E10] 1WAY 실내기 3대 → 기본=${JSON.stringify(base)} / I형ON=${JSON.stringify(iOn)} / 제외ON=${JSON.stringify(noHose)}`)
  })
})
