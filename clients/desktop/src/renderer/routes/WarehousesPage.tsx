/**
 * 창고 목록 화면 — `DataTable` + 신규 등록 `Modal`.
 *
 * - 표시 컬럼: code / name / type(Badge) / displayOrder
 * - 신규 등록 버튼은 `MASTER/MANAGER/DEVELOPER` 권한에서만 노출
 * - 등록 성공 시 `queryClient.invalidateQueries(['warehouses'])` 로 목록 재조회
 */
import { useState, type FormEvent } from 'react'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  Badge,
  Button,
  DataTable,
  FormField,
  Modal,
  type DataTableColumn,
} from '@samhan/design-system'
import {
  listWarehouses,
  createWarehouse,
  type Warehouse,
  type WarehouseType,
} from '../api/inventory'
import { useSessionStore, hasAdminRole } from '../stores/session'
import { usePageTitle } from '../hooks/usePageTitle'
import axios from 'axios'

/**
 * 창고 분류 enum 표시용 한국어 라벨.
 * @internal — Badge 안 텍스트 보강.
 */
const TYPE_LABEL: Record<WarehouseType, string> = {
  HEADQUARTERS: '본사',
  VEHICLE: '차량',
  CONSIGNMENT: '위탁',
  VIRTUAL: '가상',
}

/**
 * 분류별 Badge variant 매핑 — 디자인 시스템 5종 variant 안에서 색상 구분.
 * @internal
 */
const TYPE_VARIANT: Record<
  WarehouseType,
  'brand' | 'neutral' | 'success' | 'warning' | 'danger'
> = {
  HEADQUARTERS: 'brand',
  VEHICLE: 'success',
  CONSIGNMENT: 'neutral',
  VIRTUAL: 'warning',
}

export function WarehousesPage() {
  usePageTitle('창고 관리')
  const role = useSessionStore((s) => s.auth?.role)
  const canEdit = hasAdminRole(role)
  const [modalOpen, setModalOpen] = useState(false)
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['warehouses'],
    queryFn: listWarehouses,
  })

  const columns: DataTableColumn<Warehouse>[] = [
    { key: 'code', header: '코드', width: '120px' },
    { key: 'name', header: '창고명' },
    {
      key: 'type',
      header: '분류',
      width: '120px',
      render: (row) => (
        <Badge variant={TYPE_VARIANT[row.type]}>{TYPE_LABEL[row.type]}</Badge>
      ),
    },
    {
      key: 'displayOrder',
      header: '표시 순서',
      width: '100px',
      align: 'right',
    },
    { key: 'address', header: '주소' },
  ]

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
        <h3 style={{ margin: 0 }}>창고 목록</h3>
        {canEdit ? (
          <Button variant="primary" onClick={() => setModalOpen(true)}>
            신규 창고 등록
          </Button>
        ) : null}
      </div>

      <DataTable
        columns={columns}
        rows={Array.isArray(query.data) ? query.data : []}
        loading={query.isLoading}
        rowKey={(w) => w.id}
        emptyMessage="등록된 창고가 없습니다."
      />

      {modalOpen ? (
        <CreateWarehouseModal
          onClose={() => setModalOpen(false)}
          onCreated={() => {
            void queryClient.invalidateQueries({ queryKey: ['warehouses'] })
            setModalOpen(false)
          }}
        />
      ) : null}
    </>
  )
}

interface CreateWarehouseModalProps {
  onClose: () => void
  onCreated: () => void
}

/**
 * 신규 창고 등록 모달 — 4 개 필드 폼.
 * 권한 부족 (403) 또는 code 중복 (409) 시 빨간 배너로 메시지 노출.
 */
function CreateWarehouseModal({ onClose, onCreated }: CreateWarehouseModalProps) {
  const [name, setName] = useState('')
  const [type, setType] = useState<WarehouseType>('HEADQUARTERS')
  const [address, setAddress] = useState('')

  // 1a (2026-05): 창고 코드는 backend 가 자동 생성 (WH-XXXXXX). 사용자 입력 필드 제거.
  const mutation = useMutation({
    mutationFn: () =>
      createWarehouse({
        name: name.trim(),
        type,
        address: address.trim() || undefined,
      }),
    onSuccess: () => onCreated(),
  })

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (mutation.isPending) return
    mutation.mutate()
  }

  const errorMessage = (() => {
    if (!mutation.isError) return null
    const err = mutation.error
    if (axios.isAxiosError(err)) {
      const data = err.response?.data as { message?: string } | undefined
      return data?.message ?? '창고 생성에 실패했습니다.'
    }
    return '알 수 없는 오류'
  })()

  return (
    <Modal
      open
      onClose={onClose}
      title="신규 창고 등록"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button
            variant="primary"
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={!name.trim()}
          >
            등록
          </Button>
        </>
      }
    >
      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <div
          style={{
            padding: '8px 12px',
            background: '#f3f4f6',
            border: '1px solid #d1d5db',
            borderRadius: 4,
            fontSize: 12,
            color: '#4b5563',
          }}
          data-testid="warehouse-code-autogen-notice"
        >
          창고 코드는 등록 시 시스템이 자동 부여합니다 (예: <code>WH-7K2P9X</code>).
        </div>
        <FormField
          label="창고명"
          required
          render={({ id }) => (
            <input
              id={id}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              style={inputStyle}
            />
          )}
        />
        <FormField
          label="분류"
          required
          render={({ id }) => (
            <select
              id={id}
              value={type}
              onChange={(e) => setType(e.target.value as WarehouseType)}
              style={inputStyle}
            >
              <option value="HEADQUARTERS">본사</option>
              <option value="VEHICLE">차량</option>
              <option value="CONSIGNMENT">위탁</option>
              <option value="VIRTUAL">가상</option>
            </select>
          )}
        />
        <FormField
          label="주소"
          render={({ id }) => (
            <input
              id={id}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              maxLength={255}
              style={inputStyle}
            />
          )}
        />
        {errorMessage ? (
          <div className="error-banner" role="alert">
            {errorMessage}
          </div>
        ) : null}
      </form>
    </Modal>
  )
}

const inputStyle = {
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid var(--color-neutral-300)',
  fontSize: 14,
} as const
