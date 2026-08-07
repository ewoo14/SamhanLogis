import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/** PR #991 라이브 QA 보강 — 전환으로 발행된 전표의 화면 금액 표시 캡처. */
import { expect, test } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5931'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const SLIP_ID = process.env['SLIP_ID'] ?? ''
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/991-replay-gui'))
fs.mkdirSync(SHOTS, { recursive: true })

test('#991 발행된 전표 상세 — 화면 금액 표시', async ({ page }) => {
  const res = await page.request.post(`${API_BASE}/auth/login`, {
    data: { loginId: 'dev_manager', password: PASSWORD },
  })
  expect(res.ok()).toBeTruthy()
  const d = (await res.json()).data ?? {}
  await page.addInitScript(
    ({ tok, r, uid, name }: { tok: string; r: string; uid: string; name: string }) => {
      Object.defineProperty(window, 'samhanAuth', {
        configurable: true,
        value: {
          getToken: async () => ({ token: tok, userId: uid, role: r, fullName: name, partnerCode: null }),
          setToken: async () => undefined,
          clearToken: async () => undefined,
        },
      })
    },
    { tok: d.token ?? '', r: d.role ?? '', uid: d.userId ?? '', name: d.displayName ?? 'dev_manager' },
  )
  await page.goto(`${BASE_URL}/#/sales/${SLIP_ID}`)
  await page.waitForTimeout(6000)
  await page.screenshot({ path: path.join(SHOTS, '05-slip-detail-amounts.png'), fullPage: true })
})
