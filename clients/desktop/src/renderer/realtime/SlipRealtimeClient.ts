/**
 * 전표 실시간 이벤트 수신 클라이언트 — PR-H1 FE-1.
 *
 * <p>BE {@code GET /api/v1/slips/{slipId}/realtime} (Server-Sent Events stream)
 * 를 fetch + ReadableStream 으로 직접 파싱한다. 브라우저 native EventSource 는
 * Electron 은 authProvider 가 Authorization 헤더만 제공하고 쿠키는 생략하며,
 * 웹은 httpOnly 쿠키를 credentials:'include' 로 전송한다.
 *
 * <h2>주요 동작</h2>
 * <ul>
 *   <li>{@link subscribe} 호출 시 fetch 로 SSE 스트림 연결, ReadableStream 라인 파서로
 *       {@code data:} 이벤트를 추출하여 {@code onEvent} 콜백 호출.</li>
 *   <li>연결 종료/네트워크 오류 시 5s exponential backoff 으로 재연결 (최대 60s).</li>
 *   <li>60s 동안 어떤 이벤트도 (heartbeat 포함) 미수신 시 강제 재연결.</li>
 *   <li>호출자가 반환된 {@link AbortController#abort} 를 호출하면 모든 reconnect 도 즉시 중단.</li>
 * </ul>
 *
 * <h2>UUID 비공개 가드</h2>
 * <p>{@code slipId} 는 path param 으로만 사용. 이벤트 payload 에 포함된 UUID 는
 * 호출자(SlipDetailPage)가 화면 노출하지 않고 cache invalidate 키로만 사용한다.
 */
import { apiClient } from '../api/client'
import { isMockMode } from '../api/mock'
import { getAuthProvider, isElectronPlatform } from '../auth/authProvider'

/**
 * SSE 1 이벤트의 파싱된 형태. {@code event:} 라인이 없으면 SSE 표준에 따라
 * "message" 로 처리. {@code data:} 는 multi-line 가능 (newline join).
 */
export interface SlipRealtimeEvent {
  /** SSE event type (없으면 "message"). */
  event: string
  /** 파싱된 JSON payload — BE 가 반드시 JSON 직렬화 보장. */
  data: unknown
  /** 원본 data 텍스트 (debug / heartbeat 판별용). */
  raw: string
}

/** 콜백 시그니처. */
export type SlipRealtimeHandler = (event: SlipRealtimeEvent) => void

/** 5s → 10s → 20s → 40s → 60s (cap) backoff 스케줄. */
const BACKOFF_INITIAL_MS = 5_000
const BACKOFF_CAP_MS = 60_000
/** heartbeat 미수신 시 강제 재연결 임계 (60s). */
const HEARTBEAT_TIMEOUT_MS = 60_000

function nextBackoff(prev: number): number {
  return Math.min(prev * 2, BACKOFF_CAP_MS)
}

/**
 * 전역 SSE 스트림 구독 진입점.
 *
 * @param slipId  전표 UUID — path param 전용 (화면 노출 X)
 * @param onEvent 이벤트 수신 콜백 (heartbeat 도 포함하여 호출됨; 호출자는 raw 로 분기 가능)
 * @return abort 가능한 {@link AbortController} — 호출자가 unmount 시점에 abort()
 */
