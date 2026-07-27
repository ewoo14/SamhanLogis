#!/usr/bin/env node

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { isStaleDs4Run, isOwnerAlive } = require('./ds4-real-qa-stale.cjs')

/**
 * R1-1/R1-2 안전망의 실제 I/O 구현. `ds4-real-qa-stale.cjs`(순수 판정)를 그대로 쓰고 이
 * 파일은 fetch 로 실 API 를 조회/삭제하고 fs 로 임시 stop marker 를 정리한다.
 *
 * `ds4-real-qa-reap.cjs`(사람이 즉시 실행하는 CLI)와 `ds4-real-qa-cleanup.ts`(Playwright
 * support, 매 real-qa 실행의 finally 에서 self-healing 으로 호출) 양쪽에서 그대로
 * 공유한다 — 두 곳이 각자 다시 구현하면 R1-1/R1-2 가 이미 보여준 대로 갈라진다.
 */

const NOTICE_LOG_PATH = path.join(os.tmpdir(), 'samhan-ds4-real-qa-cleanup-notices.log')

/** 회수 실패·이상 대기 등 "무음이면 안 되는" 사실을 남긴다(R1-1/R1-2 불변식 2 — 회수 실패가
 * 무음이면 안 된다). 로그 자체 실패는 삼킨다 — 로깅 실패가 정리 로직을 막으면 안 된다. */
function appendNotice(message) {
  try {
    fs.appendFileSync(NOTICE_LOG_PATH, `[${new Date().toISOString()}] ${message}\n`, 'utf8')
  } catch {
    /* 최선 노력 로그 — 실패해도 삼킨다 */
  }
}

/**
 * 소유자가 죽은(stale) run 의 문서양식만 정확히 그 이름으로 삭제한다. broad prefix 삭제가
 * 아니다 — `isStaleDs4Run`이 이름 구조 + 유예기간 + 소유자 생존을 모두 확인한 것만 대상이라
 * 살아있는 다른 run(동시 실행 포함)은 절대 건드리지 않는다(R1-1 불변식 5).
 */
async function reapStaleDs4Templates({ apiBase, authHeaders, graceMs, now = Date.now() }) {
  const listRes = await fetch(`${apiBase}/admin/groupware/document-templates`, { headers: authHeaders })
  if (!listRes.ok) {
    const message = `stale sweep: 양식 목록 조회 실패 HTTP ${listRes.status}`
    appendNotice(message)
    return { checked: 0, stale: 0, deleted: 0, failed: [{ name: '(list)', error: message }] }
  }
  const body = await listRes.json()
  const items = Array.isArray(body.data) ? body.data : []
  const staleItems = items.filter((item) => isStaleDs4Run(item.name, { now, graceMs }))
  let deleted = 0
  const failed = []
  for (const item of staleItems) {
    const deleteRes = await fetch(`${apiBase}/admin/groupware/document-templates/${item.id}`, {
      method: 'DELETE',
      headers: authHeaders,
    })
    if (deleteRes.ok) {
      deleted += 1
    } else {
      const message = `stale sweep: 삭제 실패 name="${item.name}" HTTP ${deleteRes.status}`
      appendNotice(message)
      failed.push({ name: item.name, error: message })
    }
  }
  return { checked: items.length, stale: staleItems.length, deleted, failed }
}

/** `.stop` marker 가 %TEMP% 에 영구 잔류하지 않게 한다(R1-2 불변식 4). 파일명에서 pid/시각을
 * 못 뽑는(=이 하네스가 만들지 않은) 파일은 훨씬 보수적인 1시간 mtime 유예로만 정리한다. */
function sweepStaleStopMarkers({ graceMs, now = Date.now() }) {
  const dir = os.tmpdir()
  const removed = []
  const failed = []
  let entries = []
  try {
    entries = fs.readdirSync(dir).filter((f) => f.startsWith('samhan-ds4-') && f.endsWith('.stop'))
  } catch (err) {
    appendNotice(`stop marker 스캔 실패: ${err && err.stack ? err.stack : err}`)
    return { removed, failed: [{ file: '(scan)', error: String(err) }] }
  }
  for (const file of entries) {
    const full = path.join(dir, file)
    const pidMatch = /(\d+)-(\d+)-[0-9a-fA-F-]{36}/u.exec(file)
    let shouldRemove = false
    if (pidMatch) {
      const pid = Number(pidMatch[1])
      const startedAtMs = Number(pidMatch[2])
      shouldRemove = now - startedAtMs >= graceMs && !isOwnerAlive(pid)
    } else {
      try {
        shouldRemove = now - fs.statSync(full).mtimeMs >= Math.max(graceMs, 60 * 60 * 1000)
      } catch {
        shouldRemove = false
      }
    }
    if (!shouldRemove) continue
    try {
      fs.unlinkSync(full)
      removed.push(file)
    } catch (err) {
      const message = `stop marker 삭제 실패 file="${file}": ${err && err.stack ? err.stack : err}`
      appendNotice(message)
      failed.push({ file, error: message })
    }
  }
  return { removed, failed }
}

module.exports = { NOTICE_LOG_PATH, appendNotice, reapStaleDs4Templates, sweepStaleStopMarkers }
