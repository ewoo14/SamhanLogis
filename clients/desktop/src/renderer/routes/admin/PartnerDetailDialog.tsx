/**
 * 거래처 상세 다이얼로그 — 4탭 read-only + 인라인 편집.
 *
 * <p>PartnerListPage(PartnersPage) 의 행 클릭 시 열립니다.
 * 탭 구성:
 * <ul>
 *   <li>탭 1: 기본정보</li>
 *   <li>탭 2: 단가/할인 정책</li>
 *   <li>탭 3: 배송지 목록</li>
 *   <li>탭 4: 담당자 목록</li>
 * </ul>
 *
 * <p>read-only 기본 → [편집] 버튼 클릭 시 인라인 수정 모드 전환.
 * 수정 완료 후 [저장] → PATCH /api/v1/partners/{id}/full.
 *
 * <p>UUID 비공개 — 화면 노출: partnerCode / businessName 만.
 *
 * data-testid:
 * - partner-detail-dialog
 * - partner-detail-tab-{0~3}
 * - partner-detail-edit-btn
 * - partner-detail-save-btn
 * - partner-detail-cancel-edit-btn
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Modal,
  Tabs,
  Button,
  Input,
  Card,
  Badge,
} from '@samhan/design-system'
import {
  getPartnerFull,
  updatePartnerFull,
  type PartnerFullRequest,
  type PartnerShippingAddressRequest,
  type PartnerContactRequest,
  type PartnerFullResponse,
} from '../../api/partnerApi'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PartnerDetailDialogProps {
  /**
   * 거래처 식별자 — partnerCode (사용자 노출 식별자, BE path variable 과 일치).
   * 이전에 partnerId (UUID) 로 명명되었으나 BE Controller 가 partnerCode 를 받으므로
   * TM PR #141 cross-check 에서 정정 (UUID 비공개 가드).
   */
  partnerId: string | null
  /** 거래처 이름 — 모달 title 에만 노출. */
  partnerName: string | null
  open: boolean
  onClose: () => void
}

// ---------------------------------------------------------------------------
// 포맷 헬퍼
// ---------------------------------------------------------------------------

