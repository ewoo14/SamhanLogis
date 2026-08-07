#!/usr/bin/env node
const { resolveQaCredential } = require('../../../scripts/lib/qa-credentials.cjs')

/**
 * R1-1/R1-2 안전망 — cleanup worker(wmic/detached 어느 쪽이든)가 어떤 이유로도 자기 run 을
 * 못 지운 경우 사람이 즉시 실행해 회수한다(예: taskkill /T /F 직후, "혹시 몰라서"). 각
 * real-qa 스펙의 finally 도 매 실행마다 같은 로직(reapStaleDs4Templates)을 호출해 "다음
 * 실행이 지난 실행의 잔재를 치우는" self-healing 을 이룬다 — 이 CLI 는 다음 실행을 기다릴
 * 필요 없이 "당장" 회수하고 싶을 때를 위한 것이다.
 *
 * 사용법:
 *   node clients/desktop/scripts/ds4-real-qa-reap.cjs [--api-base http://localhost:8080] [--grace-ms 60000] [--password ...]
 * 종료 코드: 0=회수 대상 0건 포함 정상 종료 · 1=조회/삭제 중 실패(NOTICE_LOG_PATH 확인)
 */

const { reapStaleDs4Templates, sweepStaleStopMarkers, NOTICE_LOG_PATH } = require('./ds4-real-qa-reap-core.cjs')
const { DEFAULT_STALE_GRACE_MS } = require('./ds4-real-qa-stale.cjs')

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : fallback
}

async function login(apiBase, password) {
  const res = await fetch(`${apiBase}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginId: 'dev_master', password }),
  })
  if (!res.ok) throw new Error(`로그인 실패 HTTP ${res.status}`)
  const body = await res.json()
  const auth = body.data ?? {}
  return {
    Authorization: `Bearer ${auth.token ?? ''}`,
    'X-User-Id': auth.userId ?? '',
    'X-User-Role': auth.role ?? 'MASTER',
  }
}

async function main() {
  const apiBase = arg('--api-base', process.env.API_BASE || 'http://localhost:8080')
  const graceMs = Number(arg('--grace-ms', String(DEFAULT_STALE_GRACE_MS)))
  const password = arg('--password') ?? resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')

  const authHeaders = await login(apiBase, password)
  const templateResult = await reapStaleDs4Templates({ apiBase, authHeaders, graceMs })
  const markerResult = sweepStaleStopMarkers({ graceMs })

  console.log(`■ 양식 조회=${templateResult.checked}건 stale=${templateResult.stale}건 삭제=${templateResult.deleted}건`)
  console.log(`■ stop marker 삭제=${markerResult.removed.length}건 (${markerResult.removed.join(', ')})`)
  const failures = templateResult.failed.length + markerResult.failed.length
  if (failures > 0) {
    console.error(`■ 실패 ${failures}건 — 상세: ${NOTICE_LOG_PATH}`)
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error)
  process.exitCode = 1
})
