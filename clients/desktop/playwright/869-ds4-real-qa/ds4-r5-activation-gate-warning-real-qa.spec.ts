import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #908 DS-4 — R5 라이브 실측 QA (SONNET5 라운드 fix, H10)
 *
 * 회귀: 「편집 시작」이 사용 중 양식을 먼저 내리고(그 순간부터 전사가 기본 양식을 인쇄), 그 뒤
 * 품목행/이미지·로고 를 넣으면 저장은 성공하는데 활성화만 BE 게이트(422)로 막힌다. 팔레트는 아무
 * 경고 없이 두 요소를 노출하고, 편집기 안내문은 "편집을 마쳤다면 목록에서 다시 사용 설정할 수
 * 있습니다"라고 무조건 말해 요소를 넣는 순간 거짓이 된다.
 *
 * fix: ①팔레트가 품목행/이미지·로고 버튼에 "(활성화 제한)" 배지를 상시 노출(추가하기 *전에* 알 수
 * 있다) ②편집기 안내문이 현재 draft 내용에 따라 조건부로 바뀐다(막힌 상태면 이유+대응을, 아니면
 * 기존 재확인을 보여준다) ③「편집 시작」박스에 forward-warning 문장 추가.
 *
 * 🚨🚨 라이브QA 인프라 한계(정직 보고) — 이 세션 시점의 groupware-service 컨테이너 이미지가
 * DETAIL/IMAGE 지원 커밋보다 먼저 빌드됐다:
 *   docker image Created = 2026-07-22T07:48:34Z(UTC)
 *   b688addad(DETAIL/IMAGE 추가)      = 2026-07-23 04:01 KST
 *   b7f3fccc5(활성화 게이트 추가)      = 2026-07-23 05:45 KST
 * 재현: DETAIL만/IMAGE만 담은 최소 payload를 curl 로 직접 POST 하면 둘 다 BE 가 400
 * `INVALID_INPUT "문서 요소가 유효하지 않습니다"` 로 거부한다(활성화 게이트의 422 가 아니라 그
 * *이전* schema whitelist 단계에서 막힌다 — DETAIL/IMAGE 자체가 아직 V2_ELEMENT_TYPES 에 없는
 * 빌드로 보인다). 이 때문에 "DETAIL/IMAGE 를 실제로 저장해 활성화 제한 안내문이 뜨는 것"과 "게이트가
 * 422 로 막는 것"은 **이 세션의 실서버로 끝까지 재현할 수 없다** — gradle 빌드(BE 재배포)가
 * 필요한데 이 라운드 권한 밖이라 PM 보고 대상이다(재빌드 후 재검증 필요).
 *
 * 이 스펙은 위 인프라 한계 안에서 **실제로 라이브 검증 가능한 부분만** 잰다:
 *   ① 팔레트 배지(BE 무관, 전적으로 FE) — 추가 *전*에 경고가 보인다
 *   ② 비차단 요소만 있는 실 템플릿을 만들어 저장→활성화까지 완주(게이트가 정상 요소를 막지 않는다)
 *   ③「편집 시작」박스의 forward-warning 문장이 실제로 보인다
 *   ④ 비차단 상태의 실 기존 DRAFT 템플릿에서 조건부 안내문이 "재확인" 분기로 정확히 해석된다
 * DETAIL/IMAGE 로 실제로 막히는 분기(차단 안내문 노출·422)는 `templateSchema.activationGate.test.ts`
 * (vitest, 뮤테이션 검증됨)가 판정 로직을 커버한다 — 단 이것은 BE 라운드트립 없는 순수 함수 검증이다.
 *
 * 불변식 H10: 사용자가 활성화할 수 없는 양식을 만들도록 방치되지 않는다 — 되돌리기 어려운 상태에
 * 들어가기 전에 알 수 있다.
 *
 * `*-real-qa.spec.ts` 규칙으로 mock CI 에서 제외된다.
 */
import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5291'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? (process.env.DEV_PASSWORD ?? '')
const SHOT_DIR = resolveQaShotsDir(join(process.cwd(), '..', '..', 'docs', 'qa', '908-r5-activation-gate-warning-2026-07-23'))

test.use({ viewport: { width: 1600, height: 1100 } })