function formatKrw(v: number | null | undefined): string {
  if (v === null || v === undefined) return '미설정'
  return '₩' + Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

const TABS = ['기본정보', '단가/할인 정책', '배송지', '담당자'] as const

// ---------------------------------------------------------------------------
// 컴포넌트
// ---------------------------------------------------------------------------

export function PartnerDetailDialog({
  partnerId,
  partnerName,
  open,
  onClose,
}: PartnerDetailDialogProps) {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState(0)
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState<PartnerFullRequest | null>(
    null,
  )
  const [saveError, setSaveError] = useState<string | null>(null)

  const query = useQuery({
    queryKey: ['partner', 'full', partnerId],
    queryFn: () => getPartnerFull(partnerId!),
    enabled: !!partnerId && open,
    staleTime: 30_000,
  })

  const mutation = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string
      body: PartnerFullRequest
    }) => updatePartnerFull(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partner', 'full', partnerId] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'partners'] })
      setEditing(false)
      setSaveError(null)
    },
    onError: (err: unknown) => {
      setSaveError(
        err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.',
      )
    },
  })

  function startEdit(data: PartnerFullResponse) {
    // BE PartnerFullRequest (flat) 와 1:1 매핑 — basic 객체로 wrap 하지 않음.
    setEditData({
      partnerCode: data.basic.partnerCode,
      bizNo: data.basic.bizNo,
      name: data.basic.name,
      priceDiscount: {
        basicDiscountRate: data.priceDiscount.basicDiscountRate,
        paymentTermDays: data.priceDiscount.paymentTermDays ?? null,
        discountMemo: data.priceDiscount.discountMemo ?? null,
      },
      shippingAddresses: (data.shippingAddresses ?? []).map((a) => ({
        alias: a.alias ?? '',
        zipCode: a.zipCode ?? '',
        address: a.address,
        phone: a.phone ?? '',
        receiverName: a.receiverName ?? '',
        isDefault: a.isDefault,
        memo: a.memo ?? '',
      })),
      contacts: (data.contacts ?? []).map((c) => ({
        contactName: c.contactName,
        position: c.position ?? '',
        phone: c.phone ?? '',
        email: c.email ?? '',
        isPrimary: c.isPrimary,
        memo: c.memo ?? '',
      })),
    })
    setEditing(true)
    setSaveError(null)
  }

  function cancelEdit() {
    setEditing(false)
    setEditData(null)
    setSaveError(null)
  }

  function handleSave() {
    if (!partnerId || !editData) return
    mutation.mutate({ id: partnerId, body: editData })
  }

  const footerContent = query.data ? (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
      {editing ? (
        <>
          <Button
            variant="secondary"
            size="sm"
            onClick={cancelEdit}
            data-testid="partner-detail-cancel-edit-btn"
          >
            취소
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={mutation.isPending}
            onClick={handleSave}
            data-testid="partner-detail-save-btn"
          >
            저장
          </Button>
        </>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => startEdit(query.data)}
          data-testid="partner-detail-edit-btn"
        >
          편집
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={onClose}>
        닫기
      </Button>
    </div>
  ) : (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <Button variant="ghost" size="sm" onClick={onClose}>
        닫기
      </Button>
    </div>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        partnerName
          ? `거래처 상세 — ${partnerName}`
          : '거래처 상세'
      }
      size="lg"
      footer={footerContent}
      data-testid="partner-detail-dialog"
    >
      {query.isLoading ? (
        <p style={{ textAlign: 'center', padding: '32px 0', fontSize: 13 }}>
          불러오는 중...
        </p>
      ) : query.isError ? (
        <p
          role="alert"
          style={{ color: 'var(--state-danger-text)', fontSize: 13 }}
        >
          데이터를 불러오지 못했습니다. 다시 시도하세요.
        </p>
      ) : query.data ? (
        <>
          {saveError ? (
            <div
              role="alert"
              style={{
                marginBottom: 12,
                padding: '8px 12px',
                background: 'var(--state-danger-bg)',
                border: '1px solid var(--state-danger-border)',
                borderRadius: 6,
                color: 'var(--state-danger-text)',
                fontSize: 13,
              }}
            >
              {saveError}
            </div>
          ) : null}
          <Tabs
            tabs={TABS}
            activeIndex={activeTab}
            onTabChange={setActiveTab}
            ariaLabel="거래처 상세 탭"
          >
            {/* 탭 1: 기본정보 */}
            <DetailBasicTab
              data={query.data}
              editing={editing}
              editData={editData}
              onChange={(patch) =>
                setEditData((prev) => (prev ? { ...prev, ...patch } : prev))
              }
            />

            {/* 탭 2: 단가/할인 */}
            <DetailPriceTab
              data={query.data}
              editing={editing}
              editData={editData}
              onChange={(patch) =>
                setEditData((prev) =>
                  prev
                    ? {
                        ...prev,
                        priceDiscount: {
                          basicDiscountRate:
                            prev.priceDiscount?.basicDiscountRate ?? 0,
                          paymentTermDays:
                            prev.priceDiscount?.paymentTermDays ?? null,
                          discountMemo:
                            prev.priceDiscount?.discountMemo ?? null,
                          ...patch,
                        },
                      }
                    : prev,
                )
              }
            />

            {/* 탭 3: 배송지 */}
            <DetailShippingTab
              data={query.data}
              editing={editing}
              editData={editData}
              onChange={(addresses) =>
                setEditData((prev) =>
                  prev ? { ...prev, shippingAddresses: addresses } : prev,
                )
              }
            />

            {/* 탭 4: 담당자 */}
            <DetailContactTab
              data={query.data}
              editing={editing}
              editData={editData}
              onChange={(contacts) =>
                setEditData((prev) =>
                  prev ? { ...prev, contacts } : prev,
                )
              }
            />
          </Tabs>
        </>
      ) : null}
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// 탭 1 — 기본정보 (read-only / edit)
// ---------------------------------------------------------------------------

function DetailBasicTab({
  data,
  editing,
  editData,
  onChange,
}: {
  data: PartnerFullResponse
  editing: boolean
  editData: PartnerFullRequest | null
  onChange: (patch: Partial<PartnerFullRequest>) => void
}) {
  if (!editing) {
    const b = data.basic
    return (
      <Card variant="outlined" shadow="none" padding={3}>
        <dl style={dlStyle}>
          <ReadRow label="거래처 코드" value={b.partnerCode} />
          <ReadRow label="거래처명" value={b.name} />
          <ReadRow label="사업자등록번호" value={b.bizNo} />
          <ReadRow label="대표자명" value={b.representative} />
          <ReadRow label="업태" value={b.businessType} />
          <ReadRow label="종목" value={b.industry} />
          <ReadRow label="사업장 주소" value={b.address} />
          <ReadRow label="대표 연락처" value={b.phone} />
          <ReadRow label="이메일" value={b.email} />
          <ReadRow label="휴대전화" value={b.mobile} />
          <ReadRow label="거래처 분류1" value={b.partnerGroup1} />
          <ReadRow label="거래처 분류2" value={b.partnerGroup2} />
        </dl>
      </Card>
    )
  }

  const f = editData
  if (!f) return null

  // BE PartnerFullRequest 가 PATCH 시 name 만 반영 (Partner4TabService.updateFull 참조).
  // representative/businessType/industry 등 부가 필드 수정은 별도 admin endpoint 사용.
  return (
    <Card variant="outlined" shadow="none" padding={3}>
      <div style={gridStyle}>
        <Input
          label="거래처명"
          required
          value={f.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <Input
          label="사업자등록번호"
          value={f.bizNo ?? ''}
          disabled
          hint="등록 후 변경 불가"
        />
        <div style={{ gridColumn: '1 / -1' }}>
          <p
            style={{
              fontSize: 12,
              color: 'var(--ink-tertiary)',
              margin: 0,
            }}
          >
            대표자/업태/종목/주소 등 부가 정보는 거래처 관리 메뉴에서 수정합니다.
          </p>
        </div>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// 탭 2 — 단가/할인 (read-only / edit)
// ---------------------------------------------------------------------------

function DetailPriceTab({
  data,
  editing,
  editData,
  onChange,
}: {
  data: PartnerFullResponse
  editing: boolean
  editData: PartnerFullRequest | null
  onChange: (
    patch: Partial<NonNullable<PartnerFullRequest['priceDiscount']>>,
  ) => void
}) {
  if (!editing) {
    const p = data.priceDiscount
    return (
      <Card variant="outlined" shadow="none" padding={3}>
        <dl style={dlStyle}>
          <ReadRow
            label="기본 할인율"
            value={`${p.basicDiscountRate ?? 0}%`}
          />
          <ReadRow
            label="결제 기간"
            value={
              p.paymentTermDays !== null
                ? `${p.paymentTermDays}일`
                : '미설정'
            }
          />
          <ReadRow
            label="신용한도"
            value={formatKrw(data.basic.creditLimit ?? null)}
          />
          <ReadRow label="비고" value={p.discountMemo} />
        </dl>
      </Card>
    )
  }

  const f = editData?.priceDiscount
  if (!f) return null

  return (
    <Card variant="outlined" shadow="none" padding={3}>
      <div style={gridStyle}>
        <Input
          label="기본 할인율 (%)"
          type="number"
          min={0}
          max={100}
          step={0.1}
          value={String(f.basicDiscountRate ?? 0)}
          onChange={(e) =>
            onChange({ basicDiscountRate: Number.parseFloat(e.target.value) })
          }
        />
        <Input
          label="결제 기간 (일)"
          type="number"
          min={0}
          step={1}
          value={f.paymentTermDays !== null && f.paymentTermDays !== undefined
            ? String(f.paymentTermDays)
            : ''}
          onChange={(e) =>
            onChange({
              paymentTermDays: e.target.value
                ? Number.parseInt(e.target.value, 10)
                : null,
            })
          }
        />
        <Input
          label="비고"
          value={f.discountMemo ?? ''}
          onChange={(e) => onChange({ discountMemo: e.target.value })}
          style={{ gridColumn: '1 / -1' }}
        />
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// 탭 3 — 배송지 (read-only / edit)
// ---------------------------------------------------------------------------

function DetailShippingTab({
  data,
  editing,
  editData,
  onChange,
}: {
  data: PartnerFullResponse
  editing: boolean
  editData: PartnerFullRequest | null
  onChange: (list: PartnerShippingAddressRequest[]) => void
}) {
  if (!editing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {(data.shippingAddresses?.length ?? 0) === 0 ? (
          <p style={emptyStyle}>등록된 배송지가 없습니다.</p>
        ) : (
          (data.shippingAddresses ?? []).map((a) => (
            <Card key={a.id} variant="outlined" shadow="none" padding={3}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  {a.alias ?? '(별칭 없음)'}
                </span>
                {a.isDefault ? (
                  <Badge variant="brand">기본</Badge>
                ) : null}
              </div>
              <dl style={dlStyle}>
                <ReadRow label="우편번호" value={a.zipCode} />
                <ReadRow label="주소" value={a.address} />
                <ReadRow label="연락처" value={a.phone} />
                <ReadRow label="수신담당자" value={a.receiverName} />
              </dl>
            </Card>
          ))
        )}
      </div>
    )
  }

  const list = editData?.shippingAddresses ?? []

  function addRow() {
    onChange([
      ...list,
      {
        alias: '',
        zipCode: '',
        address: '',
        phone: '',
        receiverName: '',
        isDefault: false,
        memo: '',
      },
    ])
  }
  function deleteRow(idx: number) {
    onChange(list.filter((_, i) => i !== idx))
  }
  function setRow(idx: number, patch: Partial<PartnerShippingAddressRequest>) {
    onChange(list.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }
  function setDefault(idx: number) {
    onChange(list.map((r, i) => ({ ...r, isDefault: i === idx })))
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button variant="secondary" size="sm" onClick={addRow}>
          배송지 추가
        </Button>
      </div>
      {list.length === 0 ? (
        <p style={emptyStyle}>등록된 배송지가 없습니다.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {list.map((row, idx) => (
            <Card key={idx} variant="outlined" shadow="none" padding={3}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>배송지 {idx + 1}</span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="edit-default-address"
                      checked={row.isDefault}
                      onChange={() => setDefault(idx)}
                    />
                    기본 배송지
                  </label>
                  <Button variant="danger" size="sm" onClick={() => deleteRow(idx)}>
                    삭제
                  </Button>
                </div>
              </div>
              <div style={gridStyle}>
                <Input
                  label="별칭"
                  required
                  value={row.alias ?? ''}
                  onChange={(e) => setRow(idx, { alias: e.target.value })}
                />
                <Input
                  label="연락처"
                  value={row.phone ?? ''}
                  onChange={(e) => setRow(idx, { phone: e.target.value })}
                />
                <Input
                  label="우편번호"
                  value={row.zipCode ?? ''}
                  onChange={(e) => setRow(idx, { zipCode: e.target.value })}
                />
                <Input
                  label="수신담당자"
                  value={row.receiverName ?? ''}
                  onChange={(e) =>
                    setRow(idx, { receiverName: e.target.value })
                  }
                />
                <Input
                  label="주소"
                  required
                  value={row.address}
                  onChange={(e) => setRow(idx, { address: e.target.value })}
                  style={{ gridColumn: '1 / -1' }}
                />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 탭 4 — 담당자 (read-only / edit)
// ---------------------------------------------------------------------------

function DetailContactTab({
  data,
  editing,
  editData,
  onChange,
}: {
  data: PartnerFullResponse
  editing: boolean
  editData: PartnerFullRequest | null
  onChange: (list: PartnerContactRequest[]) => void
}) {
  if (!editing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {(data.contacts?.length ?? 0) === 0 ? (
          <p style={emptyStyle}>등록된 담당자가 없습니다.</p>
        ) : (
          (data.contacts ?? []).map((c) => (
            <Card key={c.id} variant="outlined" shadow="none" padding={3}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  {c.contactName}
                </span>
                {c.position ? (
                  <span style={{ fontSize: 12, color: 'var(--ink-tertiary)' }}>
                    {c.position}
                  </span>
                ) : null}
                {c.isPrimary ? (
                  <Badge variant="success">주 담당자</Badge>
                ) : null}
              </div>
              <dl style={dlStyle}>
                <ReadRow label="휴대전화" value={c.phone} />
                <ReadRow label="이메일" value={c.email} />
                <ReadRow label="비고" value={c.memo} />
              </dl>
            </Card>
          ))
        )}
      </div>
    )
  }

  const list = editData?.contacts ?? []

  function addRow() {
    onChange([
      ...list,
      {
        contactName: '',
        position: '',
        phone: '',
        email: '',
        isPrimary: false,
        memo: '',
      },
    ])
  }
  function deleteRow(idx: number) {
    onChange(list.filter((_, i) => i !== idx))
  }
  function setRow(idx: number, patch: Partial<PartnerContactRequest>) {
    onChange(list.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }
  function setPrimary(idx: number) {
    onChange(list.map((r, i) => ({ ...r, isPrimary: i === idx })))
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button variant="secondary" size="sm" onClick={addRow}>
          담당자 추가
        </Button>
      </div>
      {list.length === 0 ? (
        <p style={emptyStyle}>등록된 담당자가 없습니다.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {list.map((row, idx) => (
            <Card key={idx} variant="outlined" shadow="none" padding={3}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>담당자 {idx + 1}</span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="edit-primary-contact"
                      checked={row.isPrimary}
                      onChange={() => setPrimary(idx)}
                    />
                    주 담당자
                  </label>
                  <Button variant="danger" size="sm" onClick={() => deleteRow(idx)}>
                    삭제
                  </Button>
                </div>
              </div>
              <div style={gridStyle}>
                <Input
                  label="이름"
                  required
                  value={row.contactName}
                  onChange={(e) => setRow(idx, { contactName: e.target.value })}
                />
                <Input
                  label="직책"
                  value={row.position ?? ''}
                  onChange={(e) => setRow(idx, { position: e.target.value })}
                />
                <Input
                  label="휴대전화"
                  required
                  value={row.phone ?? ''}
                  onChange={(e) => setRow(idx, { phone: e.target.value })}
                />
                <Input
                  label="이메일"
                  type="email"
                  value={row.email ?? ''}
                  onChange={(e) => setRow(idx, { email: e.target.value })}
                />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 공통 read-only 행
// ---------------------------------------------------------------------------

function ReadRow({
  label,
  value,
}: {
  label: string
  value: string | null | undefined
}) {
  return (
    <>
      <dt
        style={{
          fontSize: 12,
          color: 'var(--ink-tertiary)',
          fontWeight: 500,
          minWidth: 120,
        }}
      >
        {label}
      </dt>
      <dd
        style={{
          fontSize: 13,
          color: 'var(--ink-primary)',
          margin: 0,
        }}
      >
        {value ?? '—'}
      </dd>
    </>
  )
}

// ---------------------------------------------------------------------------
// 공통 스타일
// ---------------------------------------------------------------------------

const dlStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'max-content 1fr',
  gap: '8px 20px',
  margin: 0,
}

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: 16,
}

const emptyStyle: React.CSSProperties = {
  textAlign: 'center',
  color: 'var(--ink-tertiary)',
  fontSize: 13,
  padding: '32px 0',
}
