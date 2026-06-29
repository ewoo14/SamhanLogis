import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  Card,
  DataTable,
  FormGrid,
  Input,
  Select,
  Spinner,
  type DataTableColumn,
} from '@samhan/design-system'
import {
  listCodefConnectionAccounts,
  listCodefConnectionCards,
  listCodefConnectionLoans,
  listCodefRegisteredInstitutions,
  registerCodefInstitution,
  type CodefAccountItem,
  type CodefCardItem,
  type CodefConnectionBusinessType,
  type CodefLoanItem,
  type RegisteredInstitutionResponse,
} from '../api/codefConnectionApi'
import { usePageTitle } from '../hooks/usePageTitle'
import styles from './CodefConnectionPage.module.css'

type ResultMode = 'ACCOUNTS' | 'CARDS' | 'LOANS'
type Toast = { type: 'success' | 'error'; message: string } | null

interface RegisterForm {
  businessType: CodefConnectionBusinessType
  organization: string
  loginType: string
  loginId: string
  password: string
}

type ResultRow =
  | ({ kind: 'ACCOUNT' } & CodefAccountItem)
  | ({ kind: 'CARD' } & CodefCardItem)
  | ({ kind: 'LOAN' } & CodefLoanItem)

const EMPTY_FORM: RegisterForm = {
  businessType: 'BANK',
  organization: '',
  loginType: 'ID_PASSWORD',
  loginId: '',
  password: '',
}

const BUSINESS_TYPE_LABEL: Record<CodefConnectionBusinessType, string> = {
  BANK: '은행',
  CARD: '카드',
  LOAN: '대출',
}

const ORGANIZATION_LABEL: Record<string, string> = {
  '0004': '국민은행',
  '088': '신한은행',
  '081': '하나은행',
  '020': '우리은행',
  '0301': '신한카드',
  '0302': '국민카드',
}

function organizationName(code: string): string {
  return ORGANIZATION_LABEL[code] ?? code
}

function formatDateTime(value: string | null): string {
  if (!value) return '-'
  return value.replace('T', ' ').slice(0, 16)
}

function statusLabel(status: string): string {
  switch (status) {
    case 'ACTIVE':
      return '정상'
    case 'ADDITIONAL_AUTH':
      return '추가 인증 필요'
    case 'ERROR':
      return '등록 오류'
    default:
      return '확인 필요'
  }
}

function statusVariant(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  switch (status) {
    case 'ACTIVE':
      return 'success'
    case 'ADDITIONAL_AUTH':
      return 'warning'
    case 'ERROR':
      return 'danger'
    default:
      return 'neutral'
  }
}

function resultModeLabel(mode: ResultMode | null): string {
  switch (mode) {
    case 'ACCOUNTS':
      return '계좌 검증 결과'
    case 'CARDS':
      return '카드 검증 결과'
    case 'LOANS':
      return '대출 검증 결과'
    default:
      return '검증 결과'
  }
}

