/**
 * SlipRealtimeClient — Phase 12 PR-H1 신규 (mobile-staff FE-2).
 *
 * slip-service 가 발행하는 Server-Sent Events (SSE) 스트림을 RN (Expo SDK 53) 환경에서 구독한다.
 *
 * 배경:
 *   - RN 의 React Native 런타임에는 표준 EventSource API 가 없다 (브라우저 전역 미존재).
 *   - 따라서 `react-native-sse` 라이브러리를 polyfill 로 사용한다.
 *   - desktop FE 는 표준 EventSource (Chromium 기반 Electron) 를 직접 사용 — 본 client 는
 *     mobile-staff 전용 wrapper.
 *
 * BE 계약 (parallel — endpoint 는 desktop 과 공유):
 *   - GET `/slips/{slipId}/realtime`  (Authorization: Bearer <jwt>)
 *   - response = `text/event-stream`
 *   - event types: `comment.created` | `comment.updated` | `comment.deleted`
 *                  | `slip.transition` | `slip.edit`
 *                  | `slip.edit-request.created` | `slip.edit-request.approved`
 *                  | `slip.edit-request.rejected` | `heartbeat`
 *   - `slip.edit` (Phase 12 PR-H2 신규) = slip 필드 수정 이벤트 — AuditOverlay 의 trigger.
 *   - `slip.edit-request.*` (Phase 12 PR-H3 신규) = 영업 ↔ 창고 양방향 push (수정 요청 워크플로우).
 *     - created: 영업 → 창고 (창고 직원 PENDING list 갱신, foreground 알림 표시).
 *     - approved / rejected: 창고 → 영업 (작성자 SlipDetailScreen 알림 표시).
 *   - heartbeat ≈ 30s 간격 (server keepalive). 60s 미수신 시 client 가 reconnect.
 *
 * 사용 (예):
 *   const sub = subscribeToSlip(slipId, jwt, (evt) => {
 *     if (evt.type === 'comment.created') queueClient.invalidateComments();
 *   });
 *   return () => sub.close();
 *
 * UUID 비공개:
 *   - slipId 는 path param 으로만 사용 (UI 미노출 — caller 가 비공개 보장).
 *
 * 한국어 UI:
 *   - 본 client 는 logging 만, UI 메시지는 호출 화면이 처리.
 */

import EventSource, {
  type ErrorEvent,
  type EventSourceListener,
  type MessageEvent,
} from 'react-native-sse';
import { API_BASE_URL } from '../api/salesUtils';

/** SSE 이벤트 종류 — BE 발행 event name 과 1:1. */
export type SlipRealtimeEventType =
  | 'comment.created'
  | 'comment.updated'
  | 'comment.deleted'
  | 'slip.transition'
  | 'slip.edit'
  | 'slip.edit-request.created'
  | 'slip.edit-request.approved'
  | 'slip.edit-request.rejected'
  | 'heartbeat';

/**
 * 콜백으로 전달되는 정규화된 이벤트.
 *
 * `data` 는 BE JSON payload 를 parse 한 결과 (JSON parse 실패 시 raw string).
 * `lastEventId` 는 SSE 표준 `id:` 필드 (서버가 채움 시).
 */
export interface SlipRealtimeEvent {
  type: SlipRealtimeEventType;
  data: unknown;
  lastEventId: string | null;
  receivedAt: number; // Date.now() 시점 — heartbeat 감시 용도
}

export interface SubscribeHandle {
  /** EventSource 연결 종료 + 모든 listener 정리 + heartbeat watchdog 해제. */
  close: () => void;
}

/** heartbeat 미수신 임계 (ms). 본 값 초과 시 manual reconnect. */
const HEARTBEAT_TIMEOUT_MS = 60_000;

/** reconnect 시도 간격 (ms) — exponential 미적용 (라이브러리 자체 reconnect 우선). */
const MANUAL_RECONNECT_DELAY_MS = 1_000;

