/**
 * arologis 수동 배차 admin UI — `/dispatches/manual` (Phase 10 P1-5).
 *
 * 매뉴얼: docs/manual/05-arologis/02-수동-배차.md §2 정식 admin 폼.
 * BE: services/arologis-service/.../ArologisAdminController#manualCreate / manualPreview
 *
 * <pre>
 *  ┌────────────────────────────────────────────────────────────────┐
 *  │ ┌──────────────────────────┐ ┌───────────────────────────────┐ │
 *  │ │ 좌측: 카톡 텍스트 input    │ │ 우측: 동적 폼                  │ │
 *  │ │ - textarea (카톡 형식)    │ │ - 도착일 / 유형 / driverCode    │ │
 *  │ │ - [미리보기] → preview    │ │ - 차량 N (sequence/톤수/별명)   │ │
 *  │ │ - parsed result 시각화    │ │   ┗ 정차 N (순서/거래처/주소)   │ │
 *  │ └──────────────────────────┘ │ - [저장] → manual create        │ │
 *  │                              └───────────────────────────────┘ │
 *  └────────────────────────────────────────────────────────────────┘
 * </pre>
 *
 * UUID 비공개 (feedback_uuid_no_user_visibility.md):
 * - 사용자 노출 = 차량 sequence / 거래처명 / 톤수 / 주소 / 슬립번호
 * - dispatchId UUID 는 저장 후 toast 로만 노출 X — 사용자에겐 "저장 완료" 만 표시
 *
 * driverAutoMatch 안내 (매뉴얼 §6-2):
 * - driverCode 비워두면 BE 가 기사 자동 매칭을 수행
 *
 * /dispatches/unassigned 연계 (Phase 10 PR-E1 FE-3):
 * - query param (date / slipNo / partnerCode / partnerName / address) 가 있으면
 *   첫 차량 첫 정차에 자동 채움. slipNo 는 정차 메모에 보존.
 *
 * data-testid (slice 명세):
 * - arologis-manual-kakao-input / arologis-manual-preview-button
 * - arologis-manual-vehicle-input / arologis-manual-stop-add / arologis-manual-item-add
 * - arologis-manual-submit-button
 *
 * NOTE: 슬라이스 prompt 의 "품목 (품명/수량) list" 는 BE `ManualStop` schema 미보유
 *       (address / partnerName / kakaoSeq / notes 만). 정차당 품목은 메모(notes)에 자유 기술.
 */
import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Card, FormField } from '@samhan/design-system'
import axios from 'axios'
import {
  createManualDispatch,
  previewManualDispatch,
  DISPATCH_TYPE_LABEL,
  DISPATCH_TYPE_OPTIONS,
  TONNAGE_LABEL,
  TONNAGE_OPTIONS,
  type ArologisDispatchType,
  type ArologisVehicleTonnage,
  type ManualDispatchPreviewResponse,
  type ManualDispatchRequest,
} from '../../api/arologisManual'
import { usePageTitle } from '../../hooks/usePageTitle'

// ---------------------------------------------------------------------------
// Local draft state — string 기반 (input value 호환). 저장 시 number 변환.
// ---------------------------------------------------------------------------

interface StopDraft {
  sequence: string
  partnerName: string
  address: string
  kakaoSeq: string
  notes: string
}

interface VehicleDraft {
  sequence: string
  tonnage: ArologisVehicleTonnage
  label: string
  stops: StopDraft[]
}

const emptyStop = (sequence: number): StopDraft => ({
  sequence: String(sequence),
  partnerName: '',
  address: '',
  kakaoSeq: '',
  notes: '',
})

const emptyVehicle = (sequence: number): VehicleDraft => ({
  sequence: String(sequence),
  tonnage: 'TONNAGE_1',
  label: '',
  stops: [emptyStop(1)],
})

const todayIso = (): string => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ---------------------------------------------------------------------------
// 카톡 텍스트 placeholder — 매뉴얼 §1-1 예시.
// ---------------------------------------------------------------------------

