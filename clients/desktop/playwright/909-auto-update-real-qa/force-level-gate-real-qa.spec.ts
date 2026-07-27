import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #909 자동 업데이트 — forceLevel 이 실제 UI 를 차단하는가 (PM 직접 라이브QA)
 *
 * 🎯 단일 질문: **BE 가 CRITICAL 을 내릴 때 사용자가 실제로 앱을 못 쓰는가.**
 *    `desktopUpdatePolicy` 단위 테스트는 순수 함수만 본다. 그 값이 실제 화면 차단으로
 *    이어지는지는 실 게이트웨이 + 실 렌더러로만 확인된다.
 *
 * 🚨 throwaway DESKTOP 릴리스를 만들고 **반드시 정리**한다(공유 실 DB 무오염).
 *    `AppReleaseForceLevel` 에는 NONE 이 없고(CRITICAL/MAJOR/MINOR), 등록만으로는
 *    노출되지 않아 **publish 가 필요**하다 — PM 실측으로 확인한 계약이다.
 *
 * `*-real-qa.spec.ts` 규칙으로 mock CI 에서 제외된다.
 */
import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5196'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const SHOT_DIR = resolveQaShotsDir(join(process.cwd(), '..', '..', 'docs', 'qa', '909-auto-update-2026-07-23'))

test.use({ viewport: { width: 1400, height: 900 } })

