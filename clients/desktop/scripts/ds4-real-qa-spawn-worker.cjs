#!/usr/bin/env node

const { spawn, exec } = require('node:child_process')

/**
 * R1-1 실측: Node `spawn(..., { detached: true })`는 Windows 에서 콘솔만 분리하고 PPID는
 * 그대로 유지한다 — `taskkill /T /F`가 조상 프로세스를 죽이면 detached 자식도 함께 죽는다
 * (실측: PID 58000이 detached인데도 PID 35736→52696 트리 종료에 함께 종료됨, 2026-07-27
 * R1 적대검증). Windows는 CreateProcess가 기록한 PPID를 절대 재부모화(reparent)하지
 * 않으므로(POSIX의 init 재부모화와 다르다), 자식이 스스로 detach해서는 이 트리 워크를
 * 벗어날 방법이 없다 — 오직 "제3자 프로세스가 대신 만든 프로세스"만 워크에 안 걸린다.
 *
 * `wmic process call create`는 WMI provider host(WmiPrvSE.exe)가 실제로 CreateProcess를
 * 대신 호출한다 — 그 결과 프로세스의 부모가 우리 프로세스 트리 밖(WmiPrvSE.exe)이 된다.
 * 2026-07-27 이 저장소·이 환경에서 직접 실측: 3단 트리(조부모→부모→자식)를 재현하고
 * `taskkill /PID <조부모> /T /F`를 실행한 뒤 heartbeat 파일 갱신 여부로 생사를 확인했다 —
 * Node detached 자식은 heartbeat가 즉시 멈췄고(=트리 종료로 사망), wmic로 띄운 자식은
 * heartbeat가 계속 갱신되며 `tasklist`에도 살아있는 것으로 확인됐다(PID 70812, 종료 2초
 * 후에도 하트비트 전진 + tasklist 조회에 잡힘 → 실험 종료 후 별도로 taskkill 로 정리).
 *
 * wmic는 Windows에서 공식적으로 사용 중단(deprecated)된 도구라 미래 환경에는 없을 수
 * 있다 — 그 경우 Node detached spawn으로 즉시 fallback하고 그 사실을 warning으로
 * 반환한다(무음 강등 금지, R1-1 불변식 2). fallback은 트리 종료에는 여전히 취약하지만
 * 정상 종료·타임아웃·Ctrl+C·비-트리 강제종료(taskkill /F 단독)에는 원래도 강했다 — 그리고
 * 두 spawn 방식 모두 별도의 self-healing sweep/reap(ds4-real-qa-reap-core.cjs 기반)이
 * 최종 안전망으로 남는다.
 *
 * @param {{ workerPath: string, apiBase: string, scopeFile: string,
 *   stopFile: string, password: string }} options
 * @returns {Promise<{ method: 'wmic' | 'detached-fallback', pid: number | null, warning: string | null }>}
 */
async function spawnDs4CleanupWorker({ workerPath, apiBase, scopeFile, stopFile, password }) {
  const passwordB64 = Buffer.from(password, 'utf8').toString('base64')
  const workerArgs = [
    '--api-base', apiBase,
    '--scope-file', scopeFile,
    '--stop-file', stopFile,
    '--password-b64', passwordB64,
  ]

  if (process.platform === 'win32') {
    const commandLine = [quote(process.execPath), quote(workerPath), ...workerArgs.map(quote)].join(' ')
    const wmicResult = await tryWmicSpawn(commandLine)
    if (wmicResult.ok) {
      return { method: 'wmic', pid: wmicResult.pid, warning: null }
    }
    const child = spawnDetached(workerPath, workerArgs)
    return {
      method: 'detached-fallback',
      pid: child.pid ?? null,
      warning:
        `wmic 기반 tree-kill 면역 spawn 실패(${wmicResult.reason}) — Node detached fallback 사용, ` +
        'taskkill /T /F 내성 상실(self-healing sweep/reap가 최종 안전망으로 남음)',
    }
  }

  // POSIX는 detached:true가 실제로 init에 재부모화되어 부모 트리가 죽어도 살아남는다 —
  // 이 저장소의 real-qa 하네스는 Windows 전용이라(R1-1 원문) wmic 분기를 타지 않지만,
  // 이식성을 위해 fallback 경로 자체는 플랫폼 공용으로 남긴다.
  const child = spawnDetached(workerPath, workerArgs)
  return { method: 'detached-fallback', pid: child.pid ?? null, warning: null }
}

function spawnDetached(workerPath, workerArgs) {
  const child = spawn(process.execPath, [workerPath, ...workerArgs], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })
  child.unref()
  return child
}

function tryWmicSpawn(commandLine) {
  return new Promise((resolve) => {
    const escaped = commandLine.replace(/"/g, '\\"')
    exec(`wmic process call create "${escaped}"`, { windowsHide: true }, (err, stdout) => {
      if (err) {
        resolve({ ok: false, reason: String((err && err.message) || err) })
        return
      }
      const returnValueMatch = /ReturnValue\s*=\s*(\d+)/u.exec(stdout || '')
      if (!returnValueMatch || returnValueMatch[1] !== '0') {
        resolve({ ok: false, reason: `wmic ReturnValue=${returnValueMatch ? returnValueMatch[1] : 'unknown'}` })
        return
      }
      const pidMatch = /ProcessId\s*=\s*(\d+)/u.exec(stdout || '')
      resolve({ ok: true, pid: pidMatch ? Number(pidMatch[1]) : null })
    })
  })
}

function quote(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`
}

module.exports = { spawnDs4CleanupWorker }
