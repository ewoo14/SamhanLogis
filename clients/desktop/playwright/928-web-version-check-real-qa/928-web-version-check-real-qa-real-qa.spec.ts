import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
import { CURRENT_VERSION } from './current-version'

const specDir = path.dirname(fileURLToPath(import.meta.url))
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
// CURRENT_VERSION은 ./current-version에서 import — order-app 빌드에 주입되는 버전(playwright.config.ts)과
// 반드시 같은 값이어야 하므로(R3-1 fix) 이 스펙 안에서 별도 리터럴로 다시 선언하지 않는다.
const THROWAWAY_VERSION = '2026/07/26-92801'
const CLIENT_TYPE = 'SAMHAN_ORDER_WEB'
const SHOTS = resolveQaShotsDir(path.resolve(specDir, '../../../../docs/qa/928-web-version-check'))

type ApiEnvelope<T> = { data: T }
type Release = { id: string; clientType: string; version: string; isPublished: boolean }
type Login = { token: string }

async function login(request: APIRequestContext): Promise<Login> {
  const response = await request.post(`${API_BASE}/auth/login`, {
    data: { loginId: 'dev_master', password: PASSWORD },
  })
  expect(response.ok(), `dev_master 로그인 실패: HTTP ${response.status()}`).toBeTruthy()
  const body = (await response.json()) as ApiEnvelope<Login>
  expect(body.data.token, '로그인 토큰이 비어 있습니다.').toBeTruthy()
  return body.data
}

async function listReleases(request: APIRequestContext, token: string): Promise<Release[]> {
  const response = await request.get(`${API_BASE}/app/releases?clientType=${CLIENT_TYPE}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(response.ok(), `릴리스 목록 조회 실패: HTTP ${response.status()}`).toBeTruthy()
  const body = (await response.json()) as ApiEnvelope<Release[]>
  return body.data
}

async function readVersion(request: APIRequestContext, clientType: string): Promise<Record<string, unknown>> {
  const response = await request.get(
    `${API_BASE}/app/version?clientType=${clientType}&currentVersion=${encodeURIComponent(CURRENT_VERSION)}`,
  )
  if (response.status() === 404) return { http: 404 }
  expect(response.ok(), `${clientType} 버전 조회 실패: HTTP ${response.status()}`).toBeTruthy()
  const body = (await response.json()) as ApiEnvelope<Record<string, unknown>>
  return { http: response.status(), ...body.data }
}

async function capture(page: Page, name: string): Promise<void> {
  const file = path.join(SHOTS, `${name}.png`)
  await page.screenshot({ path: file, fullPage: true })
  console.log(`[캡처] ${file}`)
}

test('주문 웹 릴리스 등록 → 주문 웹 안내 도달, 타 웹앱 판정 불변, throwaway 정리', async ({ page, request }) => {
  const { token } = await login(request)
  const headers = { Authorization: `Bearer ${token}` }
  const before = await listReleases(request, token)
  let releaseId = ''

  try {
    const createResponse = await request.post(`${API_BASE}/app/releases`, {
      headers,
      data: {
        clientType: CLIENT_TYPE,
        version: THROWAWAY_VERSION,
        forceLevel: 'MINOR',
        releaseNotes: 'QA #928 throwaway 주문 웹 버전 안내 확인',
        releasedAt: '2026-07-26T00:00:00',
        minSupportedVersion: CURRENT_VERSION,
      },
    })
    expect(createResponse.ok(), `throwaway 릴리스 등록 실패: HTTP ${createResponse.status()}`).toBeTruthy()
    const created = (await createResponse.json()) as ApiEnvelope<Release>
    releaseId = created.data.id
    expect(releaseId).toBeTruthy()

    const publishResponse = await request.post(`${API_BASE}/app/releases/${releaseId}/publish`, { headers })
    expect(publishResponse.ok(), `throwaway 릴리스 배포 실패: HTTP ${publishResponse.status()}`).toBeTruthy()

    const orderVersion = await readVersion(request, CLIENT_TYPE)
    const estimateVersion = await readVersion(request, 'SAMHAN_ESTIMATE_WEB')
    const mobileVersion = await readVersion(request, 'SAMHAN_MOBILE_PUBLIC_WEB')
    console.log(`[오폭] 등록 전 SAMHAN_ORDER_WEB 행 수=${before.length}`)
    console.log(`[오폭] 등록 후 판정=${JSON.stringify({ order: orderVersion, estimate: estimateVersion, mobile: mobileVersion })}`)
    expect(orderVersion).toMatchObject({ http: 200, latestVersion: THROWAWAY_VERSION, forceLevel: 'MINOR' })
    expect(estimateVersion).toEqual({ http: 404 })
    expect(mobileVersion).toEqual({ http: 404 })

    await page.goto('/')
    const notice = page.getByTestId('web-version-notice')
    await expect(notice, '주문 웹에서 버전 안내가 실제로 표시되지 않았습니다.').toBeVisible({ timeout: 15000 })
    await expect(notice).toContainText(THROWAWAY_VERSION)
    const urlBeforeWait = page.url()
    await page.waitForTimeout(1000)
    expect(page.url(), '릴리스 안내만으로 자동 새로고침하면 안 됩니다.').toBe(urlBeforeWait)
    console.log(`[도달] 안내 문구=${(await notice.innerText()).replace(/\s+/g, ' ').trim()}`)
    console.log(`[M2 라이브 조사] 작성 폼 DOM 수=${await page.locator('#cardHome, #cardSingle, #cardComm, #cardOld, #pageOrderInfo').count()}`)
    await capture(page, '01-order-version-notice')
  } finally {
    if (releaseId) {
      const deleteResponse = await request.delete(`${API_BASE}/app/releases/${releaseId}`, { headers })
      expect(deleteResponse.ok(), `throwaway 릴리스 soft-delete 실패: HTTP ${deleteResponse.status()}`).toBeTruthy()
    }
    const after = await listReleases(request, token)
    console.log(`[정리] SAMHAN_ORDER_WEB 행 수 before=${before.length}, after=${after.length}`)
    expect(after.length, 'throwaway soft-delete 후 활성 릴리스 행 수가 복원되어야 합니다.').toBe(before.length)
  }
})
