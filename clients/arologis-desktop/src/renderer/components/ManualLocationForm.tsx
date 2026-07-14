import {
  type FormEvent,
  useState,
} from 'react'
import { Save } from 'lucide-react'
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

function validate(latitude: number | null, longitude: number | null): string | null {
  if (latitude === null || longitude === null) {
    return '위도와 경도를 모두 입력해주세요'
  }
  if (latitude < -90 || latitude > 90) {
    return '위도는 -90 이상 90 이하로 입력해주세요'
  }
  if (longitude < -180 || longitude > 180) {
    return '경도는 -180 이상 180 이하로 입력해주세요'
  }
  return null
}

export function ManualLocationForm({
  dispatchCode,
  sequence,
  driverCode,
  onSaved,
}: ManualLocationFormProps): JSX.Element {
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextLatitude = parseCoordinate(latitude)
    const nextLongitude = parseCoordinate(longitude)
    const validationError = validate(nextLatitude, nextLongitude)
    if (validationError || nextLatitude === null || nextLongitude === null) {
      setError(validationError ?? '위도와 경도를 모두 입력해주세요')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await recordManualLocation(dispatchCode, sequence, nextLatitude, nextLongitude)
      setLatitude('')
      setLongitude('')
      onSaved()
    } catch {
      setError('수동 위치 저장에 실패했습니다')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      data-testid="manual-location-form"
      onSubmit={handleSubmit}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--space-2)',
        padding: 'var(--space-3)',
        marginTop: 'var(--space-2)',
        border: '1px solid var(--color-neutral-200)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--color-neutral-0)',
      }}
    >
      <span
        style={{
          fontSize: 'var(--font-size-xs)',
          color: 'var(--color-neutral-500)',
          fontWeight: 600,
          lineHeight: '30px',
          flexShrink: 0,
        }}
      >
        수동 위치 — {driverCode}
      </span>
      <input
        data-testid="manual-location-lat"
        aria-label="위도"
        type="number"
        step="0.0000001"
        value={latitude}
        onChange={(event) => setLatitude(event.target.value)}
        placeholder="위도"
        style={{
          width: 120,
          height: 30,
          padding: '0 var(--space-2)',
          border: '1px solid var(--color-neutral-300)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 'var(--font-size-sm)',
          fontFamily: 'var(--font-family-mono)',
        }}
      />
      <input
        data-testid="manual-location-lng"
        aria-label="경도"
        type="number"
        step="0.0000001"
        value={longitude}
        onChange={(event) => setLongitude(event.target.value)}
        placeholder="경도"
        style={{
          width: 120,
          height: 30,
          padding: '0 var(--space-2)',
          border: '1px solid var(--color-neutral-300)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 'var(--font-size-sm)',
          fontFamily: 'var(--font-family-mono)',
        }}
      />
      <button
        data-testid="manual-location-save"
        type="submit"
        disabled={saving}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          height: 30,
          padding: '0 var(--space-3)',
          border: '1px solid var(--color-brand-500)',
          borderRadius: 'var(--radius-sm)',
          background: saving ? 'var(--color-neutral-100)' : 'var(--color-brand-500)',
          color: saving ? 'var(--color-neutral-500)' : 'var(--color-neutral-0)',
          fontSize: 'var(--font-size-sm)',
          fontWeight: 600,
          cursor: saving ? 'not-allowed' : 'pointer',
        }}
      >
        <Save size={14} aria-hidden="true" />
        저장
      </button>
      {error && (
        <span
          data-testid="manual-location-error"
          role="alert"
          style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-danger-700, #B91C1C)',
            lineHeight: '30px',
          }}
        >
          {error}
        </span>
      )}
    </form>
  )
}

export default ManualLocationForm
