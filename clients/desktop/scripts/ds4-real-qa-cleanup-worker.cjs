#!/usr/bin/env node

const fs = require('node:fs')
const { isOwnerAlive } = require('./ds4-real-qa-stale.cjs')
const { appendNotice } = require('./ds4-real-qa-reap-core.cjs')

const args = process.argv.slice(2)
const value = (name) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

const apiBase = value('--api-base')
const templateName = value('--template-name')
const ownerPid = Number(value('--owner-pid'))
const stopFile = value('--stop-file')
const passwordB64 = value('--password-b64')
const password = passwordB64
  ? Buffer.from(passwordB64, 'base64').toString('utf8')
  : process.env.SAMHAN_DS4_QA_PASSWORD
const pollMs = 500
// 🚨 R1-2 fix: 예전에는 이 값이 "이 시간이 지나면 owner 생존과 무관하게 강제 삭제"하는 TTL
// 이었다 — owner 가 실제로 살아있는 --timeout=0/PWDEBUG=1/--debug 수동 세션에서도 발동해
// 살아있는 실행의 데이터를 지웠다(불변식 위반, R1 적대검증 실측 재현: [+15.0분] 존재=true →
// [+16.0분] 존재=false, owner 는 계속 생존). 이제 이 값은 "이 주기로 '아직 살아있어서
// 기다리는 중'이라는 사실을 무음이 아니게 기록"하는 notice 주기일 뿐이다 — 더 이상 삭제
// 트리거가 아니다. 테스트가 분 단위로 기다리지 않고 짧게 검증할 수 있도록 override 가능하다.
const noticeIntervalMs = Number(value('--notice-interval-ms') ?? 15 * 60 * 1000)

if (!apiBase || !templateName || !Number.isInteger(ownerPid) || !stopFile || !password) {
  process.exitCode = 2
  process.exit()
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function cleanupExactName() {
  const loginResponse = await fetch(`${apiBase}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginId: 'dev_master', password }),
  })
  if (!loginResponse.ok) {
    appendNotice(`cleanup 실패: 로그인 HTTP ${loginResponse.status} template="${templateName}"`)
    return
  }
  const loginBody = await loginResponse.json()
  const auth = loginBody.data ?? {}
  const headers = {
    Authorization: `Bearer ${auth.token ?? ''}`,
    'X-User-Id': auth.userId ?? '',
    'X-User-Role': auth.role ?? 'MASTER',
  }
  const listResponse = await fetch(`${apiBase}/admin/groupware/document-templates`, { headers })
  if (!listResponse.ok) {
    appendNotice(`cleanup 실패: 양식 목록 HTTP ${listResponse.status} template="${templateName}"`)
    return
  }
  const listBody = await listResponse.json()
  const mine = Array.isArray(listBody.data)
    ? listBody.data.filter((template) => template.name === templateName)
    : []
  for (const template of mine) {
    const deleteRes = await fetch(`${apiBase}/admin/groupware/document-templates/${template.id}`, {
      method: 'DELETE',
      headers,
    })
    if (!deleteRes.ok) {
      appendNotice(`cleanup 실패: 삭제 HTTP ${deleteRes.status} template="${templateName}" id=${template.id}`)
    }
  }
}

async function main() {
  const started = Date.now()
  let nextNoticeAt = started + noticeIntervalMs
  // 🚨 R1-2 fix: owner 생존 여부와 stop marker 만이 종료 조건이다 — 시간 경과 자체는 더 이상
  // 종료(=삭제) 조건이 아니다. owner 가 살아있는 한 이 루프는 무기한 대기한다.
  while (true) {
    if (fs.existsSync(stopFile) || !isOwnerAlive(ownerPid)) {
      try {
        await cleanupExactName()
      } finally {
        try {
          fs.unlinkSync(stopFile)
        } catch {
          /* 이미 삭제된 marker */
        }
      }
      return
    }
    const now = Date.now()
    if (now >= nextNoticeAt) {
      const minutes = Math.round((now - started) / 60000)
      appendNotice(
        `owner(pid=${ownerPid})가 ${minutes}분째 살아있어 대기 계속 — 강제 삭제하지 않음. ` +
          `template="${templateName}"`,
      )
      nextNoticeAt = now + noticeIntervalMs
    }
    await sleep(pollMs)
  }
}

main().catch((error) => {
  appendNotice(`worker 미처리 예외: ${error && error.stack ? error.stack : error} template="${templateName}"`)
  process.exitCode = 1
})
