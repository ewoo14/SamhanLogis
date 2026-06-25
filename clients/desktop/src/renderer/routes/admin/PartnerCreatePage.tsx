/**
 * 관리자 — 거래처 신규 등록 (`/admin/partners/new`).
 *
 * <p>4탭 폼 — design-system Tabs 사용 (자체 Tabs 컴포넌트 작성 금지).
 * <ul>
 *   <li>탭 1: 기본정보 — code(자동)/상호/사업자번호/주소/유형</li>
 *   <li>탭 2: 단가/할인 정책 — 기본할인율(%)/결제기간(일)/신용한도(원)</li>
 *   <li>탭 3: 배송지 — 다중(alias/address/phone/기본여부) Add/Delete</li>
 *   <li>탭 4: 담당자 — 다중(name/position/phone/email/주담당자) Add/Delete</li>
 * </ul>
 *
 * <p>@PreAuthorize — SALES / MANAGER / MASTER (BE 와 1:1).
 *
 * <p>UUID 비공개 — 사용자 노출 식별자 = partnerCode / businessName 만.
 *
 * data-testid:
 * - partner-create-tab-{0~3}
 * - partner-create-submit
 * - partner-create-basic-name
 * - partner-create-basic-bizno
 * - partner-create-basic-type
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Tabs, Button, Input, Card, FormGrid, type TabItem } from '@samhan/design-system'
import {
  createPartnerFull,
  PARTNER_TYPE_LABEL,
  type PartnerFullRequest,
  type PartnerShippingAddressRequest,
  type PartnerContactRequest,
  type PartnerType,
} from '../../api/partnerApi'
import { usePageTitle } from '../../hooks/usePageTitle'

// ---------------------------------------------------------------------------
// 내부 로컬 상태 타입
// ---------------------------------------------------------------------------

interface BasicForm {
  businessName: string
  businessNumber: string
  address: string
  type: PartnerType
  ceoName: string
  businessCategory: string
  businessItem: string
  taxEmail: string
  memo: string
}

interface PriceDiscountForm {
  basicDiscount: string
  paymentTermDays: string
  creditLimit: string
}

const TABS: TabItem[] = [
  { label: '기본정보', testId: 'partner-tab-1' },
  { label: '단가/할인 정책', testId: 'partner-tab-2' },
  { label: '배송지', testId: 'partner-tab-3' },
  { label: '담당자', testId: 'partner-tab-4' },
]

const EMPTY_BASIC: BasicForm = {
  businessName: '',
  businessNumber: '',
  address: '',
  type: 'CUSTOMER',
  ceoName: '',
  businessCategory: '',
  businessItem: '',
  taxEmail: '',
  memo: '',
}

const EMPTY_PRICE: PriceDiscountForm = {
  basicDiscount: '0',
  paymentTermDays: '30',
  creditLimit: '',
}

const EMPTY_ADDRESS: PartnerShippingAddressRequest = {
  alias: '',
  zipCode: '',
  address: '',
  phone: '',
  receiverName: '',
  isDefault: false,
  memo: '',
}

const EMPTY_CONTACT: PartnerContactRequest = {
  contactName: '',
  position: '',
  phone: '',
  email: '',
  isPrimary: false,
  memo: '',
}

// ---------------------------------------------------------------------------
// 유효성 검사
// ---------------------------------------------------------------------------

function validateBasic(f: BasicForm): string | null {
  if (!f.businessName.trim()) return '거래처명을 입력하세요.'
  if (!f.businessNumber.trim()) return '사업자등록번호를 입력하세요.'
  if (!/^\d{3}-\d{2}-\d{5}$/.test(f.businessNumber.trim()))
    return '사업자등록번호 형식이 올바르지 않습니다. (예: 123-45-67890)'
  return null
}

function validatePrice(f: PriceDiscountForm): string | null {
  const discount = Number.parseFloat(f.basicDiscount)
  if (Number.isNaN(discount) || discount < 0 || discount > 100)
    return '기본 할인율은 0~100 사이 숫자여야 합니다.'
  const days = Number.parseInt(f.paymentTermDays, 10)
  if (Number.isNaN(days) || days < 0)
    return '결제 기간(일수)은 0 이상 정수여야 합니다.'
  if (f.creditLimit) {
    const limit = Number.parseFloat(f.creditLimit)
    if (Number.isNaN(limit) || limit < 0)
      return '신용한도는 0 이상 숫자여야 합니다.'
  }
  return null
}

function validateAddresses(
  list: PartnerShippingAddressRequest[],
): string | null {
  for (const [i, a] of list.entries()) {
    if (!a.alias?.trim()) return `배송지 ${i + 1}: 별칭을 입력하세요.`
    if (!a.address.trim()) return `배송지 ${i + 1}: 주소를 입력하세요.`
  }
  return null
}

function validateContacts(list: PartnerContactRequest[]): string | null {
  for (const [i, c] of list.entries()) {
    if (!c.contactName.trim()) return `담당자 ${i + 1}: 이름을 입력하세요.`
    if (!c.phone?.trim()) return `담당자 ${i + 1}: 휴대전화를 입력하세요.`
  }
  const primaryCount = list.filter((c) => c.isPrimary).length
  if (list.length > 0 && primaryCount === 0)
    return '주 담당자를 1명 지정하세요.'
  if (primaryCount > 1) return '주 담당자는 1명만 지정할 수 있습니다.'
  return null
}

// ---------------------------------------------------------------------------
// 컴포넌트
// ---------------------------------------------------------------------------

export function PartnerCreatePage() {
  usePageTitle('거래처 신규 등록')
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [activeTab, setActiveTab] = useState(0)
  const [basic, setBasic] = useState<BasicForm>(EMPTY_BASIC)
  const [price, setPrice] = useState<PriceDiscountForm>(EMPTY_PRICE)
  const [addresses, setAddresses] = useState<PartnerShippingAddressRequest[]>(
    [],
  )
  const [contacts, setContacts] = useState<PartnerContactRequest[]>([])
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: createPartnerFull,
    onSuccess: (result) => {
      // 목록 캐시 무효화
      queryClient.invalidateQueries({ queryKey: ['admin', 'partners'] })
      navigate(`/admin/partners`, {
        state: { createdPartnerCode: result.basic.partnerCode },
      })
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error ? err.message : '등록 중 오류가 발생했습니다.'
      setError(msg)
    },
  })

  function handleSubmit() {
    setError(null)

    const basicErr = validateBasic(basic)
    if (basicErr) {
      setActiveTab(0)
      setError(basicErr)
      return
    }
    const priceErr = validatePrice(price)
    if (priceErr) {
      setActiveTab(1)
      setError(priceErr)
      return
    }
    const addrErr = validateAddresses(addresses)
    if (addrErr) {
      setActiveTab(2)
      setError(addrErr)
      return
    }
    const contactErr = validateContacts(contacts)
    if (contactErr) {
      setActiveTab(3)
      setError(contactErr)
      return
    }

    // BE PartnerFullRequest record (flat) 와 1:1 매핑.
    // BE 가 partnerCode 미입력 시 자동 생성하지 않으므로 임시 timestamp 기반 코드 부여 (실서버 수신 후
    // 정식 코드 채번 정책은 partner-service 측에서 후속 정의 예정 — 현재 슬라이스 외 영역).
    const autoPartnerCode = `P-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`

    const body: PartnerFullRequest = {
      partnerCode: autoPartnerCode,
      bizNo: basic.businessNumber.trim(),
      name: basic.businessName.trim(),
      priceDiscount: {
        basicDiscountRate: Number.parseFloat(price.basicDiscount),
        paymentTermDays: Number.parseInt(price.paymentTermDays, 10),
        // BE PartnerPriceDiscountRequest 에 creditLimit 필드 없음 — Partner 본체의 creditLimit 는
        // 별도 admin endpoint 에서 관리 (관리자 메뉴). 여기서는 discountMemo 만 전달.
        discountMemo: basic.memo.trim() || null,
      },
      shippingAddresses: addresses.map((a) => ({
        alias: a.alias?.trim() || null,
        zipCode: a.zipCode?.trim() || null,
        address: a.address.trim(),
        phone: a.phone?.trim() || null,
        receiverName: a.receiverName?.trim() || null,
        isDefault: a.isDefault,
        memo: a.memo?.trim() || null,
      })),
      contacts: contacts.map((c) => ({
        contactName: c.contactName.trim(),
        position: c.position?.trim() || null,
        phone: c.phone?.trim() || null,
        email: c.email?.trim() || null,
        isPrimary: c.isPrimary,
        memo: c.memo?.trim() || null,
      })),
    }

    mutation.mutate(body)
  }

  return (
    <form
      data-testid="partner-create-form"
      style={{ maxWidth: 800 }}
      onSubmit={(e) => {
        e.preventDefault()
        handleSubmit()
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
        }}
      >
        <h3 style={{ margin: 0 }}>거래처 신규 등록</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/admin/partners')}
          >
            취소
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={mutation.isPending}
            onClick={handleSubmit}
            data-testid="partner-create-submit"
          >
            등록
          </Button>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          style={{
            marginBottom: 16,
            padding: '10px 14px',
            background: 'var(--state-danger-bg)',
            border: '1px solid var(--state-danger-border)',
            borderRadius: 6,
            color: 'var(--state-danger-text)',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : null}

      <Tabs
        tabs={TABS}
        activeIndex={activeTab}
        onTabChange={setActiveTab}
        ariaLabel="거래처 등록 탭"
      >
        {/* 탭 1: 기본정보 */}
        <BasicTab
          value={basic}
          onChange={setBasic}
        />

        {/* 탭 2: 단가/할인 정책 */}
        <PriceDiscountTab
          value={price}
          onChange={setPrice}
        />

        {/* 탭 3: 배송지 */}
        <ShippingAddressTab
          value={addresses}
          onChange={setAddresses}
        />

        {/* 탭 4: 담당자 */}
        <ContactTab
          value={contacts}
          onChange={setContacts}
        />
      </Tabs>
    </form>
  )
}

