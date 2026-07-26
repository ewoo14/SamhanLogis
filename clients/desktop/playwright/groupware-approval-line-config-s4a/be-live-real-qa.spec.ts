import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * 슬4a — 그룹웨어 결재라인 BE 엔드포인트 라이브 실 응답 캡처(스크린샷).
 *
 * [[no-fake-data-ever]] — 실 게이트웨이 :8080 + 실 로그인(dev_master) 실 응답을 그대로 렌더.
 * 슬4a는 BE 전용(UI 없음 — 설정 메뉴/생성 프리필 UI는 슬4b/4c). 본 캡처는 실 엔드포인트 응답 증거.
 * 사전: GROUPWARE_EXPENSE_REPORT 기본 결재라인 시드(팀장 USER=dev_master) — 실 DB.
 */
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import { test } from '@playwright/test'

const GW = 'http://127.0.0.1:8080'
const _dirname = path.dirname(fileURLToPath(import.meta.url))
const DIR = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/groupware-approval-line-config-s4a'))
fs.mkdirSync(DIR, { recursive: true })

async function token(): Promise<string> {
  const http = await import('http')
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ loginId: 'dev_master', password: 'dev_p05_pass!' })
    const req = http.default.request({ hostname: '127.0.0.1', port: 8080, path: '/api/v1/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => { try { resolve(JSON.parse(d).data.token) } catch (e) { reject(new Error(d)) } }) })
    req.on('error', reject); req.write(body); req.end()
  })
}

test('S4a-BE: 그룹웨어 결재라인 엔드포인트 실 게이트웨이 응답', async ({ page, request }) => {
  const t = await token()
  const auth = { Authorization: `Bearer ${t}` }
  const active = await request.get(`${GW}/groupware/approval-templates/active`, { headers: auth })
  const activeJson = await active.json()
  const dflt = await request.get(`${GW}/auth/approval-line-configs/GROUPWARE_EXPENSE_REPORT/default-approvers`, { headers: auth })
  const dfltJson = await dflt.json()
  const anon = await request.get(`${GW}/auth/approval-line-configs/GROUPWARE_EXPENSE_REPORT/default-approvers`)

  const activeNames = (activeJson.data ?? []).map((x: any) => `${x.name}(${x.code})`).join(', ')
  const dfltRows = (dfltJson.data ?? []).map((x: any) => `seq ${x.sequence} · ${x.label} · ${x.displayName}`).join('<br>')

  await page.setContent(`<html><head><meta charset="utf-8"><style>
    body{font-family:'Malgun Gothic',sans-serif;padding:32px;background:#f7f8fa;color:#1a1a1a}
    h1{font-size:20px} .card{background:#fff;border:1px solid #e3e6eb;border-radius:8px;padding:18px 22px;margin:14px 0}
    .ep{font-family:Consolas,monospace;font-size:13px;color:#2451b3} .ok{color:#1a7f37;font-weight:700} .no{color:#b3261e;font-weight:700}
    .val{margin-top:8px;font-size:15px}</style></head><body>
    <h1>슬4a 그룹웨어 결재라인 BE — 실 게이트웨이(:8080) 라이브 응답 · dev_master · VITE_MOCK off</h1>
    <div class="card"><div class="ep">GET /groupware/approval-templates/active</div>
      <span class="ok">HTTP ${active.status()}</span><div class="val">활성 결재 양식: ${activeNames}</div></div>
    <div class="card"><div class="ep">GET /auth/approval-line-configs/GROUPWARE_EXPENSE_REPORT/default-approvers</div>
      <span class="ok">HTTP ${dflt.status()}</span><div class="val">기본 결재라인(USER 결재자·displayName):<br>${dfltRows || '(미설정)'}</div></div>
    <div class="card"><div class="ep">GET …/default-approvers (비인증)</div>
      <span class="no">HTTP ${anon.status()}</span><div class="val">게이트웨이 JwtAuthentication 선차단</div></div>
    <p style="color:#6b7280;font-size:12px">※ 슬4a=BE 전용(엔드포인트). 설정 메뉴(동적 doc-type)·생성 프리필 UI는 슬4b/4c. GROUPWARE_EXPENSE_REPORT 기본 결재라인은 실 DB 시드(팀장=USER).</p>
    </body></html>`)
  await page.screenshot({ path: path.join(DIR, '01-be-live-endpoints.png'), fullPage: true })
})