export function CodefConnectionPage() {
  usePageTitle('CODEF 금융연동')

  const queryClient = useQueryClient()
  const [form, setForm] = useState<RegisterForm>(EMPTY_FORM)
  const [toast, setToast] = useState<Toast>(null)
  const [resultMode, setResultMode] = useState<ResultMode | null>(null)
  const [results, setResults] = useState<ResultRow[]>([])

  const institutionsQuery = useQuery({
    queryKey: ['accounting', 'codef-connection', 'institutions'],
    queryFn: listCodefRegisteredInstitutions,
  })

  const registerMutation = useMutation({
    mutationFn: registerCodefInstitution,
    onSuccess: async () => {
      setForm(EMPTY_FORM)
      setToast({ type: 'success', message: '금융기관 등록을 완료했습니다.' })
      await queryClient.invalidateQueries({ queryKey: ['accounting', 'codef-connection', 'institutions'] })
    },
    onError: () => {
      setToast({ type: 'error', message: '금융기관 등록에 실패했습니다. 입력값과 권한을 확인해 주세요.' })
    },
  })

  const verifyMutation = useMutation({
    mutationFn: async (mode: ResultMode) => {
      if (mode === 'ACCOUNTS') {
        return (await listCodefConnectionAccounts()).map((row) => ({ ...row, kind: 'ACCOUNT' as const }))
      }
      if (mode === 'CARDS') {
        return (await listCodefConnectionCards()).map((row) => ({ ...row, kind: 'CARD' as const }))
      }
      return (await listCodefConnectionLoans()).map((row) => ({ ...row, kind: 'LOAN' as const }))
    },
    onSuccess: (rows, mode) => {
      setResultMode(mode)
      setResults(rows)
      setToast({ type: 'success', message: `${resultModeLabel(mode)}를 조회했습니다.` })
    },
    onError: () => {
      setToast({ type: 'error', message: '검증 조회에 실패했습니다. 잠시 후 다시 시도해 주세요.' })
    },
  })

  const institutionColumns = useMemo<DataTableColumn<RegisteredInstitutionResponse>[]>(() => [
    {
      key: 'organizationCode',
      header: '기관',
      width: '160px',
      mobilePriority: 'primary',
      render: (row) => organizationName(row.organizationCode),
    },
    {
      key: 'businessType',
      header: '구분',
      width: '100px',
      mobilePriority: 'secondary',
      render: (row) => BUSINESS_TYPE_LABEL[row.businessType] ?? row.businessType,
    },
    {
      key: 'status',
      header: '상태',
      width: '130px',
      mobilePriority: 'secondary',
      render: (row) => <Badge variant={statusVariant(row.status)}>{statusLabel(row.status)}</Badge>,
    },
    {
      key: 'registeredAt',
      header: '등록시각',
      width: '150px',
      mobilePriority: 'hidden',
      render: (row) => formatDateTime(row.registeredAt),
    },
  ], [])

  const resultColumns = useMemo<DataTableColumn<ResultRow>[]>(() => [
    {
      key: 'name',
      header: '이름',
      width: '180px',
      mobilePriority: 'primary',
    },
    {
      key: 'provider',
      header: '기관',
      width: '140px',
      mobilePriority: 'secondary',
      render: (row) => {
        if (row.kind === 'ACCOUNT') return row.bankName
        if (row.kind === 'CARD') return row.issuerName
        return row.lenderName
      },
    },
    {
      key: 'number',
      header: '번호/유형',
      width: '180px',
      mobilePriority: 'secondary',
      render: (row) => {
        if (row.kind === 'ACCOUNT') return row.accountNumber
        if (row.kind === 'CARD') return row.cardNumber
        return row.loanType
      },
    },
  ], [])

  function updateForm<K extends keyof RegisterForm>(key: K, value: RegisterForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const organization = form.organization.trim()
    const loginId = form.loginId.trim()
    const password = form.password
    if (!organization || !loginId || !password) {
      setToast({ type: 'error', message: '기관 코드와 로그인 자격을 입력해 주세요.' })
      return
    }
    registerMutation.mutate({
      businessType: form.businessType,
      organization,
      loginType: form.loginType,
      credentials: {
        id: loginId,
        password,
      },
    })
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>CODEF 금융연동</h3>
          <p className={styles.subtitle}>등록한 기관의 계좌와 카드를 검증 조회합니다.</p>
        </div>
        {institutionsQuery.isFetching || verifyMutation.isPending ? <Spinner size="sm" /> : null}
      </div>

      {toast ? (
        <div
          role={toast.type === 'error' ? 'alert' : 'status'}
          className={`${styles.toast} ${toast.type === 'success' ? styles.toastSuccess : styles.toastError}`}
        >
          {toast.message}
        </div>
      ) : null}

      <Card as="section" padding={4}>
        <div className={styles.sectionHeader}>
          <h4 className={styles.sectionTitle}>금융기관 등록</h4>
        </div>
        <form onSubmit={submit}>
          <FormGrid columns={3}>
            <Select
              label="구분"
              required
              value={form.businessType}
              data-testid="codef-connection-business-type"
              onChange={(event) => updateForm('businessType', event.target.value as CodefConnectionBusinessType)}
            >
              <option value="BANK">은행</option>
              <option value="CARD">카드</option>
              <option value="LOAN">대출</option>
            </Select>
            <Input
              label="기관 코드"
              required
              value={form.organization}
              placeholder="예: 0004"
              list="codef-organization-options"
              data-testid="codef-connection-organization"
              onChange={(event) => updateForm('organization', event.target.value)}
            />
            <Select
              label="로그인 방식"
              required
              value={form.loginType}
              data-testid="codef-connection-login-type"
              onChange={(event) => updateForm('loginType', event.target.value)}
            >
              <option value="ID_PASSWORD">아이디/비밀번호</option>
              <option value="CERT">공동인증서</option>
              <option value="API">기관 API</option>
            </Select>
          </FormGrid>
          <datalist id="codef-organization-options">
            <option value="0004">국민은행</option>
            <option value="088">신한은행</option>
            <option value="081">하나은행</option>
            <option value="020">우리은행</option>
            <option value="0301">신한카드</option>
            <option value="0302">국민카드</option>
          </datalist>
          <FormGrid columns={2} className={styles.credentials}>
            <Input
              label="로그인 ID"
              required
              autoComplete="off"
              value={form.loginId}
              data-testid="codef-connection-credential-id"
              onChange={(event) => updateForm('loginId', event.target.value)}
            />
            <Input
              label="비밀번호"
              type="password"
              required
              autoComplete="new-password"
              value={form.password}
              data-testid="codef-connection-credential-password"
              onChange={(event) => updateForm('password', event.target.value)}
            />
          </FormGrid>
          <div className={styles.actions}>
            <Button
              type="submit"
              variant="primary"
              loading={registerMutation.isPending}
              data-testid="codef-connection-register-button"
            >
              등록
            </Button>
          </div>
        </form>
      </Card>

      <Card as="section" padding={4}>
        <div className={styles.sectionHeader}>
          <h4 className={styles.sectionTitle}>등록기관 목록</h4>
          <div className={styles.buttonRow}>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => verifyMutation.mutate('ACCOUNTS')}
              loading={verifyMutation.isPending && verifyMutation.variables === 'ACCOUNTS'}
              data-testid="codef-connection-list-accounts"
            >
              계좌 조회
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => verifyMutation.mutate('CARDS')}
              loading={verifyMutation.isPending && verifyMutation.variables === 'CARDS'}
              data-testid="codef-connection-list-cards"
            >
              카드 조회
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => verifyMutation.mutate('LOANS')}
              loading={verifyMutation.isPending && verifyMutation.variables === 'LOANS'}
              data-testid="codef-connection-list-loans"
            >
              대출 조회
            </Button>
          </div>
        </div>
        <div data-testid="codef-connection-institution-table">
          <DataTable<RegisteredInstitutionResponse>
            columns={institutionColumns}
            rows={institutionsQuery.data ?? []}
            loading={institutionsQuery.isLoading}
            rowKey={(row) => `${row.businessType}|${row.organizationCode}|${row.accountIdentifier ?? ''}`}
            emptyMessage="등록된 금융기관이 없습니다."
          />
        </div>
      </Card>

      <Card as="section" padding={4}>
        <div className={styles.sectionHeader}>
          <h4 className={styles.sectionTitle}>{resultModeLabel(resultMode)}</h4>
        </div>
        <div data-testid="codef-connection-result-table">
          <DataTable<ResultRow>
            columns={resultColumns}
            rows={results}
            loading={verifyMutation.isPending}
            rowKey={(row) => `${row.kind}|${row.ref}`}
            emptyMessage={resultMode === null
              ? '계좌·카드·대출 조회 버튼을 눌러 결과를 확인하세요.'
              : '조회된 항목이 없습니다.'}
          />
        </div>
      </Card>
    </div>
  )
}