test('자동 업데이트 — BE CRITICAL 이 실제로 앱을 차단하고 MINOR 는 차단하지 않는다', async ({ page }) => {
  mkdirSync(SHOT_DIR, { recursive: true })
  const shot = async (n: string) => { await page.screenshot({ path: join(SHOT_DIR, `${n}.png`), fullPage: true }) }

  const login = await page.request.post(`${API_BASE}/api/auth/login`, { data: { loginId: 'dev_master', password: PASSWORD } })
  expect(login.ok(), `실서버 로그인 실패: HTTP ${login.status()}`).toBeTruthy()
  const d = (await login.json()).data ?? {}
  const auth = { Authorization: `Bearer ${d.token}`, 'X-User-Id': d.userId, 'X-User-Role': d.role ?? 'MASTER' }
  const jsonAuth = { ...auth, 'Content-Type': 'application/json' }

  await page.addInitScript((v: { token: string; userId: string; role: string; fullName: string }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: { getToken: async () => ({ ...v, partnerCode: null }), setToken: async () => undefined, clearToken: async () => undefined },
    })
  }, { token: d.token ?? '', userId: d.userId ?? '', role: d.role ?? 'MASTER', fullName: d.displayName ?? '개발책임자' })

  const modal = page.getByTestId('app-version-blocking-modal')
  let releaseId = ''

  // 🚨 실제로 어떤 요청이 나가는지 관측한다 — clientType 이 DESKTOP 이 아니면
  //    등록한 DESKTOP 릴리스와 어긋나 차단이 안 걸리고, 그건 제품 결함이 아니라 하네스 결함이다.
  page.on('request', (req) => {
    if (req.url().includes('/app/version')) console.log(`▶ 요청 ${req.url()}`)
  })
  page.on('response', async (res) => {
    if (res.url().includes('/app/version')) {
      const t = await res.text().catch(() => '')
      console.log(`◀ 응답 ${res.status()} ${t.slice(0, 220)}`)
    }
  })
  page.on('console', (m) => {
    if (m.text().includes('app-version')) console.log(`▷ 콘솔 ${m.text().slice(0, 200)}`)
  })

  try {
    // ── 전제: 릴리스가 없으면 차단이 없다 (양성 대조 — 이후 차단이 우리가 만든 것임을 보장) ──
    await test.step('P0 릴리스 없음 → 차단 없음', async () => {
      await page.goto(`${BASE_URL}/#/`)
      await page.waitForTimeout(3000)
      await expect(modal, '릴리스가 없는데 차단 모달이 떠 있다 — 이후 시험이 무의미해진다').toHaveCount(0)
      await shot('P0-릴리스없음-차단없음')
    })

    // ── CRITICAL: 현재 버전(0.1.0)이 minSupported(9.9.0) 미만 → 등록값 무시하고 CRITICAL ──
    await test.step('P1 CRITICAL 등록 → 앱이 실제로 차단된다', async () => {
      const body = {
        clientType: 'DESKTOP', version: '2026/07/25-91011', forceLevel: 'CRITICAL',
        releaseNotes: 'PM 자동업데이트 라이브QA throwaway (자동 정리됨)',
        releasedAt: '2026-07-23T00:00:00', minSupportedVersion: '0.1.0',
      }
      const created = await page.request.post(`${API_BASE}/app/releases`, { headers: jsonAuth, data: body })
      expect(created.status(), `릴리스 등록 실패 HTTP ${created.status()}`).toBeLessThan(400)
      releaseId = String((await created.json()).data?.id ?? '')
      expect(releaseId, '릴리스 id 를 받지 못했다').not.toBe('')

      // 🔑 findByClientTypeAndPublishedTrue — publish 해야 /app/version 에 노출된다
      const published = await page.request.post(`${API_BASE}/app/releases/${releaseId}/publish`, { headers: auth })
      expect(published.status(), `publish 실패 HTTP ${published.status()}`).toBeLessThan(400)

      // 서버가 실제로 CRITICAL 을 내리는지 먼저 확인 (화면 단언이 공허해지지 않게)
      const v = await page.request.get(`${API_BASE}/app/version?clientType=DESKTOP&currentVersion=0.0.0`, { headers: auth })
      const vb = await v.json()
      console.log(`■ 서버 응답 forceLevel=${vb.data?.forceLevel} latestVersion=${vb.data?.latestVersion}`)
      expect(vb.data?.forceLevel, '서버가 CRITICAL 을 내리지 않아 UI 차단 시험이 성립하지 않는다').toBe('CRITICAL')

      // 🚨 같은 해시 URL 로 goto 하면 same-document navigation 이라 재로드가 안 된다.
      //    게이트의 checkedRef 가 살아 있어 버전 재확인이 아예 일어나지 않는다(PM 실측).
      await page.reload()
      await expect(modal, 'BE 가 CRITICAL 인데 앱이 차단되지 않는다 — forceLevel 이 강제되지 않는다')
        .toBeVisible({ timeout: 20000 })
      await expect(modal).toContainText('2026/07/25-91011')
      console.log(`■ 차단 모달 본문 = ${(await modal.innerText()).replace(/\s+/g, ' ').slice(0, 200)}`)
      await shot('P1-CRITICAL-차단모달')
    })

    await test.step('P2 차단은 닫을 수 없다', async () => {
      await page.keyboard.press('Escape')
      await expect(modal, 'Escape 로 차단이 풀린다 — 차단이 실제 차단이 아니다').toBeVisible()
      // 배경 클릭으로도 안 닫힌다
      await page.mouse.click(5, 5)
      await expect(modal, '배경 클릭으로 차단이 풀린다').toBeVisible()
      await shot('P2-Escape-배경클릭-후에도-차단유지')
    })

    // ── MINOR: 현재 버전이 minSupported 이상이면 등록값(MINOR)이 적용되고 차단하지 않는다 ──
    await test.step('P3 MINOR 로 낮추면 차단하지 않는다', async () => {
      const upd = await page.request.put(`${API_BASE}/app/releases/${releaseId}`, {
        headers: jsonAuth,
        data: {
          clientType: 'DESKTOP', version: '2026/07/25-91011', forceLevel: 'MINOR',
          releaseNotes: 'PM 자동업데이트 라이브QA throwaway (자동 정리됨)',
          releasedAt: '2026-07-23T00:00:00', minSupportedVersion: '0.0.0',
        },
      })
      expect(upd.status(), `릴리스 수정 실패 HTTP ${upd.status()}`).toBeLessThan(400)

      const v = await page.request.get(`${API_BASE}/app/version?clientType=DESKTOP&currentVersion=0.0.0`, { headers: auth })
      const lvl = (await v.json()).data?.forceLevel
      console.log(`■ minSupported=0.0.0 로 낮춘 뒤 forceLevel=${lvl}`)
      expect(lvl, '등록값 MINOR 가 반영되지 않아 비차단 시험이 성립하지 않는다').toBe('MINOR')

      await page.reload()
      await page.waitForTimeout(3000)
      await expect(modal, 'MINOR 인데 앱이 차단된다 — 강제 수준이 구분되지 않는다').toHaveCount(0)
      await shot('P3-MINOR-차단없음')
    })
  } finally {
    // 🚨 정리 — 공유 실 DB 에 throwaway 를 남기지 않는다
    if (releaseId) {
      const del = await page.request.delete(`${API_BASE}/app/releases/${releaseId}`, { headers: auth })
      console.log(`■ throwaway 정리 HTTP ${del.status()}`)
      const after = await page.request.get(`${API_BASE}/app/version?clientType=DESKTOP&currentVersion=0.0.0`, { headers: auth })
      console.log(`■ 정리 후 /app/version HTTP ${after.status()} (404 이면 잔재 없음)`)
    }
  }
})
