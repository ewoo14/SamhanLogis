/**
 * InsungLbsPanel — GPS 하이브리드 위치 소스 우선순위 표시 패널.
 *
 * SP-10-2 FE-2. Designer spec (docs/design/sp-10-2-insung-quick-vendor/gps-priority-indicator.md) 100% 인용.
 *
 * 표시 조건:
 *   - VehicleMatchStatus = ASSIGNED 또는 DELIVERED 일 때만 렌더
 *   - gpsSources 비어 있거나 undefined(BE 필드 누락) 이면 "위치 정보 없음" 메시지
 *     표시 (패널 표시 유지, 크래시 없음 — #785 family sweep)
 *
 * GPS source 우선순위는 BE 가 samhan.arologis.matcher.gps.priority 설정과 stale 기준으로
 * 계산한 순서를 그대로 렌더한다.
 *
 * stale threshold: 60초 초과 미수신 시 timestamp 경고 색상 + AlertCircle 아이콘.
 *
 * 접근성: aria-label "GPS 위치 소스 패널"
 */
import { useEffect, useRef, useState } from 'react'
import { AlertCircle, MapPin, Navigation, NavigationOff, Satellite } from 'lucide-react'

// ---------------------------------------------------------------------------
// 타입 정의
// ---------------------------------------------------------------------------

export type GpsSourceKey =
  | 'EXTERNAL_INSUNG_LBS'
  | 'APP_GPS_ACTIVE'
  | 'APP_GPS_BACKGROUND'
  | 'MANUAL'

export interface GpsSource {
  /** GPS source 종류 */
  source: GpsSourceKey
  /** 위도 (없으면 null) */
  latitude: number | null
  /** 경도 (없으면 null) */
  longitude: number | null
  /**
   * 마지막 수신 시각 (ISO 8601 string).
   * stale 여부 판정 기준: 현재시각 - lastReceivedAt > 60,000ms
   */
  lastReceivedAt: string | null
  /** 활성 여부 (BE 가 priority list 기준으로 결정) */
  active: boolean
}

export interface InsungLbsPanelProps {
  /** 기사 코드 (UUID 아님) */
  driverCode: string
  /**
   * GPS 소스 목록 (priority 순서대로 정렬 권장).
   * BE 필드 누락 가능 — optional. 미전달/undefined 시 빈 배열로 방어 렌더
   * (notifyResults 와 동일 결함 패턴, #785 family sweep).
   */
  gpsSources?: GpsSource[]
}

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

const STALE_THRESHOLD_MS = 60_000 // 60초

/** GPS source key → data-testid suffix 매핑 */
const SOURCE_TESTID: Record<GpsSourceKey, string> = {
  EXTERNAL_INSUNG_LBS:  'gps-source-row-insung-lbs',
  APP_GPS_ACTIVE:       'gps-source-row-app-gps-active',
  APP_GPS_BACKGROUND:   'gps-source-row-app-gps-background',
  MANUAL:               'gps-source-row-manual',
}

const SOURCE_LABEL: Record<GpsSourceKey, string> = {
  EXTERNAL_INSUNG_LBS:  '인성 LBS',
  APP_GPS_ACTIVE:       '앱 GPS (활성)',
  APP_GPS_BACKGROUND:   '앱 GPS (백그라운드)',
  MANUAL:               '수동 입력',
}

// ---------------------------------------------------------------------------
// 아이콘 헬퍼
// ---------------------------------------------------------------------------

function SourceIcon({
  source,
  active,
}: {
  source: GpsSourceKey
  active: boolean
}): JSX.Element {
  const color = active ? 'var(--color-brand-500)' : 'var(--color-neutral-300)'
  const size = 14

  switch (source) {
    case 'EXTERNAL_INSUNG_LBS':
      return <Satellite size={size} color={color} aria-hidden="true" />
    case 'APP_GPS_ACTIVE':
      return <Navigation size={size} color={color} aria-hidden="true" />
    case 'APP_GPS_BACKGROUND':
      return (
        <NavigationOff
          size={size}
          color={active ? 'var(--color-brand-400)' : 'var(--color-neutral-300)'}
          aria-hidden="true"
        />
      )
    case 'MANUAL':
      return (
        <MapPin
          size={size}
          color={active ? 'var(--color-brand-400)' : 'var(--color-neutral-300)'}
          aria-hidden="true"
        />
      )
  }
}

