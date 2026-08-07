#!/usr/bin/env node

const fs = require('node:fs')
const { resolveQaCredential } = require('../../../scripts/lib/qa-credentials.cjs')
const { isOwnerAlive, parseDs4RunRecord } = require('./ds4-real-qa-stale.cjs')
const { appendNotice } = require('./ds4-real-qa-reap-core.cjs')

const args = process.argv.slice(2)
const value = (name) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

const apiBase = value('--api-base')
const scopeFile = value('--scope-file')
const stopFile = value('--stop-file')
const passwordB64 = value('--password-b64')
const password = passwordB64
  ? Buffer.from(passwordB64, 'base64').toString('utf8')
  : resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const pollMs = 500
// 🚨 R1-2 fix: 예전에는 이 값이 "이 시간이 지나면 owner 생존과 무관하게 강제 삭제"하는 TTL
// 이었다 — owner 가 실제로 살아있는 --timeout=0/PWDEBUG=1/--debug 수동 세션에서도 발동해
// 살아있는 실행의 데이터를 지웠다(불변식 위반, R1 적대검증 실측 재현: [+15.0분] 존재=true →
// [+16.0분] 존재=false, owner 는 계속 생존). 이제 이 값은 "이 주기로 '아직 살아있어서
// 기다리는 중'이라는 사실을 무음이 아니게 기록"하는 notice 주기일 뿐이다 — 더 이상 삭제
// 트리거가 아니다. 테스트가 분 단위로 기다리지 않고 짧게 검증할 수 있도록 override 가능하다.
const noticeIntervalMs = Number(value('--notice-interval-ms') ?? 15 * 60 * 1000)

if (!apiBase || !scopeFile || !stopFile || !password) {
  process.exitCode = 2
  process.exit()
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function readScope() {
  try {
    return parseDs4RunRecord(JSON.parse(fs.readFileSync(scopeFile, 'utf8')))
  } catch (error) {
    appendNotice(`cleanup scope 읽기 실패 file="${scopeFile}": ${error && error.stack ? error.stack : error}`)
    return null
  }
}

async function cleanupExactId(scope) {
  if (!scope || !scope.templateId) {
    appendNotice(`cleanup 보류: 서버가 발급한 templateId가 scope에 기록되지 않음 file="${scopeFile}"`)
    return false
  }
  const loginResponse = await fetch(`${apiBase}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginId: 'dev_master', password }),
  })
  if (!loginResponse.ok) {
    appendNotice(`cleanup 실패: 로그인 HTTP ${loginResponse.status} id="${scope.templateId}"`)
    return false
  }
  const loginBody = await loginResponse.json()
  const auth = loginBody.data ?? {}
  const headers = {
    Authorization: `Bearer ${auth.token ?? ''}`,
    'X-User-Id': auth.userId ?? '',
    'X-User-Role': auth.role ?? 'MASTER',
  }
  const deleteRes = await fetch(`${apiBase}/admin/groupware/document-templates/${scope.templateId}`, {
    method: 'DELETE',
    headers,
  })
  if (!deleteRes.ok && deleteRes.status !== 404) {
    appendNotice(`cleanup 실패: 삭제 HTTP ${deleteRes.status} id="${scope.templateId}"`)
    return false
  }
  return true
}

async function main() {
  const initialScope = readScope()
  if (!initialScope) {
    process.exitCode = 2
    return
  }
  const ownerPid = initialScope.ownerPid
  const started = Date.now()
  let nextNoticeAt = started + noticeIntervalMs
  // 🚨 R1-2 fix: owner 생존 여부와 stop marker 만이 종료 조건이다 — 시간 경과 자체는 더 이상
  // 종료(=삭제) 조건이 아니다. owner 가 살아있는 한 이 루프는 무기한 대기한다.
  while (true) {
    if (fs.existsSync(stopFile) || !isOwnerAlive(ownerPid)) {
      try {
        // 부모가 저장 응답을 받은 뒤 scope registry를 갱신하므로 종료 시점에 다시 읽는다.
        const cleaned = await cleanupExactId(readScope())
        if (cleaned) {
          try {
            fs.unlinkSync(scopeFile)
          } catch {
            /* scope registry가 이미 reaper에 의해 정리된 경우 */
          }
        }
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
          `scope="${scopeFile}"`,
      )
      nextNoticeAt = now + noticeIntervalMs
    }
    await sleep(pollMs)
  }
}

main().catch((error) => {
  appendNotice(`worker 미처리 예외: ${error && error.stack ? error.stack : error} scope="${scopeFile}"`)
  process.exitCode = 1
})
