/**
 * 도메인별 SSE realtime client factory — PR-H4c FE-A.
 *
 * <p>{@code SlipRealtimeClient} (PR-H1 SSE 패턴) 의 path-only 부분을 일반화. 호출자는
 * {@code endpointPath(entityId)} 만 제공하여 도메인 (accounting / partner-order /
 * dc-config / estimate) 의 SSE 스트림을 동일 backoff/heartbeat 정책으로 구독한다.
 *
 * <h2>UUID 비공개 가드</h2>
 * <p>{@code entityId} 는 path 만 사용. 화면 노출은 호출자가 책임 (대상 page 의 Detail/Form).
 *
 * @example
 * const TaxInvoiceRealtimeClient = createRealtimeClient({
 *   name: 'TaxInvoice',
 *   endpointPath: (id) => `/accounting/tax-invoices/${encodeURIComponent(id)}/realtime`,
 * })
 */
import { apiClient } from '../api/client'
import { isMockMode } from '../api/mock'
import { getAuthProvider, isElectronPlatform } from '../auth/authProvider'

/** SSE 1 이벤트의 파싱된 형태. */
export interface RealtimeEvent {
  /** SSE event type (없으면 "message"). */
  event: string
  /** 파싱된 JSON payload. */
  data: unknown
  /** 원본 data 텍스트 (debug / heartbeat 판별). */
  raw: string
}

export type RealtimeHandler = (event: RealtimeEvent) => void

export interface RealtimeClientConfig {
  /** 로그 prefix (예: "TaxInvoiceRealtimeClient"). */
  name: string
  /** entityId → endpoint path 변환 (baseURL 제외, '/' prefix 필수). */
  endpointPath: (entityId: string) => string
}

export interface RealtimeClient {
  /**
   * 구독 시작. 반환된 controller.abort() 호출 시 모든 reconnect 도 즉시 중단.
   */
  subscribe: (entityId: string, onEvent: RealtimeHandler) => AbortController
}

const BACKOFF_INITIAL_MS = 5_000
const BACKOFF_CAP_MS = 60_000
const HEARTBEAT_TIMEOUT_MS = 60_000

function nextBackoff(prev: number): number {
  return Math.min(prev * 2, BACKOFF_CAP_MS)
}

/**
 * 도메인별 SSE 클라이언트 생성. 한 도메인당 1회 호출 후 module 단위로 재사용.
 */
export function createRealtimeClient(config: RealtimeClientConfig): RealtimeClient {
  const logPrefix = `[${config.name}]`

  function subscribe(
    entityId: string,
    onEvent: RealtimeHandler,
  ): AbortController {
    const controller = new AbortController()

    // mock fixture에는 SSE 서버가 없으므로 공통 raw fetch 경계를 열지 않는다.
    // 모든 도메인 realtime client가 같은 no-op/abort cleanup 계약을 유지한다.
    if (isMockMode()) return controller

    let backoffMs = BACKOFF_INITIAL_MS
    let lastEventAt = Date.now()
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    const baseUrl = (apiClient.defaults.baseURL ?? '').replace(/\/$/, '')

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

    const startHeartbeatWatch = (innerAbort: AbortController) => {
      clearHeartbeat()
      heartbeatTimer = setInterval(() => {
        if (controller.signal.aborted) return
        if (Date.now() - lastEventAt > HEARTBEAT_TIMEOUT_MS) {
          innerAbort.abort()
        }
      }, 10_000)
    }

    const connect = async () => {
      if (controller.signal.aborted) return

      const innerAbort = new AbortController()
      const onOuterAbort = () => innerAbort.abort()
      controller.signal.addEventListener('abort', onOuterAbort)

      let authHeaders: Record<string, string> = {}
      try {
        authHeaders = await getAuthProvider().getAuthHeaders()
      } catch (err) {
        console.error(`${logPrefix} 인증 헤더 조회 실패`, err)
      }

      const headers: Record<string, string> = {
        Accept: 'text/event-stream',
        'Cache-Control': 'no-cache',
        ...authHeaders,
      }

      try {
        const url = `${baseUrl}${config.endpointPath(entityId)}`
        const res = await fetch(url, {
          method: 'GET',
          headers,
          signal: innerAbort.signal,
          credentials: isElectronPlatform ? 'omit' : 'include',
        })

        if (!res.ok || !res.body) {
          throw new Error(`SSE 연결 실패 status=${res.status}`)
        }

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
            parsed = null
          }
          try {
            onEvent({ event: eventName || 'message', data: parsed, raw })
          } catch (err) {
            console.error(`${logPrefix} onEvent 콜백 오류`, err)
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
              dispatch()
            } else if (line.startsWith(':')) {
              // SSE comment (heartbeat) — lastEventAt 갱신만
            } else if (line.startsWith('event:')) {
              eventName = line.slice(6).trimStart()
            } else if (line.startsWith('data:')) {
              dataLines.push(line.slice(5).trimStart())
            }
            idx = buffer.indexOf('\n')
          }
        }

        throw new Error('SSE stream closed by server')
      } catch (err) {
        if (controller.signal.aborted) return
        console.warn(`${logPrefix} 연결 종료 — ${backoffMs}ms 후 재연결`, err)
        clearHeartbeat()
        controller.signal.removeEventListener('abort', onOuterAbort)
        reconnectTimer = setTimeout(() => {
          backoffMs = nextBackoff(backoffMs)
          void connect()
        }, backoffMs)
      }
    }

    controller.signal.addEventListener('abort', () => {
      clearHeartbeat()
      clearReconnect()
    })

    void connect()

    return controller
  }

  return { subscribe }
}