// ---------------------------------------------------------------------------
// 탭 1 — 기본정보
// ---------------------------------------------------------------------------

function BasicTab({
  value,
  onChange,
}: {
  value: BasicForm
  onChange: (v: BasicForm) => void
}) {
  function set<K extends keyof BasicForm>(k: K, v: BasicForm[K]) {
    onChange({ ...value, [k]: v })
  }

  return (
    <Card variant="outlined" shadow="none" padding={4}>
      <FormGrid columns={2} gap="16px">
        <Input
          label="거래처명"
          required
          placeholder="(주)한국공조"
          value={value.businessName}
          onChange={(e) => set('businessName', e.target.value)}
          data-testid="partner-create-basic-name"
        />
        <Input
          label="사업자등록번호"
          required
          placeholder="123-45-67890"
          value={value.businessNumber}
          onChange={(e) => set('businessNumber', e.target.value)}
          data-testid="partner-create-basic-bizno"
        />
        <div>
          <label style={labelStyle}>
            거래처 유형 <span style={{ color: 'var(--state-danger-text)' }}>*</span>
          </label>
          <select
            value={value.type}
            onChange={(e) => set('type', e.target.value as PartnerType)}
            style={selectStyle}
            data-testid="partner-create-basic-type"
          >
            {(Object.keys(PARTNER_TYPE_LABEL) as PartnerType[]).map((t) => (
              <option key={t} value={t}>
                {PARTNER_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <Input
          label="대표자명"
          placeholder="홍길동"
          value={value.ceoName}
          onChange={(e) => set('ceoName', e.target.value)}
        />
        <Input
          label="업태"
          placeholder="제조업"
          value={value.businessCategory}
          onChange={(e) => set('businessCategory', e.target.value)}
        />
        <Input
          label="종목"
          placeholder="공조시스템"
          value={value.businessItem}
          onChange={(e) => set('businessItem', e.target.value)}
        />
        <FormGrid.Full>
          <Input
            label="사업장 주소"
            placeholder="서울특별시 강남구 테헤란로 123"
            value={value.address}
            onChange={(e) => set('address', e.target.value)}
          />
        </FormGrid.Full>
        <FormGrid.Full>
          <Input
            label="세금계산서 이메일"
            type="email"
            placeholder="tax@example.com"
            value={value.taxEmail}
            onChange={(e) => set('taxEmail', e.target.value)}
          />
        </FormGrid.Full>
        <FormGrid.Full>
          <label style={labelStyle}>메모</label>
          <textarea
            placeholder="거래처 관련 특이사항 등 자유 입력"
            value={value.memo}
            onChange={(e) => set('memo', e.target.value)}
            rows={3}
            style={textareaStyle}
          />
        </FormGrid.Full>
      </FormGrid>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// 탭 2 — 단가/할인 정책
// ---------------------------------------------------------------------------

function PriceDiscountTab({
  value,
  onChange,
}: {
  value: PriceDiscountForm
  onChange: (v: PriceDiscountForm) => void
}) {
  function set<K extends keyof PriceDiscountForm>(
    k: K,
    v: PriceDiscountForm[K],
  ) {
    onChange({ ...value, [k]: v })
  }

  return (
    <Card variant="outlined" shadow="none" padding={4}>
      <FormGrid columns={2} gap="16px">
        <Input
          label="기본 할인율 (%)"
          type="number"
          min={0}
          max={100}
          step={0.1}
          placeholder="0"
          value={value.basicDiscount}
          onChange={(e) => set('basicDiscount', e.target.value)}
          hint="0 ~ 100 사이 숫자. 단가에서 자동 차감됩니다."
        />
        <Input
          label="결제 기간 (일)"
          type="number"
          min={0}
          step={1}
          placeholder="30"
          value={value.paymentTermDays}
          onChange={(e) => set('paymentTermDays', e.target.value)}
          hint="현금(0), 30일, 60일, 90일, 익월말(99) 등"
        />
        <Input
          label="신용한도 (원)"
          type="number"
          min={0}
          step={1000}
          placeholder="미설정 시 공란"
          value={value.creditLimit}
          onChange={(e) => set('creditLimit', e.target.value)}
          hint="공란 = 한도 미설정"
        />
      </FormGrid>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// 탭 3 — 배송지
// ---------------------------------------------------------------------------

function ShippingAddressTab({
  value,
  onChange,
}: {
  value: PartnerShippingAddressRequest[]
  onChange: (v: PartnerShippingAddressRequest[]) => void
}) {
  function addRow() {
    onChange([...value, { ...EMPTY_ADDRESS }])
  }

  function deleteRow(idx: number) {
    onChange(value.filter((_, i) => i !== idx))
  }

  function setRow(
    idx: number,
    patch: Partial<PartnerShippingAddressRequest>,
  ) {
    onChange(value.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  function setDefault(idx: number) {
    onChange(value.map((r, i) => ({ ...r, isDefault: i === idx })))
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: 12,
        }}
      >
        <Button
          variant="secondary"
          size="sm"
          onClick={addRow}
          data-testid="partner-shipping-address-add-button"
        >
          배송지 추가
        </Button>
      </div>
      {value.length === 0 ? (
        <p
          style={{
            textAlign: 'center',
            color: 'var(--ink-tertiary)',
            fontSize: 13,
            padding: '32px 0',
          }}
        >
          등록된 배송지가 없습니다. 위 [배송지 추가] 버튼으로 추가하세요.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {value.map((row, idx) => (
            <Card key={idx} variant="outlined" shadow="none" padding={3}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 12,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  배송지 {idx + 1}
                </span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <label
                    style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}
                  >
                    <input
                      type="radio"
                      name="default-address"
                      checked={row.isDefault}
                      onChange={() => setDefault(idx)}
                    />
                    기본 배송지
                  </label>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => deleteRow(idx)}
                  >
                    삭제
                  </Button>
                </div>
              </div>
              <FormGrid columns={2} gap="16px">
                <Input
                  label="별칭"
                  required
                  placeholder="본사창고"
                  value={row.alias ?? ''}
                  onChange={(e) => setRow(idx, { alias: e.target.value })}
                />
                <Input
                  label="연락처"
                  placeholder="02-1234-5678"
                  value={row.phone ?? ''}
                  onChange={(e) => setRow(idx, { phone: e.target.value })}
                />
                <Input
                  label="우편번호"
                  placeholder="06234"
                  value={row.zipCode ?? ''}
                  onChange={(e) => setRow(idx, { zipCode: e.target.value })}
                />
                <Input
                  label="수신담당자"
                  placeholder="홍길동"
                  value={row.receiverName ?? ''}
                  onChange={(e) =>
                    setRow(idx, { receiverName: e.target.value })
                  }
                />
                <FormGrid.Full>
                  <Input
                    label="주소"
                    required
                    placeholder="서울특별시 강남구 테헤란로 123"
                    value={row.address}
                    onChange={(e) => setRow(idx, { address: e.target.value })}
                  />
                </FormGrid.Full>
              </FormGrid>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 탭 4 — 담당자
// ---------------------------------------------------------------------------

function ContactTab({
  value,
  onChange,
}: {
  value: PartnerContactRequest[]
  onChange: (v: PartnerContactRequest[]) => void
}) {
  function addRow() {
    onChange([...value, { ...EMPTY_CONTACT }])
  }

  function deleteRow(idx: number) {
    onChange(value.filter((_, i) => i !== idx))
  }

  function setRow(idx: number, patch: Partial<PartnerContactRequest>) {
    onChange(value.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  function setPrimary(idx: number) {
    onChange(value.map((r, i) => ({ ...r, isPrimary: i === idx })))
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: 12,
        }}
      >
        <Button
          variant="secondary"
          size="sm"
          onClick={addRow}
          data-testid="partner-contact-add-button"
        >
          담당자 추가
        </Button>
      </div>
      {value.length === 0 ? (
        <p
          style={{
            textAlign: 'center',
            color: 'var(--ink-tertiary)',
            fontSize: 13,
            padding: '32px 0',
          }}
        >
          등록된 담당자가 없습니다. 위 [담당자 추가] 버튼으로 추가하세요.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {value.map((row, idx) => (
            <Card key={idx} variant="outlined" shadow="none" padding={3}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 12,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  담당자 {idx + 1}
                </span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <label
                    style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}
                  >
                    <input
                      type="radio"
                      name="primary-contact"
                      checked={row.isPrimary}
                      onChange={() => setPrimary(idx)}
                    />
                    주 담당자
                  </label>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => deleteRow(idx)}
                  >
                    삭제
                  </Button>
                </div>
              </div>
              <FormGrid columns={2} gap="16px">
                <Input
                  label="이름"
                  required
                  placeholder="김영업"
                  value={row.contactName}
                  onChange={(e) => setRow(idx, { contactName: e.target.value })}
                />
                <Input
                  label="직책"
                  placeholder="부장"
                  value={row.position ?? ''}
                  onChange={(e) => setRow(idx, { position: e.target.value })}
                />
                <Input
                  label="휴대전화"
                  required
                  placeholder="010-1234-5678"
                  value={row.phone ?? ''}
                  onChange={(e) => setRow(idx, { phone: e.target.value })}
                />
                <Input
                  label="이메일"
                  type="email"
                  placeholder="sales@example.com"
                  value={row.email ?? ''}
                  onChange={(e) => setRow(idx, { email: e.target.value })}
                />
              </FormGrid>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 공통 스타일
// ---------------------------------------------------------------------------

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  marginBottom: 6,
  color: 'var(--ink-primary, var(--color-text))',
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  height: 36,
  padding: '0 10px',
  border: '1px solid var(--line-default)',
  borderRadius: 6,
  fontSize: 13,
  background: 'var(--surface-card)',
}

const textareaStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid var(--line-default)',
  borderRadius: 6,
  fontSize: 13,
  fontFamily: 'inherit',
  resize: 'vertical',
  boxSizing: 'border-box',
}