test('R5 — 팔레트가 활성화 제한 요소를 미리 경고하고, 편집기 안내문이 실제 상태와 일치한다 (H10, BE 인프라 한계 내)', async ({ page }) => {
  mkdirSync(SHOT_DIR, { recursive: true })
  const shot = async (n: string) => { await page.screenshot({ path: join(SHOT_DIR, `${n}.png`), fullPage: true }) }

  const login = await page.request.post(`${API_BASE}/api/auth/login`, {
    data: { loginId: 'dev_master', password: PASSWORD },
  })
  expect(login.ok(), `실서버 로그인 실패: HTTP ${login.status()}`).toBeTruthy()
  const d = (await login.json()).data ?? {}
  const authHeaders = { Authorization: `Bearer ${d.token}`, 'X-User-Id': d.userId, 'X-User-Role': d.role ?? 'MASTER' }
  await page.addInitScript((v: { token: string; userId: string; role: string; fullName: string }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ ...v, partnerCode: null }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, { token: d.token ?? '', userId: d.userId ?? '', role: d.role ?? 'MASTER', fullName: d.displayName ?? '개발책임자' })

  const templateName = `DS4 R5 게이트경고 ${Date.now()}`
  let savedTemplateId = ''

  try {
    await test.step('신규 편집기 — 팔레트가 품목행/이미지·로고만 활성화 제한 배지를 상시 노출한다(추가 *전*)', async () => {
      await page.goto(`${BASE_URL}/groupware/document-templates/new/edit`)
      await expect(page.getByRole('heading', { name: '결재 문서 양식 편집기' })).toBeVisible({ timeout: 20000 })
      await expect(page.getByTestId('palette-activation-blocked-badge-DETAIL'), '품목행 배지가 없다 — 추가 전에 경고가 안 보인다').toBeVisible()
      await expect(page.getByTestId('palette-activation-blocked-badge-IMAGE'), '이미지/로고 배지가 없다 — 추가 전에 경고가 안 보인다').toBeVisible()
      // 활성화를 막지 않는 타입은 배지가 없어야 한다(과잉경고 아님 — 정확히 게이트 대상만).
      await expect(page.getByTestId('palette-activation-blocked-badge-TEXT')).toHaveCount(0)
      await expect(page.getByTestId('palette-activation-blocked-badge-FIELD')).toHaveCount(0)
      await shot('R5-00-팔레트-배지')
    })

    await test.step('비차단 요소만으로 저장 — 게이트가 정상 저장까지 막지 않는다(회귀 아님을 먼저 확인)', async () => {
      const docTypeSelect = page.getByLabel('문서 유형')
      const values = await docTypeSelect.locator('option')
        .evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter(Boolean))
      expect(values.length, 'GROUPWARE docType 옵션이 없어 저장 경로에 도달할 수 없다').toBeGreaterThan(0)
      await docTypeSelect.selectOption(values[0]!)
      await page.getByRole('textbox', { name: '양식명' }).fill(templateName)

      const saved = page.waitForResponse((r) =>
        r.url().includes('/document-templates') && r.request().method() === 'POST', { timeout: 20000 })
      await page.getByRole('button', { name: '저장' }).click()
      const res = await saved
      expect(res.status(), `저장 실패 HTTP ${res.status()}`).toBeLessThan(400)
      savedTemplateId = String((await res.json()).data?.id ?? '')
      expect(savedTemplateId, '저장 응답에 template id 가 없다').not.toBe('')
    })

    await test.step('저장 직후(비차단) — 안내문은 기존 재확인 문구다(정상 케이스 회귀 없음)', async () => {
      await expect(page.getByTestId('document-template-activation-blocked-notice')).toHaveCount(0)
      await expect(page.getByText('편집을 마쳤다면 목록에서 이 양식을 다시 사용 설정(활성화)할 수 있습니다.'),
        '비차단 draft 인데 재확인 문구가 안 보인다 — 조건부 분기가 반대로 뒤집혔을 수 있다').toBeVisible({ timeout: 15000 })
      await shot('R5-01-저장직후-비차단-재확인문구')
    })

    await test.step('활성화 — 비차단 요소는 게이트를 그대로 통과한다', async () => {
      await page.goto(`${BASE_URL}/groupware/document-templates`)
      await expect(page.getByRole('heading', { name: '결재 문서 양식', level: 1 })).toBeVisible({ timeout: 20000 })
      const row = page.getByRole('row').filter({ has: page.getByRole('button', { name: templateName }) })
      await expect(row, '저장한 양식이 목록에 없다').toBeVisible({ timeout: 15000 })
      await row.getByRole('button', { name: '활성화' }).click()
      await expect(row.getByText('사용 중')).toBeVisible({ timeout: 15000 })
      await shot('R5-02-활성화-성공')
    })

    await test.step('🔴 「편집 시작」— 되돌리기 어려운 상태에 들어가기 전에 forward-warning 이 보인다(H10)', async () => {
      await page.getByRole('button', { name: templateName }).click()
      await expect(page.getByRole('heading', { name: '결재 문서 양식 편집기' })).toBeVisible({ timeout: 20000 })
      await expect(page.getByText('사용 중인 양식은 직접 수정할 수 없습니다.')).toBeVisible({ timeout: 15000 })
      await expect(
        page.getByText('품목행·이미지/로고 요소를 새로 추가하면, 자동 업데이트가 선행되기 전까지 이'),
        'H10 위반 — 편집 시작(비활성화) 전에 품목행/이미지 forward-warning 이 안 보인다',
      ).toBeVisible()
      await shot('R5-03-편집시작-forward경고')
      await page.getByRole('button', { name: '편집 시작' }).click()
      await expect(page.getByText('사용 중인 양식은 직접 수정할 수 없습니다.')).toHaveCount(0, { timeout: 15000 })
    })

    await test.step('편집 시작 이후(여전히 비차단) — 안내문이 다시 재확인 문구다(실 기존 DRAFT 에서 조건부 정확성 재확인)', async () => {
      await expect(page.getByTestId('document-template-activation-blocked-notice')).toHaveCount(0)
      await expect(page.getByText('편집을 마쳤다면 목록에서 이 양식을 다시 사용 설정(활성화)할 수 있습니다.'),
        'H10 위반 — 비차단 기존 DRAFT 인데 재확인 문구가 안 보인다').toBeVisible({ timeout: 15000 })
      await shot('R5-04-편집시작후-재확인문구')
    })
  } finally {
    // ── 정리 — 공유 실 DB에 throwaway 를 남기지 않는다. delete()는 deactivate+soft-delete 라
    // 활성화된 상태로 남겨두지 않는다. ──
    if (savedTemplateId) {
      const del = await page.request.delete(`${API_BASE}/admin/groupware/document-templates/${savedTemplateId}`, { headers: authHeaders })
      console.log(`■ 정리 ${templateName} → HTTP ${del.status()}`)
    }
  }
})