const KAKAO_PLACEHOLDER = `8일착 야상입니다
1. 본사창고
-서울 강남구 역삼동(현대공조-501)10시
1톤`

// ---------------------------------------------------------------------------
// 폼 → BE request 변환 + 검증.
// ---------------------------------------------------------------------------

function toRequest(
  dispatchDate: string,
  dispatchType: ArologisDispatchType,
  driverCode: string,
  vehicles: VehicleDraft[],
): ManualDispatchRequest {
  return {
    dispatchDate,
    dispatchType,
    driverCode: driverCode.trim() || undefined,
    vehicles: vehicles.map((v) => ({
      sequence: Number(v.sequence) || 0,
      tonnage: v.tonnage,
      label: v.label.trim() || undefined,
      stops: v.stops.map((s) => ({
        sequence: Number(s.sequence) || 0,
        partnerName: s.partnerName.trim() || undefined,
        address: s.address.trim(),
        kakaoSeq: s.kakaoSeq.trim()
          ? Number(s.kakaoSeq.trim())
          : undefined,
        notes: s.notes.trim() || undefined,
      })),
    })),
  }
}

function validateDraft(
  vehicles: VehicleDraft[],
): string | null {
  if (vehicles.length === 0) return '차량을 1대 이상 추가해 주세요.'
  for (let vi = 0; vi < vehicles.length; vi += 1) {
    const v = vehicles[vi]!
    if (!v.sequence || Number(v.sequence) < 1) {
      return `차량 ${vi + 1}: 차량 순번은 1 이상이어야 합니다.`
    }
    if (v.stops.length === 0) {
      return `차량 ${vi + 1}: 정차를 1건 이상 추가해 주세요.`
    }
    for (let si = 0; si < v.stops.length; si += 1) {
      const s = v.stops[si]!
      if (!s.address.trim()) {
        return `차량 ${vi + 1} / 정차 ${si + 1}: 주소는 필수입니다.`
      }
      if (!s.sequence || Number(s.sequence) < 1) {
        return `차량 ${vi + 1} / 정차 ${si + 1}: 정차 순서는 1 이상이어야 합니다.`
      }
    }
    // 정차 sequence 중복 가드 — BE service 도 동일 검증
    const seqs = v.stops.map((s) => Number(s.sequence))
    const dupe = seqs.find((n, i) => seqs.indexOf(n) !== i)
    if (dupe !== undefined) {
      return `차량 ${vi + 1}: 정차 순서가 중복되었습니다 (seq=${dupe}).`
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// 컴포넌트.
// ---------------------------------------------------------------------------

export function ArologisManualDispatchPage() {
  usePageTitle('arologis 수동 배차')
  const navigate = useNavigate()

  // ---- /dispatches/unassigned 등 외부 화면에서 query param 으로 전달된 ------
  // 자동 채움 데이터 (FE-3 연계). 본 page mount 시 1회 적용.
  const [searchParams] = useSearchParams()
  const prefill = useMemo(
    () => ({
      date: searchParams.get('date'),
      slipNo: searchParams.get('slipNo'),
      partnerCode: searchParams.get('partnerCode'),
      partnerName: searchParams.get('partnerName'),
      address: searchParams.get('address'),
    }),
    [searchParams],
  )

  // ---- 좌측 카톡 텍스트 ---------------------------------------------------
  const [kakaoText, setKakaoText] = useState('')

  // ---- 우측 폼 ------------------------------------------------------------
  const [dispatchDate, setDispatchDate] = useState<string>(
    prefill.date ?? todayIso(),
  )
  const [dispatchType, setDispatchType] = useState<ArologisDispatchType>('DAY')
  const [driverCode, setDriverCode] = useState('')
  const [vehicles, setVehicles] = useState<VehicleDraft[]>(() => {
    // /dispatches/unassigned 에서 진입 시 첫 차량 첫 정차에 prefill 적용.
    if (prefill.slipNo || prefill.address || prefill.partnerName) {
      const vehicle = emptyVehicle(1)
      const stop = vehicle.stops[0]!
      if (prefill.partnerName) stop.partnerName = prefill.partnerName
      if (prefill.address) stop.address = prefill.address
      if (prefill.slipNo) {
        // slipNo 는 W10-4 prefix 등 비숫자 포함 가능 → numeric 부분만 kakaoSeq 시도.
        const numeric = prefill.slipNo.replace(/[^0-9]/g, '')
        if (numeric) stop.kakaoSeq = numeric
        // 메모에 원본 slipNo 보존 — 사용자가 추적 가능하도록.
        stop.notes = `미배차 전표 ${prefill.slipNo}`
            + (prefill.partnerCode ? ` / 거래처코드 ${prefill.partnerCode}` : '')
      }
      return [vehicle]
    }
    return [emptyVehicle(1)]
  })

  // ---- 미리보기 결과 (좌측 하단 표시) -------------------------------------
  const [preview, setPreview] = useState<ManualDispatchPreviewResponse | null>(
    null,
  )
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  // ---- 저장 mutation -----------------------------------------------------
  const saveMutation = useMutation({
    mutationFn: () =>
      createManualDispatch(
        toRequest(dispatchDate, dispatchType, driverCode, vehicles),
      ),
    onSuccess: () => {
      // 저장 후 dispatch 목록으로 이동 (P1-5 list 화면 도착 전이므로 우선 dashboard)
      navigate('/')
    },
  })

  // ---- 저장 에러 메시지 추출 ----------------------------------------------
  const saveErrorMessage = (() => {
    if (!saveMutation.isError) return null
    const err = saveMutation.error
    if (axios.isAxiosError(err)) {
      const data = err.response?.data as { message?: string } | undefined
      return data?.message ?? '수동 배차 저장에 실패했습니다.'
    }
    return '알 수 없는 오류'
  })()

  // ---- 미리보기 호출 ------------------------------------------------------
  // 카톡 textarea 가 비어있으면 우측 폼 그대로 미리보기 (기능 일관성).
  // 카톡 입력은 §1-1 우회 호환 — 향후 parser endpoint 분기 가능.
  const handlePreview = async () => {
    const validationError = validateDraft(vehicles)
    if (validationError) {
      setPreviewError(validationError)
      setPreview(null)
      return
    }
    setPreviewLoading(true)
    setPreviewError(null)
    try {
      const result = await previewManualDispatch(
        toRequest(dispatchDate, dispatchType, driverCode, vehicles),
      )
      setPreview(result)
    } catch (err) {
      setPreview(null)
      if (axios.isAxiosError(err)) {
        const data = err.response?.data as { message?: string } | undefined
        setPreviewError(data?.message ?? '미리보기 호출에 실패했습니다.')
      } else {
        setPreviewError('알 수 없는 오류')
      }
    } finally {
      setPreviewLoading(false)
    }
  }

  // ---- 저장 호출 ----------------------------------------------------------
  const handleSave = () => {
    const validationError = validateDraft(vehicles)
    if (validationError) {
      setPreviewError(validationError)
      return
    }
    saveMutation.mutate()
  }

  // ---- 차량 / 정차 add/remove --------------------------------------------
  const addVehicle = () =>
    setVehicles((vs) => [...vs, emptyVehicle(vs.length + 1)])
  const removeVehicle = (idx: number) =>
    setVehicles((vs) => (vs.length === 1 ? vs : vs.filter((_, i) => i !== idx)))
  const updateVehicle = (idx: number, patch: Partial<VehicleDraft>) =>
    setVehicles((vs) =>
      vs.map((v, i) => (i === idx ? { ...v, ...patch } : v)),
    )

  const addStop = (vIdx: number) =>
    setVehicles((vs) =>
      vs.map((v, i) =>
        i === vIdx
          ? { ...v, stops: [...v.stops, emptyStop(v.stops.length + 1)] }
          : v,
      ),
    )
  const removeStop = (vIdx: number, sIdx: number) =>
    setVehicles((vs) =>
      vs.map((v, i) =>
        i === vIdx
          ? {
              ...v,
              stops:
                v.stops.length === 1
                  ? v.stops
                  : v.stops.filter((_, si) => si !== sIdx),
            }
          : v,
      ),
    )
  const updateStop = (vIdx: number, sIdx: number, patch: Partial<StopDraft>) =>
    setVehicles((vs) =>
      vs.map((v, i) =>
        i === vIdx
          ? {
              ...v,
              stops: v.stops.map((s, si) =>
                si === sIdx ? { ...s, ...patch } : s,
              ),
            }
          : v,
      ),
    )

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <h3 style={{ margin: 0 }}>arologis 수동 배차</h3>
          {/* PR-H4c FE-B: 신규 작성 form — 저장 후 dispatch 상세에서 audit overlay 자동 활성 */}
          <span
            data-testid="arologis-manual-realtime-notice"
            style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}
          >
            저장 후 변경 이력 자동 추적 (PR-H4c)
          </span>
        </div>
        <Button variant="ghost" onClick={() => navigate('/')}>
          취소
        </Button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1.4fr',
          gap: 16,
          alignItems: 'start',
        }}
      >
        {/* =========================================================== */}
        {/* 좌측 — 카톡 텍스트 + 미리보기                                 */}
        {/* =========================================================== */}
        <Card padding={5} shadow="sm">
          <h4 style={{ marginTop: 0 }}>카톡 텍스트 (참고)</h4>
          <p style={{ fontSize: 12, color: 'var(--color-neutral-500)', marginTop: 0 }}>
            카톡 메시지를 복사해서 붙여 넣고 [미리보기] 를 눌러 검증하세요.
            본 슬라이스는 우측 폼 입력값을 BE 로 전송합니다 (카톡 파싱은 별도
            메뉴 사용).
          </p>
          <textarea
            data-testid="arologis-manual-kakao-input"
            value={kakaoText}
            onChange={(e) => setKakaoText(e.target.value)}
            placeholder={KAKAO_PLACEHOLDER}
            rows={10}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 6,
              border: '1px solid var(--color-neutral-300)',
              fontSize: 13,
              fontFamily: 'monospace',
              resize: 'vertical',
            }}
          />

          <div style={{ marginTop: 12 }}>
            <Button
              data-testid="arologis-manual-preview-button"
              variant="secondary"
              onClick={() => void handlePreview()}
              loading={previewLoading}
            >
              미리보기 (BE 검증)
            </Button>
          </div>

          {previewError ? (
            <div
              className="error-banner"
              role="alert"
              style={{ marginTop: 12 }}
            >
              {previewError}
            </div>
          ) : null}

          {preview ? (
            <div
              data-testid="arologis-manual-preview-result"
              style={{
                marginTop: 16,
                padding: 12,
                borderRadius: 6,
                background: 'var(--color-neutral-50)',
                border: '1px solid var(--color-neutral-200)',
              }}
            >
              <h5 style={{ margin: '0 0 8px' }}>미리보기 결과</h5>
              <p style={{ margin: '0 0 8px', fontSize: 13 }}>
                도착일: <strong>{preview.dispatchDate}</strong> · 유형:{' '}
                <strong>{DISPATCH_TYPE_LABEL[preview.dispatchType]}</strong>
                {' · '}차량 <strong>{preview.totalVehicles}</strong>대 / 정차{' '}
                <strong>{preview.totalStops}</strong>건
              </p>
              <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--color-neutral-500)' }}>
                기사:{' '}
                {preview.driverCodeApplied
                  ? <strong>{preview.driverCodeApplied}</strong>
                  : <em>미지정 — 저장 시 기사 자동 매칭을 시도합니다</em>}
              </p>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {preview.vehicles.map((v) => (
                  <li key={v.sequence} style={{ marginBottom: 6 }}>
                    차량 {v.sequence} ({TONNAGE_LABEL[v.tonnage]})
                    {v.label ? ` — ${v.label}` : ''}
                    <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                      {v.stops.map((s) => (
                        <li key={s.sequence}>
                          {s.sequence}.{' '}
                          {s.partnerName ? `${s.partnerName} · ` : ''}
                          {s.address}
                          {s.notes ? ` (${s.notes})` : ''}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </Card>

        {/* =========================================================== */}
        {/* 우측 — 동적 폼                                                */}
        {/* =========================================================== */}
        <Card padding={5} shadow="sm">
          <h4 style={{ marginTop: 0 }}>배차 입력</h4>

          <div className="form-section">
            <div className="form-row">
              <FormField
                label="도착일"
                required
                render={({ id }) => (
                  <input
                    id={id}
                    type="date"
                    value={dispatchDate}
                    onChange={(e) => setDispatchDate(e.target.value)}
                    style={inputStyle}
                  />
                )}
              />
              <FormField
                label="유형"
                required
                render={({ id }) => (
                  <select
                    id={id}
                    value={dispatchType}
                    onChange={(e) =>
                      setDispatchType(e.target.value as ArologisDispatchType)
                    }
                    style={inputStyle}
                  >
                    {DISPATCH_TYPE_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {DISPATCH_TYPE_LABEL[t]}
                      </option>
                    ))}
                  </select>
                )}
              />
            </div>

            <div className="form-row">
              <FormField
                label="기사 코드 (옵션)"
                render={({ id }) => (
                  <input
                    id={id}
                    data-testid="arologis-manual-driver-code"
                    value={driverCode}
                    onChange={(e) => setDriverCode(e.target.value)}
                    placeholder="비워두면 자동 매칭"
                    maxLength={50}
                    style={inputStyle}
                  />
                )}
              />
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: 12,
                  color: 'var(--color-neutral-500)',
                  padding: '24px 0 0',
                }}
              >
                기사 미지정 시 저장 시점에 자동 매칭을 시도합니다.
              </div>
            </div>
          </div>

          <h4 style={{ marginTop: 16 }}>차량 목록</h4>

          {vehicles.map((vehicle, vIdx) => (
            <Card
              key={vIdx}
              padding={4}
              shadow="sm"
              style={{
                marginBottom: 12,
                background: 'var(--color-neutral-50)',
                border: '1px solid var(--color-neutral-200)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <h5 style={{ margin: 0 }}>차량 {vIdx + 1}</h5>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeVehicle(vIdx)}
                  disabled={vehicles.length === 1}
                >
                  차량 삭제
                </Button>
              </div>

              <div className="form-row">
                <FormField
                  label="차량 순번"
                  required
                  render={({ id }) => (
                    <input
                      id={id}
                      data-testid="arologis-manual-vehicle-input"
                      type="number"
                      min={1}
                      max={99}
                      value={vehicle.sequence}
                      onChange={(e) =>
                        updateVehicle(vIdx, { sequence: e.target.value })
                      }
                      style={inputStyle}
                    />
                  )}
                />
                <FormField
                  label="톤수"
                  required
                  render={({ id }) => (
                    <select
                      id={id}
                      value={vehicle.tonnage}
                      onChange={(e) =>
                        updateVehicle(vIdx, {
                          tonnage: e.target.value as ArologisVehicleTonnage,
                        })
                      }
                      style={inputStyle}
                    >
                      {TONNAGE_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {TONNAGE_LABEL[t]}
                        </option>
                      ))}
                    </select>
                  )}
                />
                <FormField
                  label="차량 별명 / 차량번호"
                  render={({ id }) => (
                    <input
                      id={id}
                      value={vehicle.label}
                      onChange={(e) =>
                        updateVehicle(vIdx, { label: e.target.value })
                      }
                      placeholder="예: 12가3456"
                      maxLength={200}
                      style={inputStyle}
                    />
                  )}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 8,
                  marginBottom: 4,
                }}
              >
                <strong style={{ fontSize: 13 }}>정차 목록</strong>
                <Button
                  data-testid="arologis-manual-stop-add"
                  variant="secondary"
                  size="sm"
                  onClick={() => addStop(vIdx)}
                >
                  + 정차 추가
                </Button>
              </div>

              {vehicle.stops.map((stop, sIdx) => (
                <div
                  key={sIdx}
                  style={{
                    padding: 8,
                    borderRadius: 4,
                    border: '1px solid var(--color-neutral-200)',
                    marginBottom: 6,
                    background: 'var(--color-neutral-0)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 6,
                    }}
                  >
                    <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
                      정차 {sIdx + 1}
                    </span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <Button
                        // 품목 상세는 메모 필드로 수집한다. 클릭 시 notes 영역으로 이동.
                        data-testid="arologis-manual-item-add"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const target = document.getElementById(
                            `notes-${vIdx}-${sIdx}`,
                          )
                          target?.focus()
                        }}
                        title="품목과 특이사항은 메모 영역에 기재합니다."
                      >
                        + 품목 (메모)
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeStop(vIdx, sIdx)}
                        disabled={vehicle.stops.length === 1}
                      >
                        삭제
                      </Button>
                    </div>
                  </div>

                  <div className="form-row">
                    <FormField
                      label="순서"
                      required
                      render={({ id }) => (
                        <input
                          id={id}
                          type="number"
                          min={1}
                          max={99}
                          value={stop.sequence}
                          onChange={(e) =>
                            updateStop(vIdx, sIdx, {
                              sequence: e.target.value,
                            })
                          }
                          style={inputStyle}
                        />
                      )}
                    />
                    <FormField
                      label="거래처명"
                      render={({ id }) => (
                        <input
                          id={id}
                          value={stop.partnerName}
                          onChange={(e) =>
                            updateStop(vIdx, sIdx, {
                              partnerName: e.target.value,
                            })
                          }
                          placeholder="예: 현대공조"
                          maxLength={200}
                          style={inputStyle}
                        />
                      )}
                    />
                    <FormField
                      label="전표번호 (옵션)"
                      render={({ id }) => (
                        <input
                          id={id}
                          type="number"
                          value={stop.kakaoSeq}
                          onChange={(e) =>
                            updateStop(vIdx, sIdx, {
                              kakaoSeq: e.target.value,
                            })
                          }
                          placeholder="예: 1001"
                          style={inputStyle}
                        />
                      )}
                    />
                  </div>

                  <FormField
                    label="주소"
                    required
                    render={({ id }) => (
                      <input
                        id={id}
                        value={stop.address}
                        onChange={(e) =>
                          updateStop(vIdx, sIdx, { address: e.target.value })
                        }
                        placeholder="예: 서울 강남구 역삼동 123-45"
                        maxLength={500}
                        style={inputStyle}
                      />
                    )}
                  />

                  <FormField
                    label="메모 (도착시각 / 품목 등)"
                    render={({ id }) => (
                      <textarea
                        id={`notes-${vIdx}-${sIdx}`}
                        // FormField 의 generated id 무시 — 외부 focus 위해 stable id 사용
                        aria-labelledby={id}
                        value={stop.notes}
                        onChange={(e) =>
                          updateStop(vIdx, sIdx, { notes: e.target.value })
                        }
                        placeholder="예: 10시 도착 / 품목: 야상 1톤"
                        maxLength={1000}
                        rows={2}
                        style={{ ...inputStyle, resize: 'vertical' }}
                      />
                    )}
                  />
                </div>
              ))}
            </Card>
          ))}

          <Button variant="secondary" size="sm" onClick={addVehicle}>
            + 차량 추가
          </Button>

          {saveErrorMessage ? (
            <div
              className="error-banner"
              role="alert"
              style={{ marginTop: 16 }}
            >
              {saveErrorMessage}
            </div>
          ) : null}

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              marginTop: 24,
            }}
          >
            <Button variant="ghost" onClick={() => navigate('/')}>
              취소
            </Button>
            <Button
              data-testid="arologis-manual-submit-button"
              variant="primary"
              onClick={handleSave}
              loading={saveMutation.isPending}
            >
              저장
            </Button>
          </div>
        </Card>
      </div>
    </>
  )
}

const inputStyle = {
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid var(--color-neutral-300)',
  fontSize: 14,
  width: '100%',
} as const