// ---------------------------------------------------------------------------
// 경과 시간 포맷 헬퍼
// ---------------------------------------------------------------------------

function formatElapsed(ms: number): string {
  if (ms < 60_000) return `${Math.floor(ms / 1000)}초 전`
  const m = Math.floor(ms / 60_000)
  return `${m}분 전`
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

// ---------------------------------------------------------------------------
// 단일 source row
// ---------------------------------------------------------------------------

interface SourceRowProps {
  rank: number
  gps: GpsSource
  nowMs: number
}

function SourceRow({ rank, gps, nowMs }: SourceRowProps): JSX.Element {
  const { source, latitude, longitude, lastReceivedAt, active } = gps

  const elapsedMs = lastReceivedAt
    ? nowMs - new Date(lastReceivedAt).getTime()
    : null
  const isStale = elapsedMs !== null && elapsedMs > STALE_THRESHOLD_MS

  const label = SOURCE_LABEL[source]
  const coordText =
    latitude !== null && longitude !== null
      ? `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
      : '—'
  const timeText = lastReceivedAt ? formatTime(lastReceivedAt) : '—'

  return (
    <div
      data-testid={SOURCE_TESTID[source]}
      data-active={active ? 'true' : 'false'}
      style={{
        display:        'flex',
        alignItems:     'center',
        gap:            8,
        padding:        '6px 8px',
        borderRadius:   'var(--radius-md)',
        background:     active ? 'var(--color-brand-50)' : 'var(--color-neutral-0)',
        borderLeft:     active ? '3px solid var(--color-brand-500)' : '3px solid transparent',
        transition:     'background-color var(--duration-slow), color var(--duration-slow)',
      }}
    >
      {/* 순위 번호 */}
      <span
        style={{
          width:      20,
          fontSize:   'var(--font-size-sm)',  // 13px
          color:      active ? 'var(--color-brand-700)' : 'var(--color-neutral-400)',
          fontWeight: active ? 700 : 400,
          flexShrink: 0,
        }}
      >
        [{rank}]
      </span>

      {/* 아이콘 */}
      <SourceIcon source={source} active={active} />

      {/* 라벨 */}
      <span
        style={{
          fontSize:   'var(--font-size-sm)',
          color:      active ? 'var(--color-brand-700)' : 'var(--color-neutral-400)',
          fontWeight: active ? 600 : 400,
          minWidth:   100,
        }}
      >
        {label}
      </span>

      {/* 활성 dot / 비활성 dot */}
      <span
        style={{
          width:        6,
          height:       6,
          borderRadius: '50%',
          background:   active ? 'var(--color-success-500)' : 'transparent',
          border:       active ? 'none' : '1px solid var(--color-neutral-300)',
          flexShrink:   0,
        }}
        aria-hidden="true"
      />

      {/* 좌표 */}
      <span
        style={{
          fontFamily: 'var(--font-family-mono)',
          fontSize:   'var(--font-size-xs)',  // 12px
          color:      active ? 'var(--color-neutral-700)' : 'var(--color-neutral-400)',
          fontFeatureSettings: '"tnum" 1',
          minWidth:   150,
        }}
      >
        {coordText}
      </span>

      {/* 타임스탬프 */}
      <span
        style={{
          fontSize:   'var(--font-size-xs)',
          color:      isStale
            ? 'var(--color-warning-800, #8C5C13)'
            : active
              ? 'var(--color-neutral-600)'
              : 'var(--color-neutral-300)',
          display:    'flex',
          alignItems: 'center',
          gap:        4,
        }}
      >
        {timeText}
        {isStale && (
          <span data-testid="gps-stale-warning" aria-label="데이터 오래됨">
            <AlertCircle
              size={14}
              color="var(--color-warning-400)"
              aria-hidden="true"
            />
          </span>
        )}
      </span>

      {/* stale 서브텍스트 */}
      {isStale && elapsedMs !== null && (
        <span
          style={{
            fontSize: 'var(--font-size-xs)',
            color:    'var(--color-warning-800, #8C5C13)',
          }}
        >
          최근 수신 {formatElapsed(elapsedMs)} (데이터 오래됨)
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 메인 컴포넌트
// ---------------------------------------------------------------------------

/**
 * GPS 위치 소스 우선순위 패널.
 *
 * ASSIGNED / DELIVERED 상태에서만 렌더 — 상위 컴포넌트가 조건 판단 후 렌더.
 *
 * @param driverCode 기사 코드 (표시용)
 * @param gpsSources GPS 소스 목록
 */
export function InsungLbsPanel({
  driverCode,
  gpsSources,
}: InsungLbsPanelProps): JSX.Element {
  // BE 필드 누락 방어 — gpsSources undefined 시 빈 배열로 처리 (#785 family sweep)
  const sources = gpsSources ?? []

  // 경과 시간 실시간 갱신 (1초 interval)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setNowMs(Date.now())
    }, 1_000)
    return () => {
      if (timerRef.current !== null) clearInterval(timerRef.current)
    }
  }, [])

  // BE 가 config priority 와 stale 기준으로 정렬/active 산정을 끝낸 순서를 그대로 렌더한다.
  const ordered = sources

  const activeSource = ordered.find((s) => s.active)

  return (
    <div
      aria-label="GPS 위치 소스 패널"
      data-testid="insung-lbs-panel"
      style={{
        background:   'var(--surface-subtle)',
        border:       '1px solid var(--color-neutral-200)',
        borderRadius: 'var(--radius-md)',
        padding:      'var(--space-3)', // 12px
        marginTop:    8,
      }}
    >
      {/* 패널 헤더 */}
      <div
        style={{
          fontSize:     'var(--font-size-xs)',
          color:        'var(--color-neutral-500)',
          fontWeight:   600,
          marginBottom: 8,
        }}
      >
        GPS 위치 소스 — {driverCode}
      </div>

      {/* source 목록 */}
      {sources.length === 0 ? (
        <p
          style={{
            fontSize: 'var(--font-size-xs)',
            color:    'var(--color-neutral-400)',
            margin:   0,
          }}
        >
          위치 정보 없음
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {ordered.map((gps, index) => (
            <SourceRow
              key={gps.source}
              rank={index + 1}
              gps={gps}
              nowMs={nowMs}
            />
          ))}
        </div>
      )}

      {/* 패널 footer — 활성 소스 요약 */}
      {sources.length > 0 && (
        <div
          style={{
            marginTop:  8,
            paddingTop: 8,
            borderTop:  '1px solid var(--color-neutral-200)',
            display:    'flex',
            alignItems: 'center',
            gap:        6,
            fontSize:   'var(--font-size-xs)',
          }}
        >
          <span style={{ color: 'var(--color-neutral-500)' }}>활성 소스:</span>
          <span
            data-testid="gps-active-source-label"
            style={{
              color:      'var(--color-brand-700)',
              fontWeight: 600,
            }}
          >
            {activeSource ? SOURCE_LABEL[activeSource.source] : '없음'}
          </span>
          <span style={{ color: 'var(--color-neutral-300)' }}>|</span>
          <span style={{ color: 'var(--color-neutral-500)' }}>마지막 수신:</span>
          {activeSource?.lastReceivedAt ? (
            <>
              <span
                style={{
                  fontFamily: 'var(--font-family-mono)',
                  color:      'var(--color-neutral-700)',
                }}
              >
                {formatTime(activeSource.lastReceivedAt)}
              </span>
              <span style={{ color: 'var(--color-neutral-400)' }}>
                ({formatElapsed(nowMs - new Date(activeSource.lastReceivedAt).getTime())})
              </span>
            </>
          ) : (
            <span style={{ color: 'var(--color-neutral-400)' }}>—</span>
          )}
        </div>
      )}
    </div>
  )
}

export default InsungLbsPanel
