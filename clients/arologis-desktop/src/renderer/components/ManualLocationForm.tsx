import {
  type CSSProperties,
  type FormEvent,
  useState,
} from 'react'
import { Save } from 'lucide-react'
import { Button, Input } from '@samhan/design-system'
import { recordManualLocation } from '../api/arologisDispatchDetail'

export interface ManualLocationFormProps {
  dispatchCode: string
  sequence: number
  driverCode: string
  onSaved: () => void
}

function parseCoordinate(value: string): number | null {
  if (value.trim() === '') return null
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

interface ValidationResult {
  /** 위도 Input 하단에 표시할 개별 오류 메시지 (유효하면 null) */
  latError: string | null
  /** 경도 Input 하단에 표시할 개별 오류 메시지 (유효하면 null) */
  lngError: string | null
  /** manual-location-error 요약 영역에 노출할 대표 메시지 (둘 다 유효하면 null) */
  summary: string | null
}

function validate(latitude: number | null, longitude: number | null): ValidationResult {
  if (latitude === null || longitude === null) {
    const message = '위도와 경도를 모두 입력해주세요'
    return {
      latError: latitude === null ? message : null,
      lngError: longitude === null ? message : null,
      summary: message,
    }
  }
  const latMessage = latitude < -90 || latitude > 90
    ? '위도는 -90 이상 90 이하로 입력해주세요'
    : null
  const lngMessage = longitude < -180 || longitude > 180
    ? '경도는 -180 이상 180 이하로 입력해주세요'
    : null
  return {
    latError: latMessage,
    lngError: lngMessage,
    summary: latMessage ?? lngMessage,
  }
}

/**
 * 관리자 수동 위치 입력 폼.
 *
 * SP-10-2 후속(#815) FE 5-agent 리뷰 fix — 자체 `<input>`/`<button>` 대신
 * `@samhan/design-system` 의 `Input`/`Button` 사용 (focus-visible·aria-invalid·
 * 필드별 오류·loading affordance 는 DS 컴포넌트가 담당).
 *
 * 용어: InsungLbsPanel 의 `SOURCE_LABEL.MANUAL` 과 동일하게 "수동 입력" 사용
 * (과거 "수동 위치" 표기 통일).
 */
export function ManualLocationForm({
  dispatchCode,
  sequence,
  driverCode,
  onSaved,
}: ManualLocationFormProps): JSX.Element {
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [latError, setLatError] = useState<string | null>(null)
  const [lngError, setLngError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSuccess(false)
    const nextLatitude = parseCoordinate(latitude)
    const nextLongitude = parseCoordinate(longitude)
    const validation = validate(nextLatitude, nextLongitude)
    if (validation.summary || nextLatitude === null || nextLongitude === null) {
      setLatError(validation.latError)
      setLngError(validation.lngError)
      setError(validation.summary ?? '위도와 경도를 모두 입력해주세요')
      return
    }

    setSaving(true)
    setLatError(null)
    setLngError(null)
    setError(null)
    try {
      await recordManualLocation(dispatchCode, sequence, nextLatitude, nextLongitude)
      setLatitude('')
      setLongitude('')
      // 저장 확인 배지 — onSaved() 는 상위에서 stale-while-revalidate 로 백그라운드
      // 재조회하므로(화면이 즉시 로딩으로 전환되지 않음), 관리자에게 별도 확인이 필요하다.
      setSuccess(true)
      window.setTimeout(() => setSuccess(false), 2000)
      onSaved()
    } catch {
      setError('수동 입력 저장에 실패했습니다')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      data-testid="manual-location-form"
      aria-label={`수동 위치 입력 — ${driverCode}`}
      onSubmit={handleSubmit}
      style={formStyle}
    >
      <span style={headerStyle}>
        수동 입력 — {driverCode}
      </span>
      <Input
        data-testid="manual-location-lat"
        label="위도"
        inputSize="sm"
        fullWidth={false}
        type="number"
        step="0.0000001"
        value={latitude}
        onChange={(event) => setLatitude(event.target.value)}
        placeholder="위도"
        error={latError ?? undefined}
        style={inputStyle}
      />
      <Input
        data-testid="manual-location-lng"
        label="경도"
        inputSize="sm"
        fullWidth={false}
        type="number"
        step="0.0000001"
        value={longitude}
        onChange={(event) => setLongitude(event.target.value)}
        placeholder="경도"
        error={lngError ?? undefined}
        style={inputStyle}
      />
      <Button
        data-testid="manual-location-save"
        type="submit"
        variant="primary"
        size="sm"
        loading={saving}
      >
        <Save size={14} aria-hidden="true" />
        저장
      </Button>
      {success ? (
        <span data-testid="manual-location-success" role="status" style={successStyle}>
          저장됨
        </span>
      ) : null}
      {error ? (
        <span data-testid="manual-location-error" role="alert" style={errorStyle}>
          {error}
        </span>
      ) : null}
    </form>
  )
}

const formStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
  padding: 'var(--space-3)',
  marginTop: 'var(--space-2)',
  border: '1px solid var(--color-neutral-200)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--color-neutral-0)',
}

const headerStyle: CSSProperties = {
  fontSize: 'var(--font-size-xs)',
  color: 'var(--color-neutral-500)',
  fontWeight: 600,
  flexShrink: 0,
  paddingTop: 'var(--space-5)',
}

const inputStyle: CSSProperties = {
  width: 130,
  fontFamily: 'var(--font-family-mono)',
}

const errorStyle: CSSProperties = {
  fontSize: 'var(--font-size-xs)',
  color: 'var(--color-danger-700, #991B1B)',
  fontWeight: 600,
  paddingTop: 'var(--space-5)',
}

const successStyle: CSSProperties = {
  fontSize: 'var(--font-size-xs)',
  color: 'var(--color-success-700, #047857)',
  fontWeight: 600,
  paddingTop: 'var(--space-5)',
}

export default ManualLocationForm