export function subscribe(
  slipId: string,
  onEvent: SlipRealtimeHandler,
): AbortController {
  const controller = new AbortController()

  // mock fixture에는 SSE 서버가 없으므로 raw fetch가 mock 경계를 넘지 않게 한다.
  // 호출자는 동일한 abort 계약으로 cleanup할 수 있어 화면 코드는 변경하지 않는다.
  if (isMockMode()) return controller

  let backoffMs = BACKOFF_INITIAL_MS
  let lastEventAt = Date.now()
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  const baseUrl =
    (apiClient.defaults.baseURL ?? '').replace(/\/$/, '')

  const clearHeartbeat = () => {
    if (heartbeatTimer !== null) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
  }

  const clearReconnect = () => {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  /**
   * heartbeat 감시 타이머 — 매 10s 체크 하여 마지막 이벤트로부터 60s 초과 시
   * 강제 재연결 트리거.
   */
  const startHeartbeatWatch = (innerAbort: AbortController) => {
    clearHeartbeat()
    heartbeatTimer = setInterval(() => {
      if (controller.signal.aborted) return
      if (Date.now() - lastEventAt > HEARTBEAT_TIMEOUT_MS) {
        // 강제 재연결 — inner stream abort 시 catch 블록에서 reconnect 예약
        innerAbort.abort()
      }
    }, 10_000)
  }

  /**
   * 한 번의 SSE 연결 시도. 성공 시 backoff 리셋, 실패/종료 시 backoff 으로 reconnect 예약.
   */
  const connect = async () => {
    if (controller.signal.aborted) return

    // inner abort: heartbeat timeout 시 기존 fetch 만 abort 하고 reconnect.
    const innerAbort = new AbortController()
    const onOuterAbort = () => innerAbort.abort()
    controller.signal.addEventListener('abort', onOuterAbort)

    let authHeaders: Record<string, string> = {}
    try {
      authHeaders = await getAuthProvider().getAuthHeaders()
    } catch (err) {
      // 인증 헤더 조회 실패 — 401 가능성 → backoff 재시도
      console.error('[SlipRealtimeClient] 인증 헤더 조회 실패', err)
    }

    const headers: Record<string, string> = {
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache',
      ...authHeaders,
    }

    try {
      const url = `${baseUrl}/api/v1/slips/${encodeURIComponent(slipId)}/realtime`
      const res = await fetch(url, {
        method: 'GET',
        headers,
        signal: innerAbort.signal,
        credentials: isElectronPlatform ? 'omit' : 'include',
      })

      if (!res.ok || !res.body) {
        throw new Error(`SSE 연결 실패 status=${res.status}`)
      }

      // 연결 성공 — backoff 리셋, heartbeat watch 시작
      backoffMs = BACKOFF_INITIAL_MS
      lastEventAt = Date.now()
      startHeartbeatWatch(innerAbort)

      const reader = res.body
        .pipeThrough(new TextDecoderStream('utf-8'))
        .getReader()

      let buffer = ''
      let eventName = ''
      let dataLines: string[] = []

      const dispatch = () => {
        if (dataLines.length === 0) {
          eventName = ''
          return
        }
        const raw = dataLines.join('\n')
        let parsed: unknown = null
        try {
          parsed = raw.length > 0 ? JSON.parse(raw) : null
        } catch {
          // BE 가 비-JSON heartbeat (예: ":\n\n") 보낼 수 있음 — raw 그대로 전달
          parsed = null
        }
        try {
          onEvent({
            event: eventName || 'message',
            data: parsed,
            raw,
          })
        } catch (err) {
          console.error('[SlipRealtimeClient] onEvent 콜백 오류', err)
        }
        eventName = ''
        dataLines = []
      }

      while (!innerAbort.signal.aborted) {
        const { value, done } = await reader.read()
        if (done) break
        if (!value) continue
        lastEventAt = Date.now()
        buffer += value

        let idx = buffer.indexOf('\n')
        while (idx !== -1) {
          const line = buffer.slice(0, idx).replace(/\r$/, '')
          buffer = buffer.slice(idx + 1)

          if (line === '') {
            // 빈 줄 = 이벤트 종료
            dispatch()
          } else if (line.startsWith(':')) {
            // SSE 코멘트 (heartbeat) — lastEventAt 갱신만 (이미 위에서 함)
          } else if (line.startsWith('event:')) {
            eventName = line.slice(6).trimStart()
          } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trimStart())
          }
          // id:/retry: 는 본 클라이언트에서 미사용
          idx = buffer.indexOf('\n')
        }
      }

      // stream 정상 종료 → 즉시 reconnect (backoff 리셋 상태)
      throw new Error('SSE stream closed by server')
    } catch (err) {
      if (controller.signal.aborted) {
        return
      }
      console.warn(
        `[SlipRealtimeClient] 연결 종료 — ${backoffMs}ms 후 재연결`,
        err,
      )
      clearHeartbeat()
      controller.signal.removeEventListener('abort', onOuterAbort)
      reconnectTimer = setTimeout(() => {
        const cur = backoffMs
        backoffMs = nextBackoff(backoffMs)
        void connect()
        void cur // backoff 변수 사용 표식
      }, backoffMs)
    }
  }

  // 외부 abort 시 모든 타이머 정리
  controller.signal.addEventListener('abort', () => {
    clearHeartbeat()
    clearReconnect()
  })

  void connect()

  return controller
}

export const SlipRealtimeClient = { subscribe }