/**
 * slip 실시간 스트림 구독.
 *
 * 동작:
 *   1. `${API_BASE_URL}/slips/${slipId}/realtime` 으로 EventSource 연결.
 *   2. Authorization 헤더에 JWT 주입 (gateway 가 검증 후 slip-service 로 forward).
 *   3. `comment.*` / `slip.transition` / `heartbeat` 이벤트 listener 등록.
 *   4. 마지막 이벤트 수신 시각 기록 — `HEARTBEAT_TIMEOUT_MS` 초과 시 close + 재연결.
 *   5. 라이브러리 자체 자동 reconnect (`error` 이벤트 발생 시 라이브러리가 polling) 보존.
 *
 * 반환: `SubscribeHandle` — `close()` 호출 시 cleanup. RN useEffect cleanup 에 그대로 사용.
 *
 * @param slipId   slip UUID (path 만, UI 노출 X)
 * @param jwt      Bearer access token (null 시 Authorization 헤더 미설정)
 * @param onEvent  이벤트 콜백 (comment.* / slip.transition / heartbeat)
 */
export function subscribeToSlip(
  slipId: string,
  jwt: string | null,
  onEvent: (evt: SlipRealtimeEvent) => void,
): SubscribeHandle {
  let closed = false;
  let currentSource: EventSource<SlipRealtimeEventType> | null = null;
  let watchdog: ReturnType<typeof setInterval> | null = null;
  let lastEventAt = Date.now();

  const url = `${API_BASE_URL}/slips/${encodeURIComponent(slipId)}/realtime`;
  const headers: Record<string, string> = { Accept: 'text/event-stream' };
  if (jwt) headers.Authorization = `Bearer ${jwt}`;

  const handleSseEvent = (
    type: SlipRealtimeEventType,
    raw: string | null,
    lastEventId: string | null,
  ): void => {
    lastEventAt = Date.now();
    let parsed: unknown = raw;
    if (raw && raw.length > 0) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = raw;
      }
    }
    onEvent({ type, data: parsed, lastEventId, receivedAt: lastEventAt });
  };

  const open = (): void => {
    if (closed) return;
    const source = new EventSource<SlipRealtimeEventType>(url, {
      headers,
      // pollingInterval=0 → SSE persistent 연결 유지 (default 5_000 폴링 disable).
      pollingInterval: 0,
    });
    currentSource = source;
    lastEventAt = Date.now();

    // 표준 'message' (이름 없는 event) — 일부 BE 구현 호환.
    const onMessage: EventSourceListener<SlipRealtimeEventType, 'message'> = (e) => {
      const msg = e as MessageEvent;
      handleSseEvent('heartbeat', msg.data, msg.lastEventId);
    };
    source.addEventListener('message', onMessage);

    // named events — BE 가 `event: comment.created` 형식으로 발행.
    (
      [
        'comment.created',
        'comment.updated',
        'comment.deleted',
        'slip.transition',
        'slip.edit',
        'slip.edit-request.created',
        'slip.edit-request.approved',
        'slip.edit-request.rejected',
        'heartbeat',
      ] as const
    ).forEach((name) => {
      source.addEventListener(name, ((e: { data: string | null; lastEventId: string | null }) => {
        handleSseEvent(name, e.data, e.lastEventId);
      }) as EventSourceListener<SlipRealtimeEventType, typeof name>);
    });

    source.addEventListener('error', ((e: ErrorEvent) => {
      // 라이브러리 자체 reconnect 발동 — 별도 manual reconnect 미필요.
      // watchdog 만 유지하여 60s 무이벤트 시 fallback reconnect.
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn('[SlipRealtimeClient] error', e?.message ?? '');
      }
    }) as EventSourceListener<SlipRealtimeEventType, 'error'>);
  };

  // heartbeat watchdog — 60s 무이벤트 시 강제 close + reopen.
  watchdog = setInterval(() => {
    if (closed) return;
    if (Date.now() - lastEventAt > HEARTBEAT_TIMEOUT_MS) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn('[SlipRealtimeClient] heartbeat timeout — manual reconnect');
      }
      try {
        currentSource?.removeAllEventListeners();
        currentSource?.close();
      } catch {
        // noop
      }
      currentSource = null;
      setTimeout(open, MANUAL_RECONNECT_DELAY_MS);
    }
  }, 15_000);

  open();

  return {
    close: () => {
      closed = true;
      if (watchdog) {
        clearInterval(watchdog);
        watchdog = null;
      }
      try {
        currentSource?.removeAllEventListeners();
        currentSource?.close();
      } catch {
        // noop — 이미 닫힌 경우.
      }
      currentSource = null;
    },
  };
}
