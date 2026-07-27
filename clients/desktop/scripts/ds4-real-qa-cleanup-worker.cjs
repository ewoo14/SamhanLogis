#!/usr/bin/env node

const fs = require('node:fs')

const args = process.argv.slice(2)
const value = (name) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

const apiBase = value('--api-base')
const templateName = value('--template-name')
const ownerPid = Number(value('--owner-pid'))
const stopFile = value('--stop-file')
const password = process.env.SAMHAN_DS4_QA_PASSWORD
const pollMs = 500
const maxWaitMs = 15 * 60 * 1000

if (!apiBase || !templateName || !Number.isInteger(ownerPid) || !stopFile || !password) {
  process.exitCode = 2
  process.exit()
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function ownerAlive() {
  try {
    process.kill(ownerPid, 0)
    return true
  } catch {
    return false
  }
}

async function cleanupExactName() {
  const loginResponse = await fetch(`${apiBase}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginId: 'dev_master', password }),
  })
  if (!loginResponse.ok) return
  const loginBody = await loginResponse.json()
  const auth = loginBody.data ?? {}
  const headers = {
    Authorization: `Bearer ${auth.token ?? ''}`,
    'X-User-Id': auth.userId ?? '',
    'X-User-Role': auth.role ?? 'MASTER',
  }
  const listResponse = await fetch(`${apiBase}/admin/groupware/document-templates`, { headers })
  if (!listResponse.ok) return
  const listBody = await listResponse.json()
  const mine = Array.isArray(listBody.data)
    ? listBody.data.filter((template) => template.name === templateName)
    : []
  for (const template of mine) {
    await fetch(`${apiBase}/admin/groupware/document-templates/${template.id}`, {
      method: 'DELETE',
      headers,
    })
  }
}

async function main() {
  const started = Date.now()
  while (Date.now() - started < maxWaitMs) {
    if (fs.existsSync(stopFile) || !ownerAlive()) {
      try { await cleanupExactName() } finally {
        try { fs.unlinkSync(stopFile) } catch { /* 이미 삭제된 marker */ }
      }
      return
    }
    await sleep(pollMs)
  }
  // owner가 고장난 채 남더라도 TTL 이후에는 소유 run만 회수한다.
  await cleanupExactName()
  try { fs.unlinkSync(stopFile) } catch { /* marker가 없으면 종료 */ }
}

main().catch(() => { process.exitCode = 1 })
