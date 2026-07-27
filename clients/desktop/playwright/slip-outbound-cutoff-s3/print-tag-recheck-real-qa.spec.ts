import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * 출고전표 인쇄 배송태그 재배치 재검증 (개발책임자 2026-06-25 Option A).
 * - 배송주소 앞 배송태그 강조([지방] 굵게/크게 칩)
 * - 특이사항에서 [지방] 접두 제거
 * 실 게이트웨이:8080 JWT + mock OFF.
 *   REAL_JWT, SLIP_ID 환경변수 필요.
 */
import { test } from '@playwright/test'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE_URL = 'http://127.0.0.1:5175'
const TOKEN = process.env['REAL_JWT'] ?? ''
const SLIP_ID = process.env['SLIP_ID'] ?? ''
const MASTER_USER_ID = 'a0000000-0000-0000-0000-000000000001'
const _dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/slip-outbound-cutoff-s3'))

test('인쇄 배송태그 강조 + 특이사항 [지방] 제거', async ({ page }) => {
  test.skip(!TOKEN || !SLIP_ID, 'REAL_JWT/SLIP_ID 환경변수 필요')
  await page.addInitScript(`
    (function() {
      const _auth = { token: '${TOKEN}', userId: '${MASTER_USER_ID}', role: 'MASTER', fullName: '[DEV-SEED] 개발마스터', partnerCode: null };
      Object.defineProperty(window, 'samhanAuth', {
        configurable: true,
        value: { getToken: async () => _auth, setToken: async () => undefined, clearToken: async () => undefined },
      });
    })();
  `)
  await page.goto(`${BASE_URL}/#/sales/${SLIP_ID}/print/dispatch`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)
  await page.screenshot({ path: path.join(OUT, 'C2-print-tag-emphasized.png'), fullPage: false })
  // eslint-disable-next-line no-console
  console.log('[CAPTURE] C2-print-tag-emphasized.png')
})
