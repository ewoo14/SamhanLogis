/**
 * DriverManagementPage — F4 — 기사 마스터 (phoneNumber 사전 등록).
 *
 * D-AX-09 (passwordless) 의 사전 등록 화면:
 * - admin (AROLOGIS_MASTER / AROLOGIS_MANAGER) 만 진입.
 * - phoneNumber 가 활성 기사 목록에 있어야 모바일에서 로그인 가능.
 *
 * 기능:
 * - 목록 조회 (`GET /admin/arologis/drivers`)
 * - 신규 등록 (driverCode + phoneNumber + vehicleType + name)
 * - Soft Delete (PR 가드: confirm 모달)
 *
 * UUID 비공개 가드 — DriverDto.id 는 화면에 표시하지 않는다. driverCode / phoneNumber / name 만 노출.
 *
 * 본 슬라이스는 F4 의 MVP: 목록 + 신규 등록 + 삭제. PATCH 편집은 후속 슬라이스에서 추가 가능.
 */
import { useState, type FormEvent } from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  createDriver,
  deleteDriver,
  listDrivers,
  type CreateDriverRequest,
  type DriverDto,
} from '../../api/arologis'
import { canManageDrivers, useAuthStore } from '../../stores/authStore'

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  marginTop: 16,
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
}

const cellStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid var(--color-border)',
  textAlign: 'left',
  fontSize: 'var(--font-size-base)',
}

const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  border: '1px solid var(--color-border)',
  borderRadius: 4,
  fontSize: 'var(--font-size-base)',
  width: '100%',
}

const primaryButton: React.CSSProperties = {
  padding: '8px 14px',
  background: 'var(--color-primary)',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  fontWeight: 600,
  fontSize: 'var(--font-size-base)',
  cursor: 'pointer',
}

const dangerButton: React.CSSProperties = {
  padding: '6px 10px',
  background: 'transparent',
  color: 'var(--color-danger)',
  border: '1px solid var(--color-danger)',
  borderRadius: 4,
  fontSize: 'var(--font-size-base)',
  cursor: 'pointer',
}

export function DriverManagementPage(): JSX.Element {
  const auth = useAuthStore((s) => s.auth)
  const canManage = canManageDrivers(auth?.role)
  const queryClient = useQueryClient()

  const { data: drivers, isLoading, error } = useQuery({
    queryKey: ['arologis', 'drivers'],
    queryFn: listDrivers,
  })

  const [form, setForm] = useState<CreateDriverRequest>({
    driverCode: '',
    phoneNumber: '',
    vehicleType: '',
    name: '',
  })
  const [formError, setFormError] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: (body: CreateDriverRequest) => createDriver(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['arologis', 'drivers'] })
      setForm({ driverCode: '', phoneNumber: '', vehicleType: '', name: '' })
      setFormError(null)
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { message?: string } } })
          ?.response?.data?.message
        ?? '기사 등록 중 오류가 발생했습니다.'
      setFormError(message)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (driverCode: string) => deleteDriver(driverCode),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['arologis', 'drivers'] })
    },
  })

  const handleCreateSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (!canManage) return
    if (
      !form.driverCode.trim()
      || !form.phoneNumber.trim()
      || !form.vehicleType.trim()
      || !form.name.trim()
    ) {
      setFormError('모든 필드를 입력해 주세요.')
      return
    }
    createMutation.mutate({
      driverCode: form.driverCode.trim(),
      phoneNumber: form.phoneNumber.trim(),
      vehicleType: form.vehicleType.trim(),
      name: form.name.trim(),
    })
  }

  const handleDelete = (driver: DriverDto): void => {
    if (!canManage) return
    const ok = window.confirm(
      `기사 [${driver.driverCode}] ${driver.name} 을(를) 비활성화 처리하시겠습니까?\n비활성화된 기사는 모바일 로그인이 차단됩니다.`,
    )
    if (!ok) return
    deleteMutation.mutate(driver.driverCode)
  }

  return (
    <section>
      <h1 style={{ fontSize: 'var(--font-size-xl)', marginTop: 0 }}>기사 관리</h1>
      <p style={{ color: 'var(--color-text-muted)', marginTop: 0 }}>
        모바일 어플의 휴대번호 로그인 (passwordless) 은 본 화면에서 사전 등록된
        기사만 허용됩니다.
      </p>

      {canManage && (
        <form
          onSubmit={handleCreateSubmit}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr) auto',
            gap: 8,
            alignItems: 'end',
            marginBottom: 16,
            padding: 16,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 4,
          }}
          aria-label="기사 신규 등록"
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 'var(--font-size-base)' }}>기사 코드</span>
            <input
              type="text"
              value={form.driverCode}
              onChange={(e) => setForm({ ...form, driverCode: e.target.value })}
              required
              style={inputStyle}
              data-testid="driver-form-code"
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 'var(--font-size-base)' }}>휴대번호</span>
            <input
              type="tel"
              value={form.phoneNumber}
              onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
              placeholder="010-0000-0000"
              required
              style={inputStyle}
              data-testid="driver-form-phone"
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 'var(--font-size-base)' }}>차량 유형</span>
            <input
              type="text"
              value={form.vehicleType}
              onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}
              required
              style={inputStyle}
              data-testid="driver-form-vehicle"
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 'var(--font-size-base)' }}>성함</span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              style={inputStyle}
              data-testid="driver-form-name"
            />
          </label>
          <button
            type="submit"
            disabled={createMutation.isPending}
            style={primaryButton}
            data-testid="driver-form-submit"
          >
            {createMutation.isPending ? '등록 중…' : '신규 등록'}
          </button>
          {formError && (
            <p
              role="alert"
              data-testid="driver-form-error"
              style={{
                gridColumn: '1 / -1',
                color: 'var(--color-danger)',
                margin: 0,
              }}
            >
              {formError}
            </p>
          )}
        </form>
      )}

      {isLoading && <p>기사 목록을 불러오는 중…</p>}
      {error && (
        <p role="alert" style={{ color: 'var(--color-danger)' }}>
          기사 목록을 불러오지 못했습니다.
        </p>
      )}

      {drivers && (
        <table style={tableStyle} data-testid="driver-table">
          <thead>
            <tr>
              <th style={{ ...cellStyle, fontWeight: 600 }}>기사 코드</th>
              <th style={{ ...cellStyle, fontWeight: 600 }}>성함</th>
              <th style={{ ...cellStyle, fontWeight: 600 }}>휴대번호</th>
              <th style={{ ...cellStyle, fontWeight: 600 }}>차량 유형</th>
              <th style={{ ...cellStyle, fontWeight: 600 }}>어플</th>
              <th style={{ ...cellStyle, fontWeight: 600, width: 120 }}>관리</th>
            </tr>
          </thead>
          <tbody>
            {drivers.length === 0 && (
              <tr>
                <td colSpan={6} style={{ ...cellStyle, textAlign: 'center' }}>
                  등록된 기사가 없습니다.
                </td>
              </tr>
            )}
            {drivers.map((d) => (
              <tr key={d.driverCode}>
                <td style={cellStyle}>{d.driverCode}</td>
                <td style={cellStyle}>{d.name}</td>
                <td style={cellStyle}>{d.phoneNumber}</td>
                <td style={cellStyle}>{d.vehicleType}</td>
                <td style={cellStyle}>
                  {d.appInstalled ? '설치됨' : '미설치'}
                </td>
                <td style={cellStyle}>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => handleDelete(d)}
                      style={dangerButton}
                      data-testid={`driver-delete-${d.driverCode}`}
                    >
                      비활성화
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
