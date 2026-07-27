#!/usr/bin/env node

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const {
  isStaleDs4Run,
  isOwnerAlive,
  parseDs4RunRecord,
  RUN_SCOPE_FILE_PREFIX,
  RUN_SCOPE_FILE_SUFFIX,
} = require('./ds4-real-qa-stale.cjs')

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

function readRunRecords(registryDir = os.tmpdir()) {
  let entries
  try {
    entries = fs.readdirSync(registryDir)
  } catch (error) {
    appendNotice(`run scope 스캔 실패: ${error && error.stack ? error.stack : error}`)
    return []
  }
  return entries
    .filter((file) => file.startsWith(RUN_SCOPE_FILE_PREFIX) && file.endsWith(RUN_SCOPE_FILE_SUFFIX))
    .flatMap((file) => {
      const registryFile = path.join(registryDir, file)
      try {
        const parsed = parseDs4RunRecord(JSON.parse(fs.readFileSync(registryFile, 'utf8')))
        return parsed ? [{ ...parsed, registryFile }] : []
      } catch (error) {
        appendNotice(`run scope 읽기 실패 file="${registryFile}": ${error && error.stack ? error.stack : error}`)
        return []
      }
    })
}

function removeRegistryFile(file) {
  if (!file) return
  try {
    fs.unlinkSync(file)
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      appendNotice(`run scope 삭제 실패 file="${file}": ${error && error.stack ? error.stack : error}`)
    }
  }
}

/**
 * 등록된 run scope의 templateId만 삭제한다. 문서 양식 name은 사용자 입력이므로 판정에 사용하지
 * 않는다. `runRecords`는 계약 테스트/호출자가 주입할 수 있고, 기본값은 %TEMP% registry를 읽는다.
 */
async function reapStaleDs4Templates({
  apiBase,
  authHeaders,
  graceMs,
  now = Date.now(),
  registryDir = os.tmpdir(),
  runRecords = readRunRecords(registryDir),
}) {
  const listRes = await fetch(`${apiBase}/admin/groupware/document-templates`, { headers: authHeaders })
  if (!listRes.ok) {
    const message = `stale sweep: 양식 목록 조회 실패 HTTP ${listRes.status}`
    appendNotice(message)
    return { checked: 0, stale: 0, deleted: 0, failed: [{ name: '(list)', error: message }] }
  }
  const body = await listRes.json()
  const items = Array.isArray(body.data) ? body.data : []
  const staleRecords = runRecords
    .map((record) => ({ record, parsed: parseDs4RunRecord(record) }))
    .filter(({ record, parsed }) => parsed && isStaleDs4Run(record, { now, graceMs }))
    .map(({ record, parsed }) => ({ ...parsed, registryFile: record.registryFile }))
  const staleIds = new Set(staleRecords.map((record) => record.templateId))
  const staleItems = items.filter((item) => staleIds.has(item.id))
  let deleted = 0
  const failed = []
  for (const item of staleItems) {
    const deleteRes = await fetch(`${apiBase}/admin/groupware/document-templates/${item.id}`, {
      method: 'DELETE',
      headers: authHeaders,
    })
    if (deleteRes.ok) {
      deleted += 1
      staleRecords
        .filter((record) => record.templateId === item.id)
        .forEach((record) => removeRegistryFile(record.registryFile))
    } else {
      const message = `stale sweep: 삭제 실패 id="${item.id}" HTTP ${deleteRes.status}`
      appendNotice(message)
      failed.push({ id: item.id, error: message })
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

module.exports = { NOTICE_LOG_PATH, appendNotice, readRunRecords, reapStaleDs4Templates, sweepStaleStopMarkers }
